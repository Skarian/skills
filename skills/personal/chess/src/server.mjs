import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import {
  appendEvent,
  appendProgress,
  chessDataRoot,
  dataPaths,
  ensureDataLayout,
  readJson,
  timestampId,
  writeJson,
} from "./data.mjs";
import { MaiaEngine, moveToUci, pickStubMove, uciToMove } from "./maia.mjs";
import { scoreForWhite, StockfishEngine } from "./stockfish.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(skillRoot, "public");
const DEFAULT_MAIA_ELO = 600;
const COACH_BYPASS_MS = 20000;

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".ico", "image/x-icon"],
]);

async function loadRelayClientFactory() {
  const relayRoot = path.resolve(process.env.RELAY_DATA_DIR || path.join(os.homedir(), ".skills", "relay"));
  const clientPath = path.join(relayRoot, "client.mjs");
  const module = await import(pathToFileURL(clientPath));
  if (typeof module.createRelayClient !== "function") {
    throw new Error(`Relay client missing createRelayClient: ${clientPath}`);
  }
  return module.createRelayClient;
}

function jsonResponse(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function textResponse(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function safeJoin(root, requestPath) {
  const resolved = path.resolve(root, requestPath.replace(/^\/+/, ""));
  if (!resolved.startsWith(path.resolve(root))) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function gameStatus(game) {
  if (!game.isGameOver()) {
    return { gameOver: false, result: "*", reason: null };
  }
  if (game.isCheckmate()) {
    return { gameOver: true, result: game.turn() === "w" ? "0-1" : "1-0", reason: "checkmate" };
  }
  if (game.isStalemate()) {
    return { gameOver: true, result: "1/2-1/2", reason: "stalemate" };
  }
  if (game.isThreefoldRepetition()) {
    return { gameOver: true, result: "1/2-1/2", reason: "threefold_repetition" };
  }
  if (game.isInsufficientMaterial()) {
    return { gameOver: true, result: "1/2-1/2", reason: "insufficient_material" };
  }
  if (game.isDraw()) {
    return { gameOver: true, result: "1/2-1/2", reason: "draw" };
  }
  return { gameOver: true, result: "*", reason: "game_over" };
}

function createGameFromMoves(uciMoves) {
  const game = new Chess();
  for (const uci of uciMoves) {
    game.move(uciToMove(uci));
  }
  return game;
}

function serializeSession(session, game, profile) {
  return {
    gameId: session.gameId,
    startedAt: session.startedAt,
    updatedAt: new Date().toISOString(),
    maia: session.maia,
    userColor: "white",
    clock: null,
    hintsEnabled: true,
    fen: game.fen(),
    pgn: game.pgn(),
    turn: game.turn(),
    legalMoves: game.moves(),
    history: game.history({ verbose: true }),
    uciMoves: session.uciMoves,
    plies: session.plies,
    hints: session.hints,
    review: session.review,
    coach: session.coach || defaultCoachState(),
    status: gameStatus(game),
    profile,
  };
}

function newSession(profile) {
  return {
    gameId: timestampId("game"),
    startedAt: new Date().toISOString(),
    maia: {
      elo: Number(profile?.currentMaiaElo || profile?.assignedMaiaElo || process.env.CHESS_MAIA_ELO || DEFAULT_MAIA_ELO),
      model: process.env.CHESS_MAIA_MODEL || profile?.maiaModel || "maia3-79m",
      device: process.env.CHESS_MAIA_DEVICE || profile?.maiaDevice || "cpu",
    },
    uciMoves: [],
    plies: [],
    hints: [],
    review: null,
    coach: defaultCoachState(),
  };
}

function defaultProfile() {
  return {
    createdAt: new Date().toISOString(),
    currentMaiaElo: Number(process.env.CHESS_MAIA_ELO || DEFAULT_MAIA_ELO),
    maiaModel: process.env.CHESS_MAIA_MODEL || "maia3-79m",
    maiaDevice: process.env.CHESS_MAIA_DEVICE || "cpu",
    notes: "Default profile. Run npm run profile after intake to personalize.",
  };
}

function classifyBestMove(game, bestmove) {
  if (!bestmove || bestmove === "(none)") {
    return "quiet";
  }
  const copy = new Chess(game.fen());
  const move = copy.move(uciToMove(bestmove));
  if (!move) {
    return "candidate";
  }
  if (move.san.includes("#")) return "mate";
  if (move.san.includes("+")) return "check";
  if (move.flags.includes("c") || move.flags.includes("e")) return "capture";
  if (move.piece !== "p") return "piece_activity";
  return "quiet";
}

function hintText(level, theme, analysis) {
  if (level === "reveal") {
    const firstLine = analysis.lines[0]?.pv?.join(" ") || analysis.bestmove || "none";
    return `Best candidate: ${analysis.bestmove}. Principal line: ${firstLine}.`;
  }
  const nudgeByTheme = {
    mate: "There is a forcing resource in the position.",
    check: "Start by checking forcing moves.",
    capture: "A capture or material tactic deserves attention.",
    piece_activity: "One piece can become more active with tempo.",
    candidate: "Compare forcing candidates before choosing a quiet move.",
    quiet: "Slow down and check your opponent's threat before improving your worst piece.",
  };
  const directionByTheme = {
    mate: "Look first at forcing king moves: checks, captures near the king, and mating nets.",
    check: "The strongest idea begins with a check or direct forcing move.",
    capture: "Focus on loose material and whether a capture changes the forcing sequence.",
    piece_activity: "Look for a developing or improving move that also creates a threat.",
    candidate: "List two candidate moves and reject the one that leaves the biggest tactical problem.",
    quiet: "Choose the move that improves coordination while answering the opponent's most direct threat.",
  };
  return level === "direction" ? directionByTheme[theme] : nudgeByTheme[theme];
}

function reviewDrop(before, after) {
  if (before === null || after === null) {
    return null;
  }
  return before - after;
}

function classifyDrop(drop) {
  if (drop === null) return "unknown";
  if (drop >= 200) return "severe_error";
  if (drop >= 100) return "mistake";
  if (drop >= 50) return "inaccuracy";
  return "ok";
}

function compactAnalysis(analysis) {
  if (!analysis) return null;
  return {
    fen: analysis.fen,
    depth: analysis.depth,
    multipv: analysis.multipv,
    bestmove: analysis.bestmove,
    lines: analysis.lines.map((line) => ({
      multipv: line.multipv || 1,
      score: line.score || null,
      pv: line.pv || [],
    })),
  };
}

function defaultCoachState({ enabled = false, relayAppName = "chess" } = {}) {
  return {
    enabled,
    relayAppName,
    live: {
      state: "playing_ready",
      requestId: null,
      requestedAt: null,
      fen: null,
      card: null,
      history: [],
      bypassAvailableAfterMs: COACH_BYPASS_MS,
      bypassedAt: null,
    },
    review: {
      state: "idle",
      planRequestId: null,
      plan: null,
      items: [],
      currentIndex: 0,
      levelRecommendation: null,
    },
  };
}

function ensureCoachState(session, { enabled = false, relayAppName = "chess" } = {}) {
  session.coach = {
    ...defaultCoachState({ enabled, relayAppName }),
    ...(session.coach || {}),
  };
  session.coach.enabled = enabled;
  session.coach.relayAppName = relayAppName;
  delete session.coach.replyAfter;
  delete session.coach.replyCursor;
  delete session.coach.relayId;
  session.coach.live = {
    ...defaultCoachState({ enabled, relayAppName }).live,
    ...(session.coach.live || {}),
    bypassAvailableAfterMs: COACH_BYPASS_MS,
  };
  session.coach.review = {
    ...defaultCoachState({ enabled, relayAppName }).review,
    ...(session.coach.review || {}),
  };
  return session.coach;
}

function normalizedAgentCard(response, { requestId, mode, fallbackTitle = "Coach" }) {
  const value = response?.card || response?.data || response || {};
  return {
    schemaVersion: Number(value.schemaVersion || 1),
    requestId: value.requestId || requestId,
    mode: value.mode || mode,
    title: value.title || fallbackTitle,
    bodyMarkdown: value.bodyMarkdown || response?.markdown || value.body || value.text || "",
    priority: value.priority || "normal",
    staleIfFenChanged: value.staleIfFenChanged !== false,
    actions: Array.isArray(value.actions) ? value.actions : [],
    conceptTags: Array.isArray(value.conceptTags) ? value.conceptTags : [],
    reveal: value.reveal || null,
    levelRecommendation: value.levelRecommendation || null,
    createdAt: new Date().toISOString(),
  };
}

function reviewItemId(move) {
  return `review-${move.ply}-${move.uci}`;
}

function cardStateFromItems(items) {
  if (!items.length) return "review_complete";
  if (items.every((item) => item.state === "review_card_ready")) return "review_complete";
  if (items.some((item) => item.state === "review_card_ready")) return "review_card_ready";
  return "review_card_loading";
}

export async function startServer(options = {}) {
  const dataRoot = path.resolve(options.dataRoot || chessDataRoot());
  await ensureDataLayout(dataRoot);
  const paths = dataPaths(dataRoot);
  const relayPreferred = options.relayEnabled ?? process.env.CHESS_RELAY !== "0";
  const relayAppName = options.relayAppName || process.env.CHESS_RELAY_APP || "chess";
  const explicitRelayUrl = options.relayUrl || null;
  let relayClient = null;
  let relayReplyLoop = null;
  let relayReplyLoopStopped = false;
  async function connectRelay() {
    if (relayClient || !relayPreferred) return relayClient;
    try {
      const createRelayClient = await loadRelayClientFactory();
      const client = await createRelayClient({
        baseUrl: explicitRelayUrl,
        throwOnMissing: false,
      });
      if (!client) return null;
      relayClient = client;
    } catch {
      relayClient = null;
    }
    return relayClient;
  }
  await connectRelay();
  let profile = await readJson(paths.profile, null);
  if (!profile) {
    profile = defaultProfile();
    await writeJson(paths.profile, profile);
    await appendEvent(dataRoot, "profile_defaulted", { profilePath: paths.profile });
  }

  let session = await readJson(paths.currentSession, null);
  if (!session?.uciMoves || session.status?.gameOver) {
    session = newSession(profile);
  }
  ensureCoachState(session, { enabled: Boolean(relayClient), relayAppName });
  let game = createGameFromMoves(session.uciMoves || []);
  if (relayClient) {
    await ensureRelay();
  }
  const stockfish = new StockfishEngine({
    depth: Number(process.env.CHESS_STOCKFISH_DEPTH || 8),
    multipv: Number(process.env.CHESS_STOCKFISH_MULTIPV || 2),
  });
  const maia = new MaiaEngine({
    dataRoot,
    elo: session.maia.elo,
    model: session.maia.model,
    device: session.maia.device,
  });
  const maiaStub = options.maiaStub ?? process.env.CHESS_MAIA_STUB === "1";
  const stockfishStub = options.stockfishStub ?? process.env.CHESS_STOCKFISH_STUB === "1";

  async function persistSession() {
    await writeJson(paths.currentSession, serializeSession(session, game, profile));
  }

  async function saveGameIfDone() {
    const status = gameStatus(game);
    if (!status.gameOver) {
      return null;
    }
    const pgnPath = path.join(paths.gamesDir, `${session.gameId}.pgn`);
    game.header("Result", status.result);
    await writeFile(pgnPath, `${game.pgn()}\n`);
    await appendEvent(dataRoot, "game_completed", {
      gameId: session.gameId,
      result: status.result,
      reason: status.reason,
      pgnPath,
    });
    return pgnPath;
  }

  async function getOpponentMove() {
    if (maiaStub) {
      return pickStubMove(session.uciMoves);
    }
    return maia.bestMove(session.uciMoves);
  }

  async function analyzeFen(fen, options = {}) {
    if (!stockfishStub) {
      return stockfish.analyzeFen(fen, options);
    }
    const copy = new Chess(fen);
    const moves = copy.moves({ verbose: true });
    const bestmove = moves[0] ? moveToUci(moves[0]) : null;
    return {
      fen,
      depth: options.depth || stockfish.depth,
      multipv: options.multipv || stockfish.multipv,
      bestmove,
      lines: bestmove ? [{
        multipv: 1,
        score: { kind: "cp", value: 0 },
        pv: [bestmove],
      }] : [],
      raw: [],
    };
  }

  function legalMovePayload() {
    return game.moves({ verbose: true }).map((move) => ({
      san: move.san,
      uci: moveToUci(move),
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured || null,
      promotion: move.promotion || null,
    }));
  }

  function baseCoachPayload(extra = {}) {
    const recentCards = session.coach?.live?.history?.slice(-3) || [];
    return {
      schemaVersion: 1,
      gameId: session.gameId,
      maia: session.maia,
      profile,
      status: gameStatus(game),
      fen: game.fen(),
      pgn: game.pgn(),
      turn: game.turn(),
      legalMoves: legalMovePayload(),
      recentPlies: session.plies.slice(-6),
      lastUserMove: [...session.plies].reverse().find((ply) => ply.side === "user") || null,
      lastMaiaMove: [...session.plies].reverse().find((ply) => ply.side === "maia") || null,
      recentHints: session.hints.slice(-5),
      recentCoachCards: recentCards,
      currentMaiaLevel: session.maia.elo,
      ...extra,
    };
  }

  function relayPacket(kind, markdown, data) {
    return { kind, markdown, data };
  }

  function liveCoachMarkdown(data) {
    const help = data.helpLevel ? `Help level: ${data.helpLevel}` : "Help level: default non-spoiler coach card";
    return [
      "# Chess Live Coach Request",
      "",
      help,
      `Game: ${data.gameId}`,
      `Maia level: ${data.currentMaiaLevel}`,
      `Position: ${data.fen}`,
      `PGN: ${data.pgn || "(empty)"}`,
      data.lastUserMove ? `Last user move: ${data.lastUserMove.san} (${data.lastUserMove.uci})` : "Last user move: none",
      data.lastMaiaMove ? `Last Maia move: ${data.lastMaiaMove.san} (${data.lastMaiaMove.uci})` : "Last Maia move: none",
      "",
      "Write a concise coach card for the web UI. Do not reveal best moves, PVs, or eval numbers unless this is a reveal request.",
    ].join("\n");
  }

  function reviewPlanMarkdown(data) {
    return [
      "# Chess Review Plan Request",
      "",
      `Game: ${data.gameId}`,
      `Result: ${data.progressContext.result.result}`,
      `User moves reviewed: ${data.review.summary.userMoveCount}`,
      `Severe errors: ${data.review.summary.severeErrorCount}`,
      "",
      "Choose every mistake that deserves a review card. Include all major mistakes and instructive inaccuracies. No cap.",
    ].join("\n");
  }

  function reviewCardMarkdown(data) {
    return [
      "# Chess Review Card Request",
      "",
      `Game: ${data.gameId}`,
      `Move: ${data.reviewItem.san || data.reviewItem.uci}`,
      `Reason: ${data.reviewItem.reason || "(none)"}`,
      "",
      "Write one clear review card for the selected mistake.",
    ].join("\n");
  }

  async function ensureRelay() {
    const client = await connectRelay();
    if (!client) {
      session.coach.enabled = false;
      return null;
    }
    const setup = await client.openRelay({
      appName: relayAppName,
      payload: { app: "chess", mode: "learn", gameId: session.gameId },
    });
    session.coach.enabled = true;
    await startRelayReplyLoop();
    return setup.relay;
  }

  async function createRelayMessage({ payload }) {
    if (!session.coach?.enabled) return null;
    const relay = await ensureRelay();
    if (!relay || !relayClient) return null;
    const { event } = await relayClient.send(payload);
    return {
      requestId: event.seq,
      eventId: event.eventId,
      payload,
    };
  }

  async function createLiveCoachRequest({ type = "chess.live_coach", helpLevel = null } = {}) {
    if (game.isGameOver() || game.turn() !== "w") return null;
    const analysis = await analyzeFen(game.fen(), {
      depth: Number(process.env.CHESS_COACH_DEPTH || process.env.CHESS_HINT_DEPTH || 7),
      multipv: Number(process.env.CHESS_COACH_MULTIPV || 3),
    });
    const payload = baseCoachPayload({
      kind: type,
      helpLevel,
      privateAnalysis: compactAnalysis(analysis),
      displayPolicy: {
        liveDefault: "non_spoiler",
        allowBestMoveOnlyWhenRequested: helpLevel === "reveal",
      },
    });
    const packet = relayPacket(type, liveCoachMarkdown(payload), payload);
    const request = createRelayMessage({
      payload: packet,
    });
    const resolvedRequest = await request;
    if (!resolvedRequest) return null;
    session.coach.live = {
      ...session.coach.live,
      state: "playing_waiting_for_coach",
      requestId: resolvedRequest.requestId,
      requestType: type,
      requestedAt: new Date().toISOString(),
      fen: game.fen(),
      card: null,
      bypassedAt: null,
    };
    await appendEvent(dataRoot, "coach_request_created", {
      gameId: session.gameId,
      type,
      requestId: resolvedRequest.requestId,
      helpLevel,
    });
    return resolvedRequest;
  }

  async function updateReviewArtifact(mutator) {
    if (!session.review?.path) return null;
    const review = await readJson(session.review.path, null);
    if (!review) return null;
    const next = await mutator(review);
    await writeJson(session.review.path, next || review);
    return next || review;
  }

  function fallbackReviewItems(review) {
    return review.moves
      .filter((move) => ["severe_error", "mistake", "inaccuracy"].includes(move.classification))
      .map((move) => ({
        id: reviewItemId(move),
        ply: move.ply,
        uci: move.uci,
        san: move.san,
        classification: move.classification,
        reason: `${move.classification} selected by fallback review queue.`,
        priority: move.classification === "severe_error" ? "high" : "normal",
        conceptTags: [],
      }));
  }

  async function createReviewPlanRequest(review) {
    const payload = {
      schemaVersion: 1,
      kind: "chess.review_plan",
      gameId: session.gameId,
      maia: session.maia,
      profile,
      pgn: game.pgn(),
      review,
      hints: session.hints,
      progressContext: {
        currentMaiaLevel: session.maia.elo,
        result: gameStatus(game),
      },
    };
    const packet = relayPacket("chess.review_plan", reviewPlanMarkdown(payload), payload);
    const request = createRelayMessage({
      payload: packet,
    });
    const resolvedRequest = await request;
    if (!resolvedRequest) return null;
    session.coach.review = {
      ...session.coach.review,
      state: "review_planning",
      planRequestId: resolvedRequest.requestId,
      plan: null,
      items: [],
      currentIndex: 0,
      levelRecommendation: null,
    };
    await appendEvent(dataRoot, "review_plan_request_created", { gameId: session.gameId, requestId: resolvedRequest.requestId });
    return resolvedRequest;
  }

  async function createNextReviewCardRequest() {
    if (!session.coach?.review?.items?.length) return null;
    const item = session.coach.review.items.find((candidate) => !candidate.requestId);
    if (!item) return null;
    const review = await readJson(session.review?.path, null);
    const move = review?.moves?.find((candidate) => candidate.ply === item.ply && candidate.uci === item.uci) || null;
    const payload = {
      schemaVersion: 1,
      kind: "chess.review_card",
      gameId: session.gameId,
      maia: session.maia,
      profile,
      pgn: game.pgn(),
      reviewItem: item,
      move,
      surroundingPlies: session.plies.filter((ply) => Math.abs(session.plies.indexOf(ply) + 1 - item.ply) <= 3),
      plan: session.coach.review.plan,
    };
    const packet = relayPacket("chess.review_card", reviewCardMarkdown(payload), payload);
    const request = createRelayMessage({
      payload: packet,
    });
    const resolvedRequest = await request;
    if (!resolvedRequest) return null;
    item.requestId = resolvedRequest.requestId;
    item.state = "review_card_loading";
    item.requestedAt = new Date().toISOString();
    session.coach.review.state = cardStateFromItems(session.coach.review.items);
    await appendEvent(dataRoot, "review_card_request_created", {
      gameId: session.gameId,
      requestId: resolvedRequest.requestId,
      reviewItemId: item.id,
    });
    return resolvedRequest;
  }

  async function applyRelayReceive(client, received) {
    const replies = received.items || [];
    let changed = false;
    let closed = false;
    for (const reply of replies) {
      if (reply.status === "closed") {
        session.coach.enabled = false;
        relayClient = null;
        if (session.coach.live?.state === "playing_waiting_for_coach") {
          session.coach.live.state = "playing_ready";
          session.coach.live.requestId = null;
        }
        const reviewState = session.coach.review;
        if (["review_planning", "review_card_loading"].includes(reviewState?.state)) {
          reviewState.state = "review_complete";
        }
        await appendEvent(dataRoot, "relay_closed", { gameId: session.gameId, reason: reply.reason, payload: reply.payload });
        changed = true;
        closed = true;
        continue;
      }
      const inReplyTo = Number(reply.inReplyTo || 0);
      const replyPayload = reply.payload || {};
      const replyData = replyPayload?.data && typeof replyPayload.data === "object" ? replyPayload.data : replyPayload;
      const live = session.coach.live;
      if (live?.requestId && live.state === "playing_waiting_for_coach" && inReplyTo === Number(live.requestId)) {
        const card = normalizedAgentCard(replyPayload, {
          requestId: live.requestId,
          mode: live.requestType === "chess.followup" ? "followup" : "live",
          fallbackTitle: live.requestType === "chess.followup" ? "Coach Follow-Up" : "Coach",
        });
        if (card.staleIfFenChanged && live.fen !== game.fen()) {
          live.state = "playing_ready";
          live.requestId = null;
        } else if (live.bypassedAt) {
          live.requestId = null;
        } else {
          live.state = "playing_ready";
          live.card = card;
          live.history = [...(live.history || []), card].slice(-20);
          await appendEvent(dataRoot, "coach_card_received", { gameId: session.gameId, requestId: live.requestId });
        }
        changed = true;
        continue;
      }

      const reviewState = session.coach.review;
      if (reviewState?.planRequestId && reviewState.state === "review_planning" && inReplyTo === Number(reviewState.planRequestId)) {
        const review = await readJson(session.review?.path, null);
        const selected = Array.isArray(replyData?.reviewItems) && replyData.reviewItems.length
          ? replyData.reviewItems
          : fallbackReviewItems(review || { moves: [] });
        reviewState.plan = {
          schemaVersion: Number(replyData?.schemaVersion || 1),
          requestId: reviewState.planRequestId,
          title: replyData?.title || "Review Plan",
          bodyMarkdown: replyData?.bodyMarkdown || replyPayload?.markdown || "",
          reviewItems: selected,
          createdAt: new Date().toISOString(),
        };
        reviewState.levelRecommendation = replyData?.levelRecommendation || null;
        reviewState.items = selected.map((item) => ({
          id: item.id || reviewItemId(item),
          ply: item.ply,
          uci: item.uci,
          san: item.san,
          title: item.title || item.san || item.uci,
          reason: item.reason || "",
          priority: item.priority || "normal",
          conceptTags: Array.isArray(item.conceptTags) ? item.conceptTags : [],
          state: "review_card_loading",
          requestId: null,
          card: null,
          feedback: null,
        }));
        reviewState.currentIndex = 0;
        reviewState.state = cardStateFromItems(reviewState.items);
        await updateReviewArtifact((artifact) => ({
          ...artifact,
          agentReview: {
            plan: reviewState.plan,
            items: reviewState.items,
            levelRecommendation: reviewState.levelRecommendation,
          },
        }));
        await appendEvent(dataRoot, "review_plan_received", {
          gameId: session.gameId,
          requestId: reviewState.planRequestId,
          itemCount: reviewState.items.length,
        });
        await createNextReviewCardRequest();
        changed = true;
        continue;
      }

      for (const item of session.coach.review?.items || []) {
        if (!item.requestId || item.state === "review_card_ready" || inReplyTo !== Number(item.requestId)) continue;
        item.card = normalizedAgentCard(replyPayload, {
          requestId: item.requestId,
          mode: "review_card",
          fallbackTitle: item.title || "Review",
        });
        item.state = "review_card_ready";
        item.readyAt = new Date().toISOString();
        session.coach.review.state = cardStateFromItems(session.coach.review.items);
        await updateReviewArtifact((artifact) => ({
          ...artifact,
          agentReview: {
            ...(artifact.agentReview || {}),
            plan: session.coach.review.plan,
            items: session.coach.review.items,
            levelRecommendation: session.coach.review.levelRecommendation,
          },
        }));
        await appendEvent(dataRoot, "review_card_received", {
          gameId: session.gameId,
          requestId: item.requestId,
          reviewItemId: item.id,
        });
        await createNextReviewCardRequest();
        changed = true;
        break;
      }
    }
    if (changed) {
      await persistSession();
    }
    await client.received();
    return !closed && session.coach?.enabled;
  }

  async function stopRelayCoachingForError(error) {
    session.coach.enabled = false;
    relayClient = null;
    if (session.coach.live?.state === "playing_waiting_for_coach") {
      session.coach.live.state = "playing_ready";
      session.coach.live.requestId = null;
    }
    const reviewState = session.coach.review;
    if (["review_planning", "review_card_loading"].includes(reviewState?.state)) {
      reviewState.state = "review_complete";
    }
    await appendEvent(dataRoot, "relay_receive_error", { gameId: session.gameId, message: error.message });
    await persistSession();
  }

  async function startRelayReplyLoop() {
    if (relayReplyLoop || relayReplyLoopStopped) return;
    const client = await connectRelay();
    if (!client || !session.coach?.enabled) return;
    relayReplyLoop = (async () => {
      while (!relayReplyLoopStopped && session.coach?.enabled) {
        try {
          const received = await client.receive();
          if (relayReplyLoopStopped) break;
          const keepGoing = await applyRelayReceive(client, received);
          if (!keepGoing) break;
        } catch (error) {
          if (!relayReplyLoopStopped) {
            await stopRelayCoachingForError(error);
          }
          break;
        }
      }
    })().finally(() => {
      relayReplyLoop = null;
    });
  }

  async function syncRelayReplies() {
    await startRelayReplyLoop();
    return false;
  }

  async function handleMove(body) {
    await syncRelayReplies();
    const uci = String(body.uci || "");
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      return { status: 400, body: { error: "Expected UCI move like e2e4." } };
    }
    if (game.turn() !== "w") {
      return { status: 409, body: { error: "It is not White's turn." } };
    }
    if (session.coach?.enabled && session.coach.live?.state === "playing_waiting_for_coach") {
      return { status: 409, body: { error: "Coach guidance is pending. Continue without coach first." } };
    }
    const fenBefore = game.fen();
    let userMove = null;
    try {
      userMove = game.move(uciToMove(uci));
    } catch {
      userMove = null;
    }
    if (!userMove) {
      return { status: 400, body: { error: "Illegal move." } };
    }
    const userUci = moveToUci(userMove);
    session.uciMoves.push(userUci);
    session.plies.push({
      side: "user",
      color: "w",
      uci: userUci,
      san: userMove.san,
      fenBefore,
      fenAfter: game.fen(),
      at: new Date().toISOString(),
    });
    if (session.coach?.live) {
      session.coach.live = {
        ...session.coach.live,
        state: "playing_ready",
        requestId: null,
        requestedAt: null,
        fen: null,
        card: null,
        bypassedAt: null,
      };
    }
    await appendEvent(dataRoot, "user_move", { gameId: session.gameId, uci: userUci, san: userMove.san });

    if (!game.isGameOver()) {
      const maiaUci = await getOpponentMove();
      const maiaFenBefore = game.fen();
      const maiaMove = maiaUci ? game.move(uciToMove(maiaUci)) : null;
      if (!maiaMove) {
        throw new Error(`Maia returned illegal move: ${maiaUci}`);
      }
      const appliedMaiaUci = moveToUci(maiaMove);
      session.uciMoves.push(appliedMaiaUci);
      session.plies.push({
        side: "maia",
        color: "b",
        uci: appliedMaiaUci,
        san: maiaMove.san,
        fenBefore: maiaFenBefore,
        fenAfter: game.fen(),
        at: new Date().toISOString(),
      });
      await appendEvent(dataRoot, "maia_move", {
        gameId: session.gameId,
        uci: appliedMaiaUci,
        san: maiaMove.san,
        stub: maiaStub,
      });
    }

    await saveGameIfDone();
    if (!game.isGameOver() && game.turn() === "w") {
      await createLiveCoachRequest();
    }
    await persistSession();
    return { status: 200, body: serializeSession(session, game, profile) };
  }

  async function handleHint(body) {
    await syncRelayReplies();
    const level = ["nudge", "direction", "reveal"].includes(body.level) ? body.level : "nudge";
    if (game.isGameOver()) {
      return { status: 200, body: { level, text: "The game is over. Start the review.", analysis: null } };
    }
    if (game.turn() !== "w") {
      return { status: 200, body: { level, text: "Wait for Maia's move to finish.", analysis: null } };
    }
    const request = await createLiveCoachRequest({ type: "chess.followup", helpLevel: level });
    if (request) {
      await persistSession();
      return { status: 200, body: serializeSession(session, game, profile) };
    }
    const analysis = await analyzeFen(game.fen(), { depth: Number(process.env.CHESS_HINT_DEPTH || 7), multipv: 2 });
    const theme = classifyBestMove(game, analysis.bestmove);
    const hint = {
      id: timestampId("hint"),
      gameId: session.gameId,
      at: new Date().toISOString(),
      level,
      theme,
      text: hintText(level, theme, analysis),
    };
    session.hints.push(hint);
    await appendEvent(dataRoot, "hint_requested", { gameId: session.gameId, level, theme });
    await persistSession();
    return { status: 200, body: { ...hint, reveal: level === "reveal" ? analysis : undefined } };
  }

  async function handleReview() {
    await syncRelayReplies();
    const reviewedAt = new Date().toISOString();
    const userPlies = session.plies.filter((ply) => ply.side === "user");
    const moves = [];
    for (const ply of userPlies) {
      const beforeAnalysis = await analyzeFen(ply.fenBefore);
      const afterAnalysis = await analyzeFen(ply.fenAfter);
      const beforeScore = scoreForWhite(beforeAnalysis, ply.fenBefore);
      const afterScore = scoreForWhite(afterAnalysis, ply.fenAfter);
      const drop = reviewDrop(beforeScore, afterScore);
      moves.push({
        ply: session.plies.indexOf(ply) + 1,
        uci: ply.uci,
        san: ply.san,
        beforeScore,
        afterScore,
        drop,
        classification: classifyDrop(drop),
        bestmoveBefore: beforeAnalysis.bestmove,
        principalLineBefore: beforeAnalysis.lines[0]?.pv || [],
      });
    }
    const severe = moves.filter((move) => move.classification === "severe_error");
    const review = {
      gameId: session.gameId,
      reviewedAt,
      status: gameStatus(game),
      maia: session.maia,
      pgnPath: path.join(paths.gamesDir, `${session.gameId}.pgn`),
      moves,
      severeErrors: severe,
      summary: {
        userMoveCount: userPlies.length,
        severeErrorCount: severe.length,
        hintCount: session.hints.length,
      },
    };
    const reviewPath = path.join(paths.reviewsDir, `${session.gameId}.json`);
    await writeJson(reviewPath, review);
    session.review = { path: reviewPath, reviewedAt, summary: review.summary };
    await appendEvent(dataRoot, "review_written", { gameId: session.gameId, reviewPath, summary: review.summary });
    await appendProgress(dataRoot, "server_review", { gameId: session.gameId, reviewPath, summary: review.summary });
    const relayReviewRequest = await createReviewPlanRequest(review);
    await persistSession();
    return relayReviewRequest ? serializeSession(session, game, profile) : review;
  }

  async function handleNewGame(body) {
    const elo = Number(body.elo || profile.currentMaiaElo || profile.assignedMaiaElo || DEFAULT_MAIA_ELO);
    session = newSession({ ...profile, currentMaiaElo: elo });
    ensureCoachState(session, { enabled: Boolean(await connectRelay()), relayAppName });
    game = new Chess();
    await appendEvent(dataRoot, "game_started", { gameId: session.gameId, elo });
    await persistSession();
    return serializeSession(session, game, profile);
  }

  async function handleCoachBypass() {
    await syncRelayReplies();
    if (session.coach?.live?.state === "playing_waiting_for_coach") {
      session.coach.live.state = "coach_bypassed";
      session.coach.live.bypassedAt = new Date().toISOString();
      await appendEvent(dataRoot, "coach_bypassed", {
        gameId: session.gameId,
        requestId: session.coach.live.requestId,
      });
      await persistSession();
    }
    return serializeSession(session, game, profile);
  }

  async function handleReviewSelect(body) {
    await syncRelayReplies();
    const items = session.coach?.review?.items || [];
    const index = Math.max(0, Math.min(items.length - 1, Number(body.index || 0)));
    session.coach.review.currentIndex = Number.isFinite(index) ? index : 0;
    await persistSession();
    return serializeSession(session, game, profile);
  }

  async function handleReviewFeedback(body) {
    await syncRelayReplies();
    const value = ["got_it", "still_confused"].includes(body.value) ? body.value : null;
    if (!value) {
      return { status: 400, body: { error: "Expected value got_it or still_confused." } };
    }
    const items = session.coach?.review?.items || [];
    const index = Math.max(0, Math.min(items.length - 1, Number(body.index ?? session.coach.review.currentIndex ?? 0)));
    const item = items[index];
    if (!item) {
      return { status: 404, body: { error: "Review item not found." } };
    }
    item.feedback = { value, at: new Date().toISOString() };
    await updateReviewArtifact((artifact) => ({
      ...artifact,
      agentReview: {
        ...(artifact.agentReview || {}),
        plan: session.coach.review.plan,
        items: session.coach.review.items,
        levelRecommendation: session.coach.review.levelRecommendation,
      },
    }));
    await appendProgress(dataRoot, "review_feedback", {
      gameId: session.gameId,
      reviewItemId: item.id,
      value,
      ply: item.ply,
      san: item.san,
    });
    await persistSession();
    return { status: 200, body: serializeSession(session, game, profile) };
  }

  async function handleAcceptLevel() {
    await syncRelayReplies();
    const recommendation = session.coach?.review?.levelRecommendation;
    const next = Number(recommendation?.nextMaiaElo || recommendation?.maiaElo || recommendation?.elo || 0);
    if (!next) {
      return { status: 400, body: { error: "No level recommendation is available." } };
    }
    profile = {
      ...profile,
      currentMaiaElo: next,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(paths.profile, profile);
    await appendProgress(dataRoot, "level_recommendation_accepted", {
      gameId: session.gameId,
      nextMaiaElo: next,
      recommendation,
    });
    await persistSession();
    return { status: 200, body: serializeSession(session, game, profile) };
  }

  async function serveStatic(req, res, pathname) {
    let filePath;
    if (pathname === "/" || pathname === "/index.html") {
      filePath = path.join(publicRoot, "index.html");
    } else if (pathname === "/vendor/chess.js") {
      filePath = path.join(skillRoot, "node_modules", "chess.js", "dist", "esm", "chess.js");
    } else if (pathname.startsWith("/vendor/cm-chessboard/")) {
      filePath = safeJoin(path.join(skillRoot, "node_modules", "cm-chessboard"), pathname.replace("/vendor/cm-chessboard/", ""));
    } else {
      filePath = safeJoin(publicRoot, pathname);
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": pathname.startsWith("/vendor/") ? "public, max-age=3600" : "no-store",
    });
    res.end(body);
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/state") {
        await syncRelayReplies();
        jsonResponse(res, 200, serializeSession(session, game, profile));
      } else if (req.method === "POST" && url.pathname === "/api/move") {
        const result = await handleMove(await parseBody(req));
        jsonResponse(res, result.status, result.body);
      } else if (req.method === "POST" && url.pathname === "/api/hint") {
        const result = await handleHint(await parseBody(req));
        jsonResponse(res, result.status, result.body);
      } else if (req.method === "POST" && url.pathname === "/api/review") {
        jsonResponse(res, 200, await handleReview());
      } else if (req.method === "POST" && url.pathname === "/api/coach/bypass") {
        jsonResponse(res, 200, await handleCoachBypass());
      } else if (req.method === "POST" && url.pathname === "/api/review/select") {
        jsonResponse(res, 200, await handleReviewSelect(await parseBody(req)));
      } else if (req.method === "POST" && url.pathname === "/api/review/feedback") {
        const result = await handleReviewFeedback(await parseBody(req));
        jsonResponse(res, result.status, result.body);
      } else if (req.method === "POST" && url.pathname === "/api/review/accept-level") {
        const result = await handleAcceptLevel();
        jsonResponse(res, result.status, result.body);
      } else if (req.method === "POST" && url.pathname === "/api/new-game") {
        jsonResponse(res, 200, await handleNewGame(await parseBody(req)));
      } else if (req.method === "GET") {
        await serveStatic(req, res, url.pathname);
      } else {
        textResponse(res, 405, "Method not allowed");
      }
    } catch (error) {
      jsonResponse(res, 500, { error: error.message });
    }
  });

  const requestedPort = Number(options.port ?? process.env.CHESS_PORT ?? 4173);
  const listen = (port) => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  try {
    await listen(requestedPort);
  } catch (error) {
    if (error.code !== "EADDRINUSE" || requestedPort === 0) {
      throw error;
    }
    await listen(0);
  }

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  await persistSession();
  if (!options.quiet) {
    console.log(`Chess learn loop: ${url}`);
    console.log(`Data root: ${dataRoot}`);
    console.log(maiaStub ? "Maia mode: stub" : `Maia model: ${session.maia.model} ${session.maia.device}`);
  }

  return {
    url,
    dataRoot,
    server,
    close: async () => {
      relayReplyLoopStopped = true;
      if (relayClient && session.coach?.enabled) {
        await relayClient.closeRelay({
          reason: "app-shutdown",
          payload: { gameId: session.gameId },
        }).catch(() => {});
      }
      await maia.close();
      await stockfish.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
