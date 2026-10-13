# Chess

Personal chess learning skill.

## Direction

The v1 learning loop is a board-first practice app with a quiet coach chat beside it.

- Maia-3 plays the human-like opponent.
- Stockfish runs privately as the objective analysis oracle.
- Relay carries compact turn packets to the agent when live coaching is needed.
- The live coach is sparse and Socratic: it asks about threats, candidates, loose pieces, forcing moves, or a current learner theme.
- The UI should not expose nudge, direction, reveal, hint, best-move, engine-analysis, or bypass buttons.
- The app owns the help ladder. The user can type `stuck`, `more`, `why`, or `reveal`, and the app decides which ladder step is allowed.
- The agent only writes visible text through `{ "message": "<text>" }`; the app owns stale checks, budgets, reveal permission, filtering, and display.

Full explanations, exact moves, and drills belong primarily in post-game review.

## Install

```bash
npm install
npm run setup:maia
```

The Maia runtime and all personal data live under `~/.skills/chess/`.

After intake, save the starting calibration:

```bash
npm run profile -- --elo <level> --rating "<source level, if any>" --notes "<short intake>"
```

## Start

```bash
npm start
```

Open the printed local URL in the browser.

For agent-authored coaching, register the Relay MCP server first. Start chess normally, then have the agent call `relay({})`. Chess opens a relay session through the runtime client when it is available; local Stockfish text remains the fallback.

Live Relay packets should stay compact: FEN, recent plies, legal highlights, learner state, private Stockfish buckets/flags, optional Maia human-likeness signals, and response constraints. Do not send full PGN, full profile, raw engine logs, or live coach-card metadata.

The board is for `learn` mode. `puzzles` is deferred.

## Smoke Test

```bash
npm run smoke
```

The smoke test uses a stub opponent and writes only to the system temp directory.
It covers local fallback and Relay coach/review.
