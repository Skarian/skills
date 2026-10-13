---
name: chess
description: Run a personal chess learning loop with Maia-3 practice games, sparse chat-mediated coaching, durable progress, and post-game review.
---

Use when the user says "let's learn chess", "let's practice chess", "let's play chess", or "let's continue chess".

## Workflow

1. If `~/.skills/chess/profile.json` is missing, do a short intake in chat.
   First ask whether the user already has a chess level they trust. If yes, record the source: platform/app, time control or bot/difficulty, value, recency, and whether it feels accurate.
   If not, ask concrete questions and infer a starting point:
   - Which rules are solid: legal piece moves, checkmate, castling, promotion, en passant, stalemate?
   - Have they finished full games before? If yes, where, what time control, and any rating or bot level?
   - What usually goes wrong: illegal moves, hanging pieces, missed one-move tactics, opening confusion, endgames, or time pressure?
   - Can they usually name opponent threats and candidate moves before moving?
   - Do they want the first game to be gentle, normal, or challenging?
2. Pick the starting Maia level as a calibration guess, not a user rating.
   Use `research/LEVELING_SYSTEM.md`. Accept a trusted user-provided level with source details; prefer stable Lichess rapid/blitz as the best Maia prior; treat Chess.com, ChessKid, US Chess, FIDE, bot levels, and app difficulty as source-specific signals, not direct conversions.
   If the learner is below Maia-3's 600 floor in practical terms, start Maia at 600 and make the coaching gentler. Do not invent sub-600 ratings.
   Do not present a fixed rating table to the user. Say "I'll start Maia at X for calibration," then adjust after the first game based on whether the game was complete, instructive, and not demoralizing.
3. Save the profile:
   `npm run profile -- --elo <level> --rating "<provided level/source, if any>" --notes "<short intake summary>"`
4. Ensure dependencies and Maia runtime exist:
   - `npm install`
   - `npm run setup:maia`
5. For agent-authored live coaching:
   - confirm the Relay MCP tool is available
   - start the chess board; the app opens a relay session through the runtime client
   - call `relay({})`
6. Start the board:
   `npm start`
7. Open the printed localhost URL with the available browser tool.
8. During play, use the UI for all moves. Do not block play while waiting for live coaching.
   - The live UI direction is board plus a compact coach chat.
   - There should be no nudge, direction, reveal, hint, best-move, or bypass buttons.
   - The user can type follow-ups such as `stuck`, `more`, `why`, or `reveal`; the app owns the help ladder and reveal permission.
   - Agent-authored live replies use only `{ "message": "<text>" }`.
   - Quiet turns may skip Relay or return `{ "message": "" }`.
9. After the game, run review from the UI, let the review panel populate, then append a concise progress note:
   `npm run progress -- --game-id <game-id> --summary "<review summary>" --next-elo <level>`

## Rules

- Use Maia-3 as the practice opponent: default `maia3-79m` CPU, fallback `maia3-5m` CPU.
- Use npm WASM Stockfish as the private objective oracle for live coaching and review.
- Use Relay for agent-authored live chat and review when it is available. Use local Stockfish text when it is not.
- Treat Maia as the human-like opponent and optional human-likeness signal, not as objective move quality.
- Do not reveal best moves, PVs, evals, or raw engine output in live coaching unless the user explicitly types a reveal request and the app permits that ladder step.
- Keep live packets compact: FEN, recent plies, legal highlights, learner state, buckets/flags, and constraints. Do not send full PGN, full profile, raw engine logs, or coach-card metadata in live packets.
- Store models, runtime, games, reviews, sessions, and progress under `~/.skills/chess/`.
- Do not put Maia models, virtualenvs, or user chess data in this repo.
- `puzzles`, timed games, human-game imports, Lc0, and Nova are out of v1.
