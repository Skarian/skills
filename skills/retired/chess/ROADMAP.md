# Chess Skill Roadmap

Canonical planning document for the personal `chess` skill.

## Goal

Create a personal chess-learning skill that Claude or Codex can run end to end.
The skill should feel like a lightweight learning guide in the spirit of Learn Chess with Dr. Wolf: interactive play, adaptive difficulty, non-spoiler guidance, post-game review, and durable progress tracking.
The purpose is to build practical chess strength through structured computer practice.

This is an agent workflow with helper files, not a standalone chess-learning application.

## Scope

- Category: `skills/personal`.
- Modes: `learn` and `puzzles`.
- First mode: `learn`.
- Deferred mode: `puzzles`.
- Current phase: v1 playable learn loop implemented, locally verified, and used for real Maia-backed learner sessions.
- Core thesis: structured computer practice with review can build beginner-to-intermediate strength; passive bot grinding is not enough.
- Runtime shape: the agent launches or uses a lightweight chess UI, observes game state, gives guidance, and returns to chat for review after the game.
- UI boundary: moves and board interaction happen through the UI.
- Agent boundary: the agent coaches, tracks state, manages engine calls, updates progress, and runs reviews.
- Helper boundary: Node.js scripts, browser UI, Stockfish wrappers, and local data files are allowed if they keep the workflow easy for an agent to run.

## Learn Loop

- Trigger phrases include "let's learn chess", "let's practice chess", "let's play", and "let's continue".
- In computer practice, the agent opens the local chess UI, the user plays against a calibrated computer opponent, and live coaching is allowed.
- Initial Maia level comes from concrete agent intake, not a fixed label table. Use `research/LEVELING_SYSTEM.md`: accept a trusted user-provided level with source details, prefer stable Lichess rapid/blitz when available, treat other ratings and bot levels as source-specific signals, start at Maia 600 for rules-level learners, and adjust from the first games.
- The agent tracks position, game history, guidance events, and review outcomes.
- The agent gives guidance without directly spoiling the move unless asked.
- When a practice game or review ends, the user returns to the agent chat.
- The agent reviews the game, updates progress, and suggests what to practice next.
- Human games are calibration, not a v1 workflow.

## Training Thesis

- Status: initial deep research synthesis complete. See `research/THESIS.md`.
- The project is viable if it is centered on structured computer practice for beginner-to-intermediate growth, with built-in review, non-spoiler coaching, and durable progress tracking.
- A Stockfish-only opponent is not a convincing core thesis. It risks training against engine-style play with artificial weak moves.
- Stockfish should be the objective oracle for analysis, candidate comparison, and post-game review.
- Maia-3 is the preferred human-like practice-opponent candidate; local setup is practical.
- Weakened Stockfish remains the low-friction fallback opponent.
- The skill should measure early improvement through practice-game severe-error reduction, drill retention, and concept mastery.
- Puzzles should eventually reinforce repeated reviewed-game mistakes rather than become a generic puzzle treadmill.

## Level Target

- First target: transfer-ready early intermediate.
- Starting level is separate from the long-term target. The first game should be a complete, reviewable calibration game; for true beginners this may mean Maia 600 plus gentler coaching.
- Machine-level target: handle a calibrated 1800-2000 human-like computer opponent with low or no live help.
- Maia target: use `Elo` / `OppoElo` 1800-2000 with the locally tested Maia-3 runtime.
- Stockfish fallback target: no fixed numeric graduation target. Treat Stockfish as harder and less human-like than its label, then adapt from actual game results, live-help usage, and severe-error rate.
- Transfer starts in two phases:
  - Calibration: try human games once 1600-1800 human-like machine games, or comparable calibrated Stockfish games, are playable.
  - Graduation: make human review regular once 1800-2000 human-like practice, or comparable calibrated Stockfish practice, is stable.
- Source note: generic engine Elo is not human Elo. Use human-like engine targets first, then calibrate from real results.

## Durable Data

- Store chess data under `~/.skills/chess/`.
- Treat `~/.skills/chess/` as data only, not a skill-discovery root.
- Never place `SKILL.md` files under `~/.skills/chess/`.
- Store completed games as PGN under `~/.skills/chess/games/`.
- Use FEN for current position snapshots and engine calls.
- Use NDJSON for append-only learning, progress, and session events.
- Use JSON for compact profile/config state.
- Reserve EPD for future puzzle or drill position sets.
- Do not invent a JSON game-history format; use JSON only for agent-specific metadata that PGN does not naturally carry.

## Data Layout

V1 uses this layout:

```text
~/.skills/chess/
  profile.json
  progress.ndjson
  events.ndjson
  games/
    <game-id>.pgn
  reviews/
    <game-id>.json
  sessions/
    current.json
  positions/
    drills.epd
    puzzles.epd
  runtime/
    maia3/
      src/
      venv/
      hf-cache/
```

- `profile.json`: compact learner profile, provided level/source if any, current Maia setting, and stable preferences.
- `progress.ndjson`: append-only learning progress events, including review outcomes and spaced-review updates.
- `events.ndjson`: append-only operational event log for practice sessions, imports, and agent actions.
- `games/<game-id>.pgn`: canonical record for each completed computer-practice or human game.
- `reviews/<game-id>.json`: compact agent metadata for a reviewed game: source, severe errors, motifs, phase tags, drill links, and summary. This is not a replacement for PGN.
- `sessions/current.json`: resumable state for the active or most recent unfinished computer-practice game.
- `positions/drills.epd`: targeted review and practice positions generated from real games or practice misses.
- `positions/puzzles.epd`: future puzzle bank, initially deferred.
- `runtime/maia3/src`: Maia-3 source clone.
- `runtime/maia3/venv`: Maia-3 Python virtualenv.
- `runtime/maia3/hf-cache`: cached Maia-3 model weights.

## UI Default

- Use `cm-chessboard` as the first lightweight browser board.
- Use `chess.js` as the canonical browser-side game state, move validator, FEN source, PGN source, and history source.
- Expose state to the agent through an explicit browser object, such as `window.__chessState`.
- Update `window.__chessState` after each legal move with at least: `fen`, `pgn`, legal/game status, and verbose move history.
- Prefer direct state reads over screenshot or DOM scraping.
- Keep `chessground` as a researched alternative if Lichess-grade interaction polish becomes worth its GPL constraints.

## Engine Default

- Use npm WASM Stockfish as the required v1 analysis engine.
- Treat Stockfish as a UCI engine behind the Node wrapper.
- Native Stockfish is not required for v1.
- Use `position fen ...` or `position startpos moves ...`, then `go depth ...` or `go movetime ...`.
- Parse `info` lines for depth, score, MultiPV, and hidden principal variations.
- Parse `bestmove` only when the workflow needs the engine to make a move or the user explicitly asks for a reveal.
- Use `Threads 1`, modest `Hash`, and `MultiPV 2-5` for lightweight local runs.
- Use Stockfish strength limiting only for fallback opponent play in practice games.
- Use full-strength shallow analysis for live coaching, so the coach is not learning from intentionally weakened play.
- Maia-3 79M is locally feasible. Treat 79M CPU as the first high-quality practice-opponent candidate and 5M CPU as the low-resource fallback.
- MPS works on this M1, but 79M CPU was faster in local tests. Use MPS only when lowering CPU pressure matters more than latency.
- Keep the Maia-3 repo and model weights out of this skill folder; v1 stores them under `~/.skills/chess/runtime/maia3/`.
- Treat Lc0 only as a later neural-engine experiment unless Maia setup requires it.

## Agent Coaching Protocol

Consensus target: build an asynchronous sparse coach stream with an app-owned chat-mediated help ladder. The live product is a chess board plus a compact coach chat. It should feel like playing with a quiet Socratic coach nearby, not like operating an engine console.

- Use a board plus a small coach chat box. Do not expose separate nudge, direction, reveal, hint, engine-analysis, or best-move buttons in the v1 UI.
- The coach panel has a transcript, text input, remaining help/question count, and a subtle pending/expired status. It does not use coach cards.
- Most turns are quiet. The app may send one sparse automatic coach prompt only for critical positions, recurring learner themes, or direct threats.
- The user can type normal questions or intents such as `stuck`, `more`, `why`, or `reveal`. The app maps those into a fixed help ladder; the agent does not decide how much to give away.
- The app owns the help ladder, question budget, reveal permission, request metadata, stale matching, response filtering, and display decisions.
- Live coach replies use one tiny visible schema: `{ "message": "<text>" }`.
- Do not accept live reply titles, actions, reveal objects, review metadata, hidden fields, alternate body fields, or alternate quiet-message schemas.
- `{ "message": "" }` means only "display nothing" for an already-issued request. It must not carry hidden state.
- Never block chess play while waiting for the agent. If the agent has not replied yet, the user can keep moving.
- Drop or archive stale replies unless the request id, turn id, FEN hash, ply, and side-to-move still match the current board.
- Never show the best move, principal variation, eval, or raw engine output by default. Reveal is a typed, gated, budgeted request, not a visible button or normal path.
- Separate live coach packets from review packets. Live coaching stays compact and non-spoiler; review carries the richer game/engine truth.

V1 chat-mediated help ladder:

1. Think gate: ask for the opponent threat and two candidate moves.
2. General nudge: point to a search habit such as checks, captures, threats, loose pieces, king safety, or pawn tension.
3. Focal direction: name the theme or focal feature, not the move.
4. Concrete clue: narrow to a piece, zone, or action type while still avoiding SAN/UCI move names.
5. Gated reveal: only after typed intent and app permission; name one candidate to examine with a one-sentence idea, not "the best move", and no PV or eval.

V1 live coaching packet:

- The canonical source is compact JSON. Markdown may be generated from that JSON as a readable prompt veneer, but markdown is never the source of truth.
- `request`: request id, kind (`turn`, `followup`, or `reveal`), game id, turn id, FEN hash, ply, side-to-move, user text if any, ladder step, remaining budget, max words, and reveal permission.
- `position`: FEN, side to move, game status, phase/opening context when known, last full turn, recent plies, last user move, last Maia move, and compact legal SAN/UCI moves.
- `learner`: user color, current Maia level, calibration phase/confidence, stable wording preferences, and active themes capped at 3.
- `coachContext`: recent visible coach messages, visible messages this game, question/reveal usage, quiet preference, soft cap, and cadence reason.
- `analysis`: Stockfish-derived buckets and flags only: eval or win-probability bucket, last-move impact bucket, candidate quality buckets, tactical flags, threat map, and no raw engine logs.
- `humanLikeness`: Maia level/model, last Maia move, optional cheap human-like candidate signals, labeled as human-likeness rather than objective quality.
- `constraints`: non-spoiler policy, legal grounding, max visible length, reveal permission, and `doNotEcho` private SAN/UCI/PV/eval values.
- Do not include full PGN, full profile, raw UCI logs, raw evals, raw PVs, unguarded bestmove fields, review metadata, or long chat history in live packets.

Stockfish/Maia responsibilities:

- Stockfish is the private objective oracle: criticality, move quality buckets, tactics, review ordering, and hidden leakage-filter terms.
- Maia is the human-like practice opponent and optional learner-level signal: what a learner may plausibly see, miss, or be tempted to play.
- Do not merge Stockfish and Maia into one quality score. Stockfish determines chess truth; Maia calibrates human-likeness and teaching angle.

V1 live output rubric:

- The reply is exactly `{ "message": "<text>" }`.
- The message should be short, legal, position-specific, level-appropriate, and non-spoiler by default.
- Prefer one retrieval prompt or observation: threat, candidate moves, loose pieces, forcing moves, pawn tension, or a recurring learner theme.
- Do not reveal best moves, PVs, raw evals, raw engine output, or engine names unless the request is an explicit, app-permitted reveal.
- Run a response filter before display. Block or archive stale replies, overlong replies, illegal advice, private SAN/UCI/PV/eval echoes, engine-language leaks, or reveal phrasing without permission.
- Quiet positions should usually skip Relay. If a request was already issued, `{ "message": "" }` is allowed as a no-display response.

V1 review/report inputs:

- `game record`: full PGN, move list, result, colors, Maia level/model, final board state, and game metadata.
- `engine review`: deeper Stockfish analysis, win-probability impact, candidate quality, tactical flags, and critical-moment shortlist.
- `learner evidence`: calibration state, active themes, recurring mistakes, stable preferences, assistance level, question/reveal usage, and same-pool outcomes when available.
- `live trace`: visible coach messages, user follow-ups, stale replies, filtered replies, retries, reveal use, and learner self-notes when captured.
- `concept history`: tagged motifs, phase, cause, positives, review items, drill candidates, spaced-drill state, and prior drill outcomes.
- `leveling evidence`: result, severe errors, support needed, game completeness, and recommendation context for holding or changing Maia level.

V1 review/report rubric:

- Pick 3-5 instructive moments, not every small inaccuracy.
- Explain the cause in human terms: missed threat, weak candidate process, loose piece, king safety, development, calculation, conversion, defense, or endgame.
- Separate unaided success from helped success using the live coaching trace.
- Include at least one positive moment or habit that improved.
- Identify 1-3 recurring themes and the next practice focus.
- Suggest retry moments before revealing answers where possible.
- Convert only the most instructive misses into spaced drills.
- Recommend hold, raise, or lower Maia level with concrete evidence.

Packet safeguards:

- Live packets use FEN plus recent plies, not full PGN.
- Include only compact learner constraints, not the full profile.
- Parse Stockfish into normalized buckets, candidates, tactical flags, and win-probability impact. Do not send raw UCI logs.
- Do not include PV fragments in normal live packets. Include reveal-specific candidate data only for an explicit, app-permitted reveal request.
- Include compact SAN/UCI legal moves or highlighted candidates to reduce illegal-move hallucination.
- Include Maia human-like candidates only if the runtime can expose them cheaply; label them as human-likeness, not objective quality.
- Use opening/common-playable signals when available so early playable openings are not punished only because Stockfish dislikes them.
- Display a reply only when `requestId`, turn id, FEN hash, ply, and side-to-move still match.
- Run a response filter after the agent reply and before UI display. Block or archive replies that echo private SAN/UCI/PV/eval values or use reveal phrasing when the request is not an explicit reveal.
- V1 tuning defaults: start with 3 follow-up questions per game and a soft cap of 6-8 visible coach messages in a 20-30 move game; adjust after real Relay sessions.

## Current V1 Status

- `SKILL.md` defines the agent workflow.
- `package.json` owns the skill-local Node dependencies.
- `scripts/setup-maia.mjs` installs Maia-3 under `~/.skills/chess/runtime/maia3/`.
- `src/server.mjs` serves the board UI and owns the game loop.
- `public/` contains the browser board and coach panel.
- Relay now provides the reusable durable event queue for agent/browser coordination.
- `scripts/profile.mjs` stores the starting Maia calibration and optional provided level/source.
- Stub smoke tests pass without Maia.
- Maia-3 79M CPU is installed and has returned live moves through the server and browser UI.
- Maia-3 5M CPU fallback launches and returns a legal move through the server.
- Forced checkmate artifact test writes PGN with result, review JSON, session state, progress NDJSON, and events NDJSON.
- Browser move input is hardened: selecting a piece previews legal destinations, illegal click/drag attempts do not submit moves or break the UI, and repeated input enable/disable calls are idempotent.
- The board uses cm-chessboard's Markers, PromotionDialog, and non-input Accessibility extensions. Promotion choices were verified through the UI with non-queen UCI suffixes.
- Current Relay implementation still uses the old coach-card flow: hint buttons, blocking while live coaching is pending, bypass, full live payloads, and permissive card parsing. The next implementation pass should replace it with the asynchronous sparse coach stream, app-owned help ladder, strict `{ "message": "<text>" }` reply schema, pending request map, stale reply discard, and compact live packets above.
- Two real durable Maia 600 games have been completed and reviewed under `~/.skills/chess/`; the latest ended `1-0` by `Qc7#` with 22 user moves, 0 severe errors, and 13 legacy hint/live-help requests.
- The latest agent progress note keeps Maia at 600 for one more calibration game. Its old nudge/direction/reveal goal is superseded by the chat-mediated ladder above.
- Current Maia-3 79M server profile: first Maia-backed server move about 2.2s, warmed move about 0.5s, process RSS about 380-388 MB during sampled inference, sampled CPU peak about 29%.
- Initial-level research is complete enough for v1. See `research/LEVELING_SYSTEM.md`.

## Next Questions

- How well does the researched intake work after a formal intake session?
- How should the difficulty adjustment policy use severe errors, live help level, reveal use, and result after the current Maia 600 calibration games?
- How good is the agent-authored live chat ladder and review quality after real Relay sessions?
- Verify `window.__chessState` from a normal browser console; the in-app browser read scope could verify DOM/API state but could not read page-created globals directly.
- After implementing the new chat protocol, test compact JSON with generated prompt veneer against shorter packet variants in real Relay sessions.

## Research Anchors

- Agenda: `research/AGENDA.md`
- Thesis: `research/THESIS.md`
- Modes: `research/MODES.md`
- Level targets: `research/LEVEL_TARGETS.md`
- Initial leveling system: `research/LEVELING_SYSTEM.md`
- Rating conversion: `research/RATING_CONVERSION.md`
- Maia-3 feasibility: `research/MAIA3_FEASIBILITY.md`
- Engine alternatives: `research/ENGINE_ALTERNATIVES.md`
- Transfer evidence: `research/TRANSFER_EVIDENCE.md`
- Opponent model: `research/OPPONENT_MODEL.md`
- Coaching model: `research/COACHING_MODEL.md`
- Progress model: `research/PROGRESS_MODEL.md`
- PGN/FEN/EPD: https://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm
- NDJSON: https://github.com/ndjson/ndjson-spec
- chess.js: https://jhlywa.github.io/chess.js/
- cm-chessboard: https://github.com/shaack/cm-chessboard
- Stockfish UCI options: https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html
- UCI protocol: https://backscattering.de/chess/uci/
- Stockfish releases: https://github.com/official-stockfish/Stockfish/releases
- Training with AI: https://ideas.repec.org/a/bla/stratm/v44y2023i11p2724-2750.html
- Maia: https://arxiv.org/abs/2006.01855
- Maia-3: https://github.com/CSSLab/maia3
- Maia-2: https://papers.nips.cc/paper/2024/file/250190819ff1dda47cd23cecc0c5a69b-Paper-Conference.pdf
- Chess.com Play Coach: https://support.chess.com/en/articles/10877257-how-do-i-play-against-the-coach
- Chess.com Game Review: https://support.chess.com/en/articles/8584089-how-does-game-review-work
- Lichess Learn from your mistakes: https://lichess.org/@/lichess/blog/learn-from-your-mistakes/WFvLpiQA
- Dr. Wolf: https://www.learnchesswithdrwolf.com/
- DecodeChess: https://decodechess.com/features/
- Noctie: https://noctie.ai/
