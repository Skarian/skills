import { Chess } from "/vendor/chess.js";
import { Chessboard, COLOR, FEN, INPUT_EVENT_TYPE } from "/vendor/cm-chessboard/src/Chessboard.js";
import { Markers, MARKER_TYPE } from "/vendor/cm-chessboard/src/extensions/markers/Markers.js";
import {
  PROMOTION_DIALOG_RESULT_TYPE,
  PromotionDialog,
} from "/vendor/cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js";
import { Accessibility } from "/vendor/cm-chessboard/src/extensions/accessibility/Accessibility.js";

const els = {
  board: document.getElementById("board"),
  gameMeta: document.getElementById("game-meta"),
  turn: document.getElementById("turn"),
  result: document.getElementById("result"),
  maia: document.getElementById("maia"),
  moves: document.getElementById("moves"),
  coachState: document.getElementById("coach-state"),
  coachRemaining: document.getElementById("coach-remaining"),
  coachTranscript: document.getElementById("coach-transcript"),
  coachForm: document.getElementById("coach-form"),
  coachInput: document.getElementById("coach-input"),
  coachSend: document.getElementById("coach-send"),
  reviewPanel: document.getElementById("review-panel"),
  reviewStatus: document.getElementById("review-status"),
  reviewCard: document.getElementById("review-card"),
  reviewPrev: document.getElementById("review-prev"),
  reviewNext: document.getElementById("review-next"),
  reviewGotIt: document.getElementById("review-got-it"),
  reviewConfused: document.getElementById("review-confused"),
  levelRecommendation: document.getElementById("level-recommendation"),
  levelText: document.getElementById("level-text"),
  acceptLevel: document.getElementById("accept-level"),
  reviewPath: document.getElementById("review-path"),
  review: document.getElementById("review"),
  newGame: document.getElementById("new-game"),
};

let localGame = new Chess();
let state = null;
let busy = false;
let pendingPromotion = null;
let polling = null;

const board = new Chessboard(els.board, {
  position: FEN.start,
  orientation: COLOR.white,
  assetsUrl: "/vendor/cm-chessboard/assets/",
  extensions: [
    { class: Markers, props: { autoMarkers: null } },
    { class: PromotionDialog, props: { language: "en" } },
    {
      class: Accessibility,
      props: {
        language: "en",
        movePieceForm: false,
        boardAsTable: true,
        piecesAsList: true,
        brailleNotationInAlt: true,
        keyboardMoveInput: false,
        visuallyHidden: true,
      },
    },
  ],
  style: {
    pieces: { file: "pieces/staunty.svg" },
    animationDuration: 160,
  },
});

async function api(path, body = null) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function exposeState(nextState) {
  window.__chessState = nextState;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMarkdown(target, markdown) {
  const escaped = escapeHtml(markdown || "");
  target.innerHTML = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
  if (target.innerHTML && !target.innerHTML.startsWith("<p>")) {
    target.innerHTML = `<p>${target.innerHTML}</p>`;
  }
}

function liveCoachState() {
  return state?.coach?.live?.state || "ready";
}

function reviewCoachState() {
  return state?.coach?.review?.state || "idle";
}

function hasPendingCoach() {
  return Object.values(state?.coach?.live?.pendingRequests || {}).some((request) => request.status === "pending");
}

function isReviewPending() {
  const review = state?.coach?.review;
  return Boolean(review && ["review_planning", "review_card_loading", "review_card_ready"].includes(review.state) &&
    (review.state === "review_planning" || review.items?.some((item) => item.state !== "review_card_ready")));
}

function shouldPoll() {
  return hasPendingCoach() || isReviewPending();
}

function clearMoveMarkers() {
  board.removeLegalMovesMarkers();
  board.removeMarkers(MARKER_TYPE.framePrimary);
}

function legalMovesFrom(square) {
  if (!square || busy || pendingPromotion || localGame.turn() !== "w") {
    return [];
  }
  try {
    return localGame.moves({ square, verbose: true });
  } catch {
    return [];
  }
}

function legalMoveFor(from, to, promotion = null) {
  return legalMovesFrom(from).find((move) => {
    if (move.to !== to) return false;
    if (move.promotion) return move.promotion === promotion;
    return !promotion;
  }) || null;
}

function promotionMovesFor(from, to) {
  return legalMovesFrom(from).filter((move) => move.to === to && move.promotion);
}

function isPromotionMove(from, to) {
  return promotionMovesFor(from, to).length > 0;
}

function markLegalMoves(square) {
  clearMoveMarkers();
  const moves = legalMovesFrom(square);
  if (!moves.length) {
    return false;
  }
  board.addMarker(MARKER_TYPE.framePrimary, square);
  board.addLegalMovesMarkers(moves);
  return true;
}

function setMoveInputEnabled(enabled) {
  if (enabled && !board.isMoveInputEnabled()) {
    board.enableMoveInput(inputHandler, COLOR.white);
  } else if (!enabled && board.isMoveInputEnabled()) {
    board.disableMoveInput();
  }
}

function updateButtons() {
  const gameOver = state?.status?.gameOver;
  const disablePlay = busy || gameOver;
  for (const button of [els.review, els.newGame]) {
    button.disabled = busy || Boolean(pendingPromotion);
  }
  els.review.disabled = busy || Boolean(pendingPromotion) || !gameOver;
  els.coachInput.disabled = busy || Boolean(pendingPromotion) || gameOver;
  els.coachSend.disabled = busy || Boolean(pendingPromotion) || gameOver;
  els.reviewPrev.disabled = busy || !state?.coach?.review?.items?.length || (state.coach.review.currentIndex || 0) <= 0;
  els.reviewNext.disabled = busy || !state?.coach?.review?.items?.length ||
    (state.coach.review.currentIndex || 0) >= state.coach.review.items.length - 1;
  els.reviewGotIt.disabled = busy || !currentReviewItem()?.card;
  els.reviewConfused.disabled = busy || !currentReviewItem()?.card;
  els.acceptLevel.disabled = busy || !state?.coach?.review?.levelRecommendation;
  if (disablePlay) {
    clearMoveMarkers();
    setMoveInputEnabled(false);
  } else {
    setMoveInputEnabled(true);
  }
}

function currentReviewItem() {
  const review = state?.coach?.review;
  if (!review?.items?.length) return null;
  return review.items[review.currentIndex || 0] || null;
}

function setCoachStatus(text) {
  els.coachState.textContent = text;
}

function renderCoach() {
  const live = state?.coach?.live;
  const budget = live?.budget || {};
  const usage = live?.usage || {};
  const remaining = Math.max(0, Number(budget.followupsMax || 0) - Number(usage.followups || 0));
  const reveals = Math.max(0, Number(budget.revealsMax || 0) - Number(usage.reveals || 0));
  els.coachRemaining.textContent = `${remaining} questions, ${reveals} reveal`;

  const pendingCount = Object.values(live?.pendingRequests || {}).filter((request) => request.status === "pending").length;
  if (!state?.coach?.enabled) {
    setCoachStatus("Local coach");
  } else if (pendingCount) {
    setCoachStatus(`Coach pending (${pendingCount})`);
  } else if (live?.status?.kind === "expired") {
    setCoachStatus("Previous reply expired");
  } else if (live?.status?.kind === "filtered") {
    setCoachStatus("Previous reply filtered");
  } else {
    setCoachStatus("Ready");
  }

  els.coachTranscript.replaceChildren();
  const transcript = live?.transcript || [];
  if (!transcript.length) {
    const empty = document.createElement("p");
    empty.className = "coach-empty";
    empty.textContent = "Ask when you want help.";
    els.coachTranscript.append(empty);
    return;
  }
  for (const item of transcript) {
    const message = document.createElement("div");
    message.className = `coach-message ${item.role === "user" ? "user" : "coach"}`;
    message.textContent = item.text || "";
    els.coachTranscript.append(message);
  }
  els.coachTranscript.scrollTop = els.coachTranscript.scrollHeight;
}

function renderReview() {
  const review = state?.coach?.review;
  const visible = state?.status?.gameOver || review?.state !== "idle";
  els.reviewPanel.hidden = !visible;
  if (!visible) return;

  const items = review?.items || [];
  const readyCount = items.filter((item) => item.state === "review_card_ready").length;
  els.reviewStatus.textContent = `${reviewCoachState().replaceAll("_", " ")} - ${readyCount}/${items.length}`;

  const item = currentReviewItem();
  els.reviewCard.replaceChildren();
  if (review?.state === "review_planning") {
    const node = document.createElement("p");
    node.textContent = "Preparing the review queue.";
    els.reviewCard.append(node);
  } else if (!item) {
    const node = document.createElement("p");
    node.textContent = "No review cards yet.";
    els.reviewCard.append(node);
  } else {
    const title = document.createElement("h3");
    title.textContent = `${(review.currentIndex || 0) + 1}. ${item.card?.title || item.title || item.san || item.uci}`;
    const meta = document.createElement("p");
    meta.className = "review-meta";
    meta.textContent = `${item.san || item.uci} - ${item.priority || "normal"}${item.feedback ? ` - ${item.feedback.value.replaceAll("_", " ")}` : ""}`;
    const body = document.createElement("div");
    body.className = "review-body";
    if (item.card) {
      renderMarkdown(body, item.card.bodyMarkdown);
    } else {
      body.textContent = "Loading this explanation.";
    }
    els.reviewCard.append(title, meta, body);
  }

  const recommendation = review?.levelRecommendation;
  els.levelRecommendation.hidden = !recommendation;
  if (recommendation) {
    const next = recommendation.nextMaiaElo || recommendation.maiaElo || recommendation.elo;
    els.levelText.textContent = next
      ? `Recommended next Maia level: ${next}. ${recommendation.rationale || ""}`
      : recommendation.rationale || "A level recommendation is available.";
  }
}

function updatePolling() {
  if (shouldPoll() && !polling) {
    polling = window.setInterval(() => {
      refresh().catch((error) => {
        setCoachStatus(error.message);
      });
    }, 1500);
  } else if (!shouldPoll() && polling) {
    window.clearInterval(polling);
    polling = null;
  }
}

async function render(nextState, animated = true) {
  state = nextState;
  exposeState(state);
  localGame = new Chess(state.fen);
  pendingPromotion = null;
  clearMoveMarkers();
  await board.setPosition(state.fen, animated);
  els.gameMeta.textContent = state.gameId;
  els.turn.textContent = state.turn === "w" ? "White" : "Black";
  els.result.textContent = state.status.gameOver ? state.status.result : "Playing";
  els.maia.textContent = `${state.maia.model.replace("maia3-", "")} ${state.maia.elo}`;
  els.moves.replaceChildren(...state.history.map((move) => {
    const item = document.createElement("li");
    item.textContent = `${move.color === "w" ? "White" : "Black"} ${move.san}`;
    return item;
  }));
  els.reviewPath.textContent = state.review?.path || "";
  renderCoach();
  renderReview();
  updateButtons();
  updatePolling();
}

function validateLocalMove(from, to) {
  if (isPromotionMove(from, to)) {
    return true;
  }
  return Boolean(legalMoveFor(from, to));
}

function requestPromotion(from, to) {
  if (pendingPromotion) {
    return;
  }
  pendingPromotion = { from, to };
  clearMoveMarkers();
  updateButtons();
  setCoachStatus("Choose promotion piece.");
  board.showPromotionDialog(to, COLOR.white, (result) => {
    const request = pendingPromotion;
    pendingPromotion = null;
    if (result?.type === PROMOTION_DIALOG_RESULT_TYPE.pieceSelected && request) {
      const promotion = result.piece.charAt(1);
      submitMove(request.from, request.to, promotion);
    } else {
      setCoachStatus("Promotion canceled.");
      refresh();
    }
  });
}

function inputHandler(event) {
  if (event.type === INPUT_EVENT_TYPE.moveInputStarted) {
    const piece = localGame.get(event.squareFrom);
    if (busy || localGame.turn() !== "w" || piece?.color !== "w") {
      clearMoveMarkers();
      return false;
    }
    return markLegalMoves(event.squareFrom);
  }
  if (event.type === INPUT_EVENT_TYPE.validateMoveInput) {
    if (isPromotionMove(event.squareFrom, event.squareTo)) {
      requestPromotion(event.squareFrom, event.squareTo);
      return true;
    }
    return validateLocalMove(event.squareFrom, event.squareTo);
  }
  if (event.type === INPUT_EVENT_TYPE.moveInputCanceled) {
    clearMoveMarkers();
  }
  if (event.type === INPUT_EVENT_TYPE.moveInputFinished) {
    clearMoveMarkers();
    if (event.legalMove && !pendingPromotion && event.squareFrom && event.squareTo) {
      submitMove(event.squareFrom, event.squareTo);
    }
  }
  return undefined;
}

async function submitMove(from, to, promotion = null) {
  const move = legalMoveFor(from, to, promotion);
  if (!move) {
    setCoachStatus("Illegal move.");
    await refresh();
    return;
  }
  busy = true;
  updateButtons();
  setCoachStatus("Maia is thinking.");
  try {
    const next = await api("/api/move", { uci: `${from}${to}${move.promotion || ""}` });
    await render(next);
    if (next.status.gameOver) {
      setCoachStatus("Game complete. Start the review.");
    }
  } catch (error) {
    setCoachStatus(error.message);
    await refresh();
  } finally {
    busy = false;
    updateButtons();
  }
}

async function sendCoachMessage(event) {
  event.preventDefault();
  const text = els.coachInput.value.trim();
  if (!text) return;
  busy = true;
  updateButtons();
  try {
    els.coachInput.value = "";
    await render(await api("/api/coach/message", { text }), false);
  } catch (error) {
    setCoachStatus(error.message);
  } finally {
    busy = false;
    updateButtons();
  }
}

async function requestReview() {
  busy = true;
  updateButtons();
  setCoachStatus("Reviewing.");
  try {
    const result = await api("/api/review", {});
    if (result.fen) {
      await render(result, false);
      setCoachStatus("Review started.");
    } else {
      setCoachStatus(`Review written. Severe errors: ${result.summary.severeErrorCount}.`);
      const next = await api("/api/state");
      await render(next, false);
    }
  } catch (error) {
    setCoachStatus(error.message);
  } finally {
    busy = false;
    updateButtons();
  }
}

async function newGame() {
  busy = true;
  updateButtons();
  try {
    await render(await api("/api/new-game", {}));
    setCoachStatus("Ready.");
  } catch (error) {
    setCoachStatus(error.message);
  } finally {
    busy = false;
    updateButtons();
  }
}

async function selectReview(index) {
  busy = true;
  updateButtons();
  try {
    await render(await api("/api/review/select", { index }), false);
  } catch (error) {
    setCoachStatus(error.message);
  } finally {
    busy = false;
    updateButtons();
  }
}

async function sendReviewFeedback(value) {
  busy = true;
  updateButtons();
  try {
    await render(await api("/api/review/feedback", {
      index: state?.coach?.review?.currentIndex || 0,
      value,
    }), false);
  } catch (error) {
    setCoachStatus(error.message);
  } finally {
    busy = false;
    updateButtons();
  }
}

async function acceptLevel() {
  busy = true;
  updateButtons();
  try {
    await render(await api("/api/review/accept-level", {}), false);
  } catch (error) {
    setCoachStatus(error.message);
  } finally {
    busy = false;
    updateButtons();
  }
}

async function refresh() {
  await render(await api("/api/state"), false);
}

els.coachForm.addEventListener("submit", sendCoachMessage);
els.review.addEventListener("click", requestReview);
els.newGame.addEventListener("click", newGame);
els.reviewPrev.addEventListener("click", () => selectReview((state?.coach?.review?.currentIndex || 0) - 1));
els.reviewNext.addEventListener("click", () => selectReview((state?.coach?.review?.currentIndex || 0) + 1));
els.reviewGotIt.addEventListener("click", () => sendReviewFeedback("got_it"));
els.reviewConfused.addEventListener("click", () => sendReviewFeedback("still_confused"));
els.acceptLevel.addEventListener("click", acceptLevel);

refresh().catch((error) => {
  setCoachStatus(error.message);
});
