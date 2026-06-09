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

  const hint = await post(`${app.url}api/hint`, { level: "nudge" });
  if (!hint.response.ok || !hint.data.text) {
    throw new Error(`Hint failed: ${JSON.stringify(hint.data)}`);
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

  const legal = await post(`${relayApp.url}api/move`, { uci: "e2e4" });
  if (!legal.response.ok || legal.data.coach.live.state !== "playing_waiting_for_coach") {
    throw new Error(`Relay coach request was not created: ${JSON.stringify(legal.data.coach)}`);
  }
  const liveRequestId = legal.data.coach.live.requestId;
  const relay = relayStore.findOpenRelay();
  const liveMessages = relayStore.pollEvents({
    relayId: relay.relayId,
    client: "agent",
    cursor: 0,
    types: ["relay.message"],
  });
  if (!liveMessages[0]?.payload?.markdown || liveMessages[0].payload.kind !== "chess.live_coach") {
    throw new Error(`Relay message was not a markdown coach packet: ${JSON.stringify(liveMessages[0]?.payload)}`);
  }

  const blocked = await post(`${relayApp.url}api/move`, { uci: "f2f3" });
  if (blocked.response.ok || blocked.response.status !== 409) {
    throw new Error(`Move was not blocked while coach was pending: ${JSON.stringify(blocked.data)}`);
  }

  const bypassed = await post(`${relayApp.url}api/coach/bypass`, {});
  if (!bypassed.response.ok || bypassed.data.coach.live.state !== "coach_bypassed") {
    throw new Error(`Coach bypass failed: ${JSON.stringify(bypassed.data.coach)}`);
  }

  const secondMove = await post(`${relayApp.url}api/move`, { uci: "f2f3" });
  if (!secondMove.response.ok || secondMove.data.coach.live.state !== "playing_waiting_for_coach") {
    throw new Error(`Second coach request was not created: ${JSON.stringify(secondMove.data.coach)}`);
  }

  replyTo(liveRequestId, {
      schemaVersion: 1,
      requestId: liveRequestId,
      mode: "live",
      title: "Old Card",
      bodyMarkdown: "This bypassed reply should not render.",
      priority: "normal",
      staleIfFenChanged: true,
  });

  const currentLiveRequestId = secondMove.data.coach.live.requestId;
  replyTo(currentLiveRequestId, {
      schemaVersion: 1,
      requestId: currentLiveRequestId,
      mode: "live",
      title: "Coach",
      bodyMarkdown: "Develop calmly and check Black's direct threat.",
      priority: "normal",
      staleIfFenChanged: true,
      conceptTags: ["development"],
  });

  const coached = await waitForState(
    relayApp.url,
    (state) => state.coach.live.state === "playing_ready" && state.coach.live.card?.title === "Coach",
    "Coach reply was not synced",
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
  const closePending = await post(`${relayApp.url}api/move`, { uci: "e2e4" });
  if (!closePending.response.ok || closePending.data.coach.live.state !== "playing_waiting_for_coach") {
    throw new Error(`Close recovery setup failed: ${JSON.stringify(closePending.data.coach.live)}`);
  }
  relayStore.closeRelay({
    reason: "smoke-close",
    payload: { source: "smoke" },
  });
  await waitForState(
    relayApp.url,
    (state) => !state.coach.enabled && state.coach.live.state === "playing_ready",
    "Relay close did not unblock live play",
  );
  const unblockedMove = await post(`${relayApp.url}api/move`, { uci: "f2f3" });
  if (!unblockedMove.response.ok) {
    throw new Error(`Move stayed blocked after Relay close: ${JSON.stringify(unblockedMove.data)}`);
  }
  const relaySession = JSON.parse(await readFile(path.join(relayDataRoot, "sessions", "current.json"), "utf8"));
  if (Object.hasOwn(relaySession.coach || {}, "replyAfter")) {
    throw new Error(`Relay cursor state leaked into chess session: ${JSON.stringify(relaySession.coach)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    gameId: cardReady.gameId,
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
