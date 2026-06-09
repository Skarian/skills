#!/usr/bin/env node
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../src/server.mjs";
import { RelayStore } from "../../../general/relay/src/store.mjs";
import { startRelayServer } from "../../../general/relay/src/server.mjs";

async function mustExist(filePath) {
  await access(filePath);
  return filePath;
}

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

async function waitForState(baseUrl, predicate, label) {
  const deadline = Date.now() + 5000;
  let state = null;
  while (Date.now() < deadline) {
    state = await (await fetch(`${baseUrl}api/state`)).json();
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}: ${JSON.stringify(state)}`);
}

function assertNoLivePacketLeak(payload) {
  if (!payload?.request || !payload.position || !payload.analysis || !payload.constraints) {
    throw new Error(`Live packet is missing compact sections: ${JSON.stringify(payload)}`);
  }
  if (Object.hasOwn(payload, "data")) {
    throw new Error(`Live packet used old data wrapper: ${JSON.stringify(payload)}`);
  }
  const text = JSON.stringify(payload).toLowerCase();
  for (const forbidden of ["pgn", "bestmove", "best move", "principal variation", "\"pv\"", "raw", "\"profile\""]) {
    if (text.includes(forbidden)) {
      throw new Error(`Live packet leaked ${forbidden}: ${JSON.stringify(payload)}`);
    }
  }
}

const dataRoot = await mkdtemp(path.join(os.tmpdir(), "chess-skill-smoke-"));
const app = await startServer({ dataRoot, relayEnabled: false, maiaStub: true, stockfishStub: true, port: 0, quiet: true });

try {
  const stateResponse = await fetch(`${app.url}api/state`);
  const initial = await stateResponse.json();
  if (!initial.gameId || initial.turn !== "w") {
    throw new Error("Initial state is invalid");
  }

  const legal = await post(`${app.url}api/move`, { uci: "e2e4" });
  if (!legal.response.ok || legal.data.turn !== "w" || legal.data.history.length !== 2) {
    throw new Error(`Legal move failed: ${JSON.stringify(legal.data)}`);
  }

  const illegal = await post(`${app.url}api/move`, { uci: "e2e5" });
  if (illegal.response.ok || illegal.response.status !== 400) {
    throw new Error(`Illegal move was not cleanly rejected: ${JSON.stringify(illegal.data)}`);
  }

  const coach = await post(`${app.url}api/coach/message`, { text: "stuck" });
  if (!coach.response.ok || coach.data.coach.live.transcript.filter((entry) => entry.role === "coach").length !== 1) {
    throw new Error(`Local coach fallback failed: ${JSON.stringify(coach.data.coach?.live)}`);
  }

  const legacyHint = await post(`${app.url}api/hint`, { level: "nudge" });
  if (legacyHint.response.status !== 410) {
    throw new Error(`Legacy hint endpoint did not return 410: ${JSON.stringify(legacyHint.data)}`);
  }

  const legacyBypass = await post(`${app.url}api/coach/bypass`, {});
  if (legacyBypass.response.status !== 410) {
    throw new Error(`Legacy bypass endpoint did not return 410: ${JSON.stringify(legacyBypass.data)}`);
  }

  const review = await post(`${app.url}api/review`, {});
  if (!review.response.ok || !review.data.gameId) {
    throw new Error(`Review failed: ${JSON.stringify(review.data)}`);
  }

  const session = JSON.parse(await readFile(path.join(dataRoot, "sessions", "current.json"), "utf8"));
  await mustExist(path.join(dataRoot, "reviews", `${session.gameId}.json`));
  await mustExist(path.join(dataRoot, "progress.ndjson"));
  await mustExist(path.join(dataRoot, "events.ndjson"));

  console.log(JSON.stringify({
    ok: true,
    gameId: session.gameId,
    cleaned: true,
  }, null, 2));
} finally {
  await app.close();
  await rm(dataRoot, { recursive: true, force: true });
}

const relayDataRoot = await mkdtemp(path.join(os.tmpdir(), "chess-skill-relay-smoke-"));
const relayRoot = await mkdtemp(path.join(os.tmpdir(), "relay-chess-smoke-"));
const relayService = await startRelayServer({ root: relayRoot, port: 0 });
const relayStore = new RelayStore({ root: relayRoot });
const relayAppName = "chess-smoke";
const originalRelayDataDir = process.env.RELAY_DATA_DIR;
process.env.RELAY_DATA_DIR = relayRoot;
let relayApp = null;

function replyTo(requestId, payload) {
  const relay = relayStore.findOpenRelay();
  return relayStore.replyToRelay({
    relayId: relay.relayId,
    payload,
    ackThrough: requestId,
  });
}

function agentMessages() {
  const relay = relayStore.findOpenRelay();
  return relayStore.pollEvents({
    relayId: relay.relayId,
    client: "agent",
    cursor: 0,
    types: ["relay.message"],
    limit: 100,
  });
}

function latestAgentMessage() {
  const messages = agentMessages();
  return messages[messages.length - 1];
}

try {
  relayApp = await startServer({
    dataRoot: relayDataRoot,
    relayUrl: relayService.url,
    relayEnabled: true,
    relayAppName,
    maiaStub: true,
    stockfishStub: true,
    port: 0,
    quiet: true,
  });

  const firstChat = await post(`${relayApp.url}api/coach/message`, { text: "stuck" });
  if (!firstChat.response.ok || firstChat.data.coach.live.state !== "pending") {
    throw new Error(`Chat request did not create pending state: ${JSON.stringify(firstChat.data.coach?.live)}`);
  }
  const firstRequestId = Object.keys(firstChat.data.coach.live.pendingRequests)[0];
  const firstPacket = latestAgentMessage()?.payload;
  if (latestAgentMessage()?.payload?.kind !== "chess.live_coach") {
    throw new Error(`Relay message was not a live coach packet: ${JSON.stringify(latestAgentMessage()?.payload)}`);
  }
  assertNoLivePacketLeak(firstPacket);

  const legalWhilePending = await post(`${relayApp.url}api/move`, { uci: "e2e4" });
  if (!legalWhilePending.response.ok || legalWhilePending.data.history.length !== 2) {
    throw new Error(`Move was blocked while coach was pending: ${JSON.stringify(legalWhilePending.data)}`);
  }

  replyTo(firstRequestId, { message: "This stale reply should not render." });
  await waitForState(
    relayApp.url,
    (state) => !state.coach.live.transcript.some((entry) => entry.text === "This stale reply should not render."),
    "Stale reply rendered",
  );

  const cardChat = await post(`${relayApp.url}api/coach/message`, { text: "more" });
  if (!cardChat.response.ok) {
    throw new Error(`Second chat request failed: ${JSON.stringify(cardChat.data)}`);
  }
  const cardRequestId = Object.keys(cardChat.data.coach.live.pendingRequests).find((id) => cardChat.data.coach.live.pendingRequests[id].status === "pending");
  replyTo(cardRequestId, {
    title: "Old Card",
    bodyMarkdown: "This old card payload should not render.",
    actions: [],
  });
  await waitForState(
    relayApp.url,
    (state) => state.coach.live.status.kind === "filtered" &&
      !state.coach.live.transcript.some((entry) => entry.text === "This old card payload should not render."),
    "Old card payload was not rejected",
  );

  const validChat = await post(`${relayApp.url}api/coach/message`, { text: "why" });
  if (!validChat.response.ok) {
    throw new Error(`Valid chat request failed: ${JSON.stringify(validChat.data)}`);
  }
  const validRequestId = Object.keys(validChat.data.coach.live.pendingRequests).find((id) => validChat.data.coach.live.pendingRequests[id].status === "pending");
  replyTo(validRequestId, { message: "What threat did Black create, and which forcing move addresses it?" });
  const coached = await waitForState(
    relayApp.url,
    (state) => state.coach.live.transcript.some((entry) => entry.role === "coach" && entry.text.includes("What threat")),
    "Valid coach reply was not displayed",
  );

  await post(`${relayApp.url}api/new-game`, {});
  const emptyChat = await post(`${relayApp.url}api/coach/message`, { text: "stuck" });
  const emptyRequestId = Object.keys(emptyChat.data.coach.live.pendingRequests)[0];
  replyTo(emptyRequestId, { message: "" });
  await waitForState(
    relayApp.url,
    (state) => state.coach.live.transcript.filter((entry) => entry.role === "coach").length === 0,
    "Empty coach reply displayed a transcript item",
  );

  const revealDenied = await post(`${relayApp.url}api/coach/message`, { text: "reveal" });
  if (!revealDenied.response.ok) {
    throw new Error(`Reveal gate request failed: ${JSON.stringify(revealDenied.data)}`);
  }
  const revealPacket = latestAgentMessage().payload;
  if (revealPacket.request.revealPermission || revealPacket.request.ladderStep === "gated_reveal") {
    throw new Error(`Reveal was allowed too early: ${JSON.stringify(revealPacket.request)}`);
  }
  const revealRequestId = Object.keys(revealDenied.data.coach.live.pendingRequests).find((id) => revealDenied.data.coach.live.pendingRequests[id].status === "pending");
  replyTo(revealRequestId, { message: "" });
  await waitForState(
    relayApp.url,
    (state) => !state.coach.live.pendingRequests[revealRequestId],
    "Reveal-denied request did not clear",
  );

  const reviewState = await post(`${relayApp.url}api/review`, {});
  if (!reviewState.response.ok || reviewState.data.coach.review.state !== "review_planning") {
    throw new Error(`Review plan request was not created: ${JSON.stringify(reviewState.data.coach.review)}`);
  }
  const planRequestId = reviewState.data.coach.review.planRequestId;
  replyTo(planRequestId, {
    schemaVersion: 1,
    requestId: planRequestId,
    mode: "review_plan",
    title: "Review Plan",
    bodyMarkdown: "Review the first loose move.",
    priority: "normal",
    staleIfFenChanged: false,
    reviewItems: [{
      ply: 1,
      uci: "e2e4",
      san: "e4",
      title: "Opening baseline",
      reason: "Use the first move to test card generation.",
      priority: "normal",
      conceptTags: ["opening"],
    }],
    levelRecommendation: {
      nextMaiaElo: 700,
      rationale: "Smoke-test recommendation.",
    },
  });

  const planned = await waitForState(
    relayApp.url,
    (state) => state.coach.review.items[0]?.requestId && state.coach.review.items[0]?.state === "review_card_loading",
    "Review card request was not created",
  );
  const reviewItem = planned.coach.review.items[0];
  replyTo(reviewItem.requestId, {
    schemaVersion: 1,
    requestId: reviewItem.requestId,
    mode: "review_card",
    title: "Opening baseline",
    bodyMarkdown: "This card explains the selected review item.",
    priority: "normal",
    staleIfFenChanged: false,
    conceptTags: ["opening"],
  });

  const cardReady = await waitForState(
    relayApp.url,
    (state) => state.coach.review.items[0]?.state === "review_card_ready",
    "Review card was not synced",
  );

  const feedback = await post(`${relayApp.url}api/review/feedback`, { index: 0, value: "got_it" });
  if (!feedback.response.ok || feedback.data.coach.review.items[0]?.feedback?.value !== "got_it") {
    throw new Error(`Review feedback failed: ${JSON.stringify(feedback.data)}`);
  }

  const accepted = await post(`${relayApp.url}api/review/accept-level`, {});
  if (!accepted.response.ok || accepted.data.profile.currentMaiaElo !== 700) {
    throw new Error(`Level recommendation accept failed: ${JSON.stringify(accepted.data.profile)}`);
  }

  await post(`${relayApp.url}api/new-game`, {});
  const closePending = await post(`${relayApp.url}api/coach/message`, { text: "stuck" });
  if (!closePending.response.ok || closePending.data.coach.live.state !== "pending") {
    throw new Error(`Close recovery setup failed: ${JSON.stringify(closePending.data.coach.live)}`);
  }
  relayStore.closeRelay({
    reason: "smoke-close",
    payload: { source: "smoke" },
  });
  await waitForState(
    relayApp.url,
    (state) => !state.coach.enabled && state.coach.live.state === "disabled",
    "Relay close did not disable live coach",
  );
  const unblockedMove = await post(`${relayApp.url}api/move`, { uci: "e2e4" });
  if (!unblockedMove.response.ok) {
    throw new Error(`Move failed after Relay close: ${JSON.stringify(unblockedMove.data)}`);
  }
  const relaySession = JSON.parse(await readFile(path.join(relayDataRoot, "sessions", "current.json"), "utf8"));
  if (Object.hasOwn(relaySession.coach || {}, "replyAfter")) {
    throw new Error(`Relay cursor state leaked into chess session: ${JSON.stringify(relaySession.coach)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    gameId: cardReady.gameId || coached.gameId,
    relayAppName,
    cleaned: true,
  }, null, 2));
} finally {
  if (originalRelayDataDir === undefined) delete process.env.RELAY_DATA_DIR;
  else process.env.RELAY_DATA_DIR = originalRelayDataDir;
  if (relayApp) await relayApp.close();
  relayStore.close();
  await relayService.close();
  await rm(relayDataRoot, { recursive: true, force: true });
  await rm(relayRoot, { recursive: true, force: true });
}
