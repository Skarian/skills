import { createServer } from "node:http";
import { createHash } from "node:crypto";
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
const LIVE_LADDER = ["think_gate", "general_nudge", "focal_direction", "concrete_clue", "gated_reveal"];
const DEFAULT_LIVE_BUDGET = {
  followupsMax: 3,
  revealsMax: 1,
  visibleSoftCap: 8,
  maxWords: 45,
};
const LEGACY_LIVE_ERROR = {
  error: "The legacy live hint flow was removed. Use /api/coach/message.",
};

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

function serializeSession(session, game, profile, { publicCoach = true } = {}) {
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
    coach: publicCoach ? publicCoachState(session.coach || defaultCoachState()) : (session.coach || defaultCoachState()),
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

function hashFen(fen) {
  return createHash("sha256").update(fen).digest("hex").slice(0, 12);
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function currentTurnMeta(session, game) {
  const fen = game.fen();
  const fenHash = hashFen(fen);
  const ply = session.plies.length;
  const sideToMove = game.turn();
  return {
    turnId: `${session.gameId}:${ply}:${sideToMove}:${fenHash}`,
    fen,
    fenHash,
    ply,
    sideToMove,
  };
}

function scoreBucket(score) {
  if (score === null || score === undefined) return "unknown";
  if (score >= 300) return "winning";
  if (score >= 100) return "advantage";
  if (score <= -300) return "losing";
  if (score <= -100) return "under_pressure";
  return "balanced";
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

function localCoachText(ladderStep, theme) {
  const themeText = {
    mate: "forcing king moves",
    check: "checks and direct threats",
    capture: "loose material and captures",
    piece_activity: "piece activity with tempo",
    candidate: "candidate moves before quiet development",
    quiet: "the opponent threat before improving a piece",
  };
  if (ladderStep === "concrete_clue") {
    return `Focus on ${themeText[theme] || "the most forcing feature"} before choosing a quiet move.`;
  }
  if (ladderStep === "focal_direction") {
    return `The key feature is ${themeText[theme] || "the most urgent board change"}. What candidate addresses it?`;
  }
  return "What is Black threatening, and what are your two most forcing candidate moves?";
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

function compactLiveAnalysis(game, analysis) {
  if (!analysis) return null;
  const legal = game.moves({ verbose: true });
  const primaryTheme = classifyBestMove(game, analysis.bestmove);
  return {
    evalBucket: scoreBucket(scoreForWhite(analysis, game.fen())),
    tacticalFlags: {
      inCheck: game.inCheck(),
      primaryTheme,
      hasLegalCheck: legal.some((move) => move.san.includes("+")),
      hasLegalCapture: legal.some((move) => move.flags.includes("c") || move.flags.includes("e")),
    },
    candidateLandscape: {
      legalMoveCount: legal.length,
      forcingMoveCount: legal.filter((move) => move.san.includes("+") || move.flags.includes("c") || move.flags.includes("e")).length,
      quietMoveCount: legal.filter((move) => !move.san.includes("+") && !move.flags.includes("c") && !move.flags.includes("e")).length,
    },
    threatMap: {
      pressure: primaryTheme,
    },
  };
}

function privateAnalysisTerms(game, analysis) {
  const values = new Set();
  for (const move of game.moves({ verbose: true })) {
    values.add(move.san);
    values.add(moveToUci(move));
  }
  if (analysis?.bestmove) values.add(analysis.bestmove);
  for (const line of analysis?.lines || []) {
    for (const move of line.pv || []) values.add(move);
    if (line.score) {
      values.add(String(line.score.value));
      values.add(`${line.score.kind} ${line.score.value}`);
    }
  }
  return [...values].filter((value) => String(value).trim()).sort((a, b) => b.length - a.length);
}

function defaultLiveState({ enabled = false } = {}) {
  return {
    state: enabled ? "ready" : "disabled",
    pendingRequests: {},
    transcript: [],
    budget: { ...DEFAULT_LIVE_BUDGET },
    usage: {
      followups: 0,
      reveals: 0,
      visibleMessages: 0,
    },
    trace: [],
    status: {
      kind: enabled ? "ready" : "disabled",
      requestId: null,
      at: null,
    },
  };
}

function normalizeLiveState(live, { enabled = false } = {}) {
  const next = defaultLiveState({ enabled });
  const existing = isPlainObject(live) ? live : {};
  next.pendingRequests = enabled && isPlainObject(existing.pendingRequests) ? existing.pendingRequests : {};
  next.transcript = Array.isArray(existing.transcript) ? existing.transcript.slice(-40) : [];
  next.budget = {
    ...DEFAULT_LIVE_BUDGET,
    ...(isPlainObject(existing.budget) ? existing.budget : {}),
  };
  next.usage = {
    followups: Number(existing.usage?.followups || 0),
    reveals: Number(existing.usage?.reveals || 0),
    visibleMessages: Number(existing.usage?.visibleMessages || 0),
  };
  next.trace = Array.isArray(existing.trace) ? existing.trace.slice(-80) : [];
  next.status = {
    ...next.status,
    ...(isPlainObject(existing.status) ? existing.status : {}),
  };
  next.state = enabled
    ? (Object.values(next.pendingRequests).some((request) => request.status === "pending") ? "pending" : "ready")
    : "disabled";
  if (!enabled) next.status.kind = "disabled";
  return next;
}

function publicCoachState(coach) {
  const live = normalizeLiveState(coach?.live, { enabled: Boolean(coach?.enabled) });
  live.pendingRequests = Object.fromEntries(Object.entries(live.pendingRequests || {}).map(([requestId, request]) => [requestId, {
    requestId: request.requestId,
    kind: request.kind,
    sentAt: request.sentAt,
    turnId: request.turnId,
    fenHash: request.fenHash,
    ply: request.ply,
    sideToMove: request.sideToMove,
    userText: request.userText,
    intent: request.intent,
    ladderStep: request.ladderStep,
    revealAllowed: Boolean(request.revealAllowed),
    maxWords: request.maxWords,
    status: request.status,
    staleReason: request.staleReason || null,
    staleAt: request.staleAt || null,
  }]));
  live.trace = (live.trace || []).map((entry) => ({
    id: entry.id,
    at: entry.at,
    type: entry.type,
    requestId: entry.requestId || null,
    turnId: entry.turnId || null,
    ladderStep: entry.ladderStep || null,
    status: entry.status || null,
    reason: entry.reason || null,
  }));
  return {
    ...coach,
    live,
  };
}

function defaultCoachState({ enabled = false, relayAppName = "chess" } = {}) {
  return {
    enabled,
    relayAppName,
    live: defaultLiveState({ enabled }),
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
  session.coach.live = normalizeLiveState(session.coach.live, { enabled });
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
    await writeJson(paths.currentSession, serializeSession(session, game, profile, { publicCoach: false }));
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

  function relayPacket(kind, markdown, data) {
    return { kind, markdown, data };
  }

  function lastPly(side) {
    return [...session.plies].reverse().find((ply) => ply.side === side) || null;
  }

  function liveEntriesForFen(fenHash) {
    return (session.coach?.live?.transcript || []).filter((entry) => entry.fenHash === fenHash);
  }

  function maxLadderIndexForFen(fenHash) {
    return liveEntriesForFen(fenHash)
      .filter((entry) => entry.role === "coach" && entry.ladderStep !== "gated_reveal")
      .reduce((max, entry) => Math.max(max, LIVE_LADDER.indexOf(entry.ladderStep)), -1);
  }

  function mapCoachIntent(text, meta) {
    const normalized = String(text || "").trim().toLowerCase();
    const wantsReveal = /\breveal\b/.test(normalized);
    const live = session.coach.live;
    const previousCoachEntries = liveEntriesForFen(meta.fenHash).filter((entry) => entry.role === "coach");
    const nonRevealCount = previousCoachEntries.filter((entry) => entry.ladderStep !== "gated_reveal").length;
    const reachedConcrete = previousCoachEntries.some((entry) => entry.ladderStep === "concrete_clue");
    const revealAllowed = wantsReveal
      && live.usage.reveals < live.budget.revealsMax
      && (reachedConcrete || nonRevealCount >= 2);

    if (wantsReveal && revealAllowed) {
      return { intent: "reveal", ladderStep: "gated_reveal", revealAllowed };
    }

    const maxIndex = maxLadderIndexForFen(meta.fenHash);
    if (wantsReveal || normalized === "more") {
      const nextIndex = Math.min(Math.max(maxIndex + 1, 1), LIVE_LADDER.indexOf("concrete_clue"));
      return {
        intent: wantsReveal ? "reveal_denied" : "more",
        ladderStep: LIVE_LADDER[nextIndex],
        revealAllowed: false,
      };
    }
    if (normalized === "stuck") {
      return { intent: "stuck", ladderStep: "general_nudge", revealAllowed: false };
    }
    if (normalized === "why") {
      return { intent: "why", ladderStep: "focal_direction", revealAllowed: false };
    }
    return { intent: "question", ladderStep: "think_gate", revealAllowed: false };
  }

  function appendLiveTranscript(entry) {
    const live = session.coach.live;
    live.transcript = [...(live.transcript || []), {
      id: timestampId("coach-msg"),
      at: new Date().toISOString(),
      ...entry,
    }].slice(-40);
  }

  function appendLiveTrace(entry) {
    const live = session.coach.live;
    live.trace = [...(live.trace || []), {
      id: timestampId("coach-trace"),
      at: new Date().toISOString(),
      ...entry,
    }].slice(-80);
  }

  function liveTracePayload() {
    const live = session.coach?.live || defaultLiveState();
    const trace = live.trace || [];
    return {
      transcript: (live.transcript || []).map((entry) => ({
        role: entry.role,
        text: entry.text,
        at: entry.at,
        turnId: entry.turnId,
        fenHash: entry.fenHash,
        ply: entry.ply,
        sideToMove: entry.sideToMove,
        requestId: entry.requestId || null,
        ladderStep: entry.ladderStep || null,
      })),
      usage: live.usage || {},
      trace: trace.map((entry) => ({
        type: entry.type,
        at: entry.at,
        requestId: entry.requestId || null,
        turnId: entry.turnId || null,
        ladderStep: entry.ladderStep || null,
        status: entry.status || null,
        reason: entry.reason || null,
      })),
      summary: {
        userMessages: (live.transcript || []).filter((entry) => entry.role === "user").length,
        visibleCoachMessages: (live.transcript || []).filter((entry) => entry.role === "coach").length,
        followups: Number(live.usage?.followups || 0),
        reveals: Number(live.usage?.reveals || 0),
        staleReplies: trace.filter((entry) => entry.type === "reply_stale").length,
        expiredRequests: trace.filter((entry) => entry.type === "request_expired").length,
        filteredReplies: trace.filter((entry) => entry.type === "reply_filtered" || entry.type === "reply_rejected").length,
        emptyReplies: trace.filter((entry) => entry.type === "reply_empty").length,
      },
    };
  }

  function updateLiveStatus(kind = null, requestId = null) {
    const live = session.coach.live;
    const hasPending = Object.values(live.pendingRequests || {}).some((request) => request.status === "pending");
    live.state = session.coach.enabled ? (hasPending ? "pending" : "ready") : "disabled";
    if (kind) {
      live.status = {
        kind,
        requestId,
        at: new Date().toISOString(),
      };
    } else if (!hasPending && live.status?.kind === "pending") {
      live.status = {
        kind: live.state,
        requestId: null,
        at: new Date().toISOString(),
      };
    }
  }

  async function expirePendingLiveRequests(reason) {
    const live = session.coach?.live;
    if (!live?.pendingRequests) return;
    const pending = Object.values(live.pendingRequests).filter((request) => request.status === "pending");
    for (const request of pending) {
      request.status = "stale";
      request.staleReason = reason;
      request.staleAt = new Date().toISOString();
      appendLiveTrace({
        type: "request_expired",
        requestId: request.requestId,
        turnId: request.turnId,
        ladderStep: request.ladderStep,
        status: "stale",
        reason,
      });
      await appendEvent(dataRoot, "coach_reply_expired", {
        gameId: session.gameId,
        requestId: request.requestId,
        reason,
        turnId: request.turnId,
      });
    }
    if (pending.length) updateLiveStatus("expired", pending[pending.length - 1].requestId);
  }

  function livePacketMarkdown(packet) {
    return [
      "# Chess Live Coach",
      "",
      `Return exactly: { "message": "<text>" }`,
      `Help step: ${packet.request.ladderStep}`,
      `Reveal allowed: ${packet.request.revealPermission ? "yes" : "no"}`,
      `Max words: ${packet.request.maxWords}`,
      `FEN: ${packet.position.fen}`,
      `Recent plies: ${packet.position.recentPlies.map((ply) => ply.san).join(" ") || "(none)"}`,
      "",
      "Be short, legal, position-specific, and non-spoiler unless reveal is allowed.",
    ].join("\n");
  }

  function buildLivePacket({ appRequestId, text, intent, ladderStep, revealAllowed, meta, analysis }) {
    const packet = {
      schemaVersion: 2,
      kind: "chess.live_coach",
      request: {
        requestId: appRequestId,
        kind: revealAllowed ? "reveal" : "followup",
        gameId: session.gameId,
        turnId: meta.turnId,
        fenHash: meta.fenHash,
        ply: meta.ply,
        sideToMove: meta.sideToMove,
        userText: text,
        intent,
        ladderStep,
        remainingBudget: {
          followups: Math.max(0, session.coach.live.budget.followupsMax - session.coach.live.usage.followups),
          reveals: Math.max(0, session.coach.live.budget.revealsMax - session.coach.live.usage.reveals),
        },
        maxWords: session.coach.live.budget.maxWords,
        revealPermission: revealAllowed,
      },
      position: {
        fen: meta.fen,
        sideToMove: meta.sideToMove,
        status: gameStatus(game),
        recentPlies: session.plies.slice(-6),
        lastUserMove: lastPly("user"),
        lastMaiaMove: lastPly("maia"),
        legalMoves: legalMovePayload().map((move) => ({
          san: move.san,
          uci: move.uci,
          from: move.from,
          to: move.to,
          piece: move.piece,
          captured: Boolean(move.captured),
        })),
      },
      learner: {
        color: "white",
        maiaLevel: session.maia.elo,
        calibration: profile.calibration || "active",
        activeThemes: Array.isArray(profile.activeThemes) ? profile.activeThemes.slice(0, 3) : [],
        wording: profile.wording || "concise",
      },
      coachContext: {
        recentVisibleMessages: (session.coach.live.transcript || []).slice(-6).map((entry) => ({
          role: entry.role,
          text: entry.text,
          ladderStep: entry.ladderStep || null,
        })),
        visibleMessagesThisGame: session.coach.live.usage.visibleMessages,
        followupsUsed: session.coach.live.usage.followups,
        revealsUsed: session.coach.live.usage.reveals,
        visibleSoftCap: session.coach.live.budget.visibleSoftCap,
        cadenceReason: "typed_user_request",
      },
      analysis: compactLiveAnalysis(game, analysis),
      humanLikeness: {
        maiaLevel: session.maia.elo,
        maiaModel: session.maia.model,
        lastMaiaMove: lastPly("maia"),
      },
      constraints: {
        replySchema: { message: "string" },
        nonSpoiler: !revealAllowed,
        legalMoveGrounding: true,
        maxWords: session.coach.live.budget.maxWords,
        revealPermission: revealAllowed,
        doNotEcho: ["engine names", "numeric analysis", "engine line details", "top-candidate phrasing"],
      },
    };
    return {
      ...packet,
      markdown: livePacketMarkdown(packet),
    };
  }

  function parseLiveMessage(payload) {
    if (!isPlainObject(payload)) {
      return { ok: false, reason: "not_object" };
    }
    const keys = Object.keys(payload);
    if (keys.length !== 1 || keys[0] !== "message" || typeof payload.message !== "string") {
      return { ok: false, reason: "invalid_schema" };
    }
    return { ok: true, message: payload.message };
  }

  function escapedPattern(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function includesTerm(text, term) {
    const value = String(term || "").trim();
    if (value.length < 2) return false;
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapedPattern(value)}($|[^A-Za-z0-9])`, "i");
    return pattern.test(text);
  }

  function filterLiveMessage(request, message) {
    const text = String(message || "").trim();
    if (!text) return { ok: true, text };
    if (wordCount(text) > request.maxWords) return { ok: false, reason: "overlong" };
    if (/\b(stockfish|maia|engine|eval|evaluation|principal variation|pv|centipawn|uci)\b/i.test(text)) {
      return { ok: false, reason: "engine_language" };
    }
    if (/\bbest\s+(move|candidate|line)\b/i.test(text)) {
      return { ok: false, reason: "best_move_language" };
    }
    if (!request.revealAllowed && /\b[a-h][1-8][a-h][1-8][qrbn]?\b/i.test(text)) {
      return { ok: false, reason: "uci_leak" };
    }
    if (!request.revealAllowed && (request.privateTerms || []).some((term) => includesTerm(text, term))) {
      return { ok: false, reason: "private_term_echo" };
    }
    const legalTerms = new Set(request.legalTerms || []);
    const moveLike = text.match(/\b(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[a-h][1-8])(?:=[QRBN])?[+#]?\b/g) || [];
    if (moveLike.some((term) => !legalTerms.has(term))) {
      return { ok: false, reason: "illegal_move_advice" };
    }
    return { ok: true, text };
  }

  async function createCoachMessageRequest({ text, intent, ladderStep, revealAllowed, meta, analysis }) {
    const appRequestId = timestampId("coach-request");
    const packet = buildLivePacket({ appRequestId, text, intent, ladderStep, revealAllowed, meta, analysis });
    const resolvedRequest = await createRelayMessage({ payload: packet });
    if (!resolvedRequest) return null;

    const requestId = String(resolvedRequest.requestId);
    const legalMoves = legalMovePayload();
    session.coach.live.pendingRequests[requestId] = {
      requestId,
      appRequestId,
      relayEventId: resolvedRequest.eventId,
      kind: revealAllowed ? "reveal" : "followup",
      sentAt: new Date().toISOString(),
      turnId: meta.turnId,
      fenHash: meta.fenHash,
      ply: meta.ply,
      sideToMove: meta.sideToMove,
      userText: text,
      intent,
      ladderStep,
      revealAllowed,
      maxWords: session.coach.live.budget.maxWords,
      status: "pending",
      privateTerms: privateAnalysisTerms(game, analysis),
      legalTerms: legalMoves.flatMap((move) => [move.san, move.uci]),
    };
    appendLiveTrace({
      type: "request_sent",
      requestId,
      turnId: meta.turnId,
      ladderStep,
      status: "pending",
      reason: intent,
    });
    updateLiveStatus("pending", requestId);
    await appendEvent(dataRoot, "coach_message_requested", {
      gameId: session.gameId,
      requestId,
      appRequestId,
      intent,
      ladderStep,
      revealAllowed,
    });
    return resolvedRequest;
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
      liveTrace: liveTracePayload(),
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

  async function handleLiveReply({ inReplyTo, payload }) {
    const live = session.coach.live;
    const requestId = String(inReplyTo || "");
    const request = live.pendingRequests?.[requestId];
    if (!request) return false;

    delete live.pendingRequests[requestId];
    const meta = currentTurnMeta(session, game);
    const stale = request.status !== "pending"
      || request.turnId !== meta.turnId
      || request.fenHash !== meta.fenHash
      || request.ply !== meta.ply
      || request.sideToMove !== meta.sideToMove;
    if (stale) {
      updateLiveStatus("expired", requestId);
      appendLiveTrace({
        type: "reply_stale",
        requestId,
        turnId: request.turnId,
        ladderStep: request.ladderStep,
        status: "stale",
        reason: request.status !== "pending" ? request.status : "board_mismatch",
      });
      await appendEvent(dataRoot, "coach_reply_stale", {
        gameId: session.gameId,
        requestId,
        expectedTurnId: request.turnId,
        currentTurnId: meta.turnId,
      });
      return true;
    }

    const parsed = parseLiveMessage(payload);
    if (!parsed.ok) {
      updateLiveStatus("filtered", requestId);
      appendLiveTrace({
        type: "reply_rejected",
        requestId,
        turnId: request.turnId,
        ladderStep: request.ladderStep,
        status: "rejected",
        reason: parsed.reason,
      });
      await appendEvent(dataRoot, "coach_reply_rejected", {
        gameId: session.gameId,
        requestId,
        reason: parsed.reason,
      });
      return true;
    }

    if (parsed.message === "") {
      updateLiveStatus(null, null);
      appendLiveTrace({
        type: "reply_empty",
        requestId,
        turnId: request.turnId,
        ladderStep: request.ladderStep,
        status: "empty",
      });
      await appendEvent(dataRoot, "coach_reply_empty", { gameId: session.gameId, requestId });
      return true;
    }

    const filtered = filterLiveMessage(request, parsed.message);
    if (!filtered.ok) {
      updateLiveStatus("filtered", requestId);
      appendLiveTrace({
        type: "reply_filtered",
        requestId,
        turnId: request.turnId,
        ladderStep: request.ladderStep,
        status: "filtered",
        reason: filtered.reason,
      });
      await appendEvent(dataRoot, "coach_reply_filtered", {
        gameId: session.gameId,
        requestId,
        reason: filtered.reason,
      });
      return true;
    }

    appendLiveTranscript({
      role: "coach",
      text: filtered.text,
      requestId,
      turnId: request.turnId,
      fenHash: request.fenHash,
      ply: request.ply,
      sideToMove: request.sideToMove,
      ladderStep: request.ladderStep,
    });
    live.usage.visibleMessages += 1;
    updateLiveStatus("ready", null);
    appendLiveTrace({
      type: "reply_displayed",
      requestId,
      turnId: request.turnId,
      ladderStep: request.ladderStep,
      status: "displayed",
    });
    await appendEvent(dataRoot, "coach_message_received", {
      gameId: session.gameId,
      requestId,
      ladderStep: request.ladderStep,
    });
    return true;
  }

  async function applyRelayReceive(client, received) {
    const replies = received.items || [];
    let changed = false;
    let closed = false;
    for (const reply of replies) {
      if (reply.status === "closed") {
        session.coach.enabled = false;
        relayClient = null;
        session.coach.live = normalizeLiveState(session.coach.live, { enabled: false });
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
      if (await handleLiveReply({ inReplyTo, payload: replyPayload })) {
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
    session.coach.live = normalizeLiveState(session.coach.live, { enabled: false });
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
    await expirePendingLiveRequests("board_advanced");
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
    updateLiveStatus();
    await persistSession();
    return { status: 200, body: serializeSession(session, game, profile) };
  }

  async function handleCoachMessage(body) {
    await syncRelayReplies();
    const text = String(body.text || "").trim();
    if (!text) {
      return { status: 400, body: { error: "Expected a coach message." } };
    }
    if (text.length > 500) {
      return { status: 400, body: { error: "Coach message is too long." } };
    }
    if (game.isGameOver()) {
      return { status: 409, body: { error: "The game is over. Start the review." } };
    }
    if (game.turn() !== "w") {
      return { status: 409, body: { error: "Wait for Maia's move to finish." } };
    }
    const live = session.coach.live;
    const meta = currentTurnMeta(session, game);
    const mapped = mapCoachIntent(text, meta);
    const needsFollowupBudget = !mapped.revealAllowed;
    if (needsFollowupBudget && live.usage.followups >= live.budget.followupsMax) {
      return { status: 429, body: { error: "No coach questions remain for this game." } };
    }
    if (mapped.revealAllowed && live.usage.reveals >= live.budget.revealsMax) {
      return { status: 429, body: { error: "No reveal requests remain for this game." } };
    }

    appendLiveTranscript({
      role: "user",
      text,
      requestId: null,
      turnId: meta.turnId,
      fenHash: meta.fenHash,
      ply: meta.ply,
      sideToMove: meta.sideToMove,
      ladderStep: mapped.ladderStep,
    });
    if (mapped.revealAllowed) live.usage.reveals += 1;
    else live.usage.followups += 1;

    const analysis = await analyzeFen(game.fen(), { depth: Number(process.env.CHESS_HINT_DEPTH || 7), multipv: 2 });
    const request = await createCoachMessageRequest({
      text,
      intent: mapped.intent,
      ladderStep: mapped.ladderStep,
      revealAllowed: mapped.revealAllowed,
      meta,
      analysis,
    });
    if (!request) {
      appendLiveTranscript({
        role: "coach",
        text: localCoachText(mapped.ladderStep, classifyBestMove(game, analysis.bestmove)),
        requestId: null,
        turnId: meta.turnId,
        fenHash: meta.fenHash,
        ply: meta.ply,
        sideToMove: meta.sideToMove,
        ladderStep: mapped.ladderStep,
      });
      live.usage.visibleMessages += 1;
      updateLiveStatus("ready", null);
      appendLiveTrace({
        type: "local_reply",
        requestId: null,
        turnId: meta.turnId,
        ladderStep: mapped.ladderStep,
        status: "displayed",
        reason: mapped.intent,
      });
      await appendEvent(dataRoot, "coach_message_local", {
        gameId: session.gameId,
        intent: mapped.intent,
        ladderStep: mapped.ladderStep,
      });
    }
    await persistSession();
    return { status: 200, body: serializeSession(session, game, profile) };
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
    const liveTrace = liveTracePayload();
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
        liveHelpCount: liveTrace.summary.userMessages,
        visibleCoachMessageCount: liveTrace.summary.visibleCoachMessages,
        revealCount: liveTrace.summary.reveals,
        staleReplyCount: liveTrace.summary.staleReplies,
        expiredRequestCount: liveTrace.summary.expiredRequests,
        filteredReplyCount: liveTrace.summary.filteredReplies,
        legacyHintCount: session.hints.length,
      },
      liveTrace,
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
        jsonResponse(res, 410, LEGACY_LIVE_ERROR);
      } else if (req.method === "POST" && url.pathname === "/api/coach/message") {
        const result = await handleCoachMessage(await parseBody(req));
        jsonResponse(res, result.status, result.body);
      } else if (req.method === "POST" && url.pathname === "/api/review") {
        jsonResponse(res, 200, await handleReview());
      } else if (req.method === "POST" && url.pathname === "/api/coach/bypass") {
        jsonResponse(res, 410, LEGACY_LIVE_ERROR);
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
