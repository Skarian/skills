const $ = (id) => document.getElementById(id);
let selectedRelayId = null;
let relays = [];
let replies = [];
const afterByRelay = new Map();

async function api(path, body) {
  const hasBody = arguments.length > 1;
  const res = await fetch(path, {
    method: hasBody ? "POST" : "GET",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || `HTTP ${res.status}`);
  return value;
}

function payload() {
  const text = $("payload").value.trim();
  return text ? JSON.parse(text) : {};
}

function selectedRelay() {
  return relays.find((relay) => relay.relayId === selectedRelayId) || null;
}

function selectedAfter() {
  return afterByRelay.get(selectedRelayId) || 0;
}

function requireRelay() {
  const relay = selectedRelay();
  if (!relay) throw new Error("Select a relay first.");
  return relay;
}

function render(message = "Ready.") {
  const relay = selectedRelay();
  $("status").textContent = message;
  $("relay").textContent = relay
    ? JSON.stringify({ ...relay, after: selectedAfter() }, null, 2)
    : "No relay";
  $("replies").textContent = replies.length ? JSON.stringify(replies, null, 2) : "No replies";
}

function renderRelayOptions() {
  $("relays").replaceChildren(...relays.map((relay) => {
    const option = document.createElement("option");
    option.value = relay.relayId;
    option.textContent = `${relay.appName} ${relay.state || relay.lifecycle} ${relay.relayId}`;
    option.selected = relay.relayId === selectedRelayId;
    return option;
  }));
}

async function refresh() {
  const result = await api("/api/relays?limit=10");
  relays = result.relays;
  if (!relays.some((relay) => relay.relayId === selectedRelayId)) {
    selectedRelayId = relays.find((relay) => relay.lifecycle === "open")?.relayId || relays[0]?.relayId || null;
  }
  renderRelayOptions();
  render();
}

async function openRelay() {
  const result = await api("/api/relay/open", {
    appName: $("app-name").value.trim(),
    payload: { source: "smoke-page" },
  });
  selectedRelayId = result.relayId;
  afterByRelay.set(selectedRelayId, result.after);
  await refresh();
  render("Opened.");
}

async function send() {
  const relay = requireRelay();
  const result = await api("/api/relay/send", {
    relayId: relay.relayId,
    payload: payload(),
  });
  render(`Sent ${result.event.seq}.`);
}

async function receive() {
  const relay = requireRelay();
  render("Waiting for an agent reply or close...");
  const result = await api("/api/relay/receive", {
    relayId: relay.relayId,
    after: selectedAfter(),
  });
  if (result.items.length) {
    afterByRelay.set(relay.relayId, result.nextAfter);
    replies.push(...result.items);
    await api("/api/relay/received", {
      relayId: relay.relayId,
      through: result.nextAfter,
    });
  }
  await refresh();
  render(`Received ${result.items.length}.`);
}

async function closeRelay() {
  const relay = requireRelay();
  await api("/api/relay/close", {
    relayId: relay.relayId,
    reason: "smoke-page-closed",
    payload: { source: "smoke-page" },
  });
  await refresh();
  render("Closed.");
}

for (const [id, fn] of Object.entries({ open: openRelay, refresh, send, receive, close: closeRelay })) {
  $(id).addEventListener("click", () => fn().catch((error) => render(error.message)));
}

$("relays").addEventListener("change", (event) => {
  selectedRelayId = event.target.value || null;
  render();
});

refresh().catch((error) => render(error.message));
