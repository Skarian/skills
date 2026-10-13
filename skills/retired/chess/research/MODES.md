# Mode Definitions

The skill has two user-facing modes: `learn` and `puzzles`.

`learn` is the first mode. It includes computer practice, review, drills, and progress tracking. `play` is an activity inside `learn`, not the top-level mode.

For beginner to intermediate, computer practice is the primary daily loop.

## Learn Mode

### Computer Practice

Computer practice is a local training-board session where live coaching is allowed.

Expected flow:

1. The user says "let's learn chess", "let's practice chess", "let's play", or "let's continue".
2. The agent opens the lightweight board UI.
3. The user plays moves in the UI.
4. The opponent is Maia-3 by default, otherwise weakened Stockfish.
5. Stockfish runs privately as an analysis oracle.
6. The agent gives sparse non-spoiler guidance through the coach chat when the app asks for it.
7. The completed game is saved as PGN.
8. The agent reviews the game and appends progress events.
9. The agent recommends the next drill, replay, or computer game.

Computer practice is useful for reps, guided thinking, targeted weaknesses, confidence, and beginner-to-intermediate progression. It should be structured: every game produces a review, and repeated mistakes produce drills.

### Human Calibration

Human games are not a v1 workflow. Later, completed games can be imported as calibration checks.

## Puzzles Mode

Puzzles are deferred.

When implemented, puzzles should mostly come from the user's real games and practice misses rather than a generic puzzle feed.

Expected future flow:

1. Select positions from repeated mistakes, severe errors, or unfinished review items.
2. Store positions as EPD when possible, with agent metadata separately.
3. Ask the learner to solve without engine output.
4. Track first-try accuracy, solve time, retries, motif, phase, and delayed recall.
5. Schedule spaced reviews for missed or fragile positions.

Puzzles should reinforce computer practice. They should not become a separate metric treadmill.

## Coach Chat Ladder

Use the same non-spoiler ladder in computer practice and review retries, but do not expose it as visible hint/reveal buttons.

The live UI is board plus a compact coach chat. The user can type natural follow-ups such as `stuck`, `more`, `why`, or `reveal`; the app maps those to the allowed ladder step.

1. Think gate: ask what the opponent is threatening and ask for two candidate moves.
2. General nudge: point to a search habit such as checks, captures, threats, loose pieces, king safety, or pawn tension.
3. Focal direction: narrow attention to a piece, square, file, tactical motif, king-safety issue, or endgame resource.
4. Concrete clue: give a partial clue without naming the exact move.
5. Gated reveal: only after typed intent and app permission; name one candidate to examine, not "the best move", with no PV or eval.
6. Ask the learner to explain why the candidate works, usually in review.

## V1 Acceptance Criteria

The first useful version is complete when an agent can:

- Start or resume a local computer-practice game.
- Save a valid PGN.
- Review the just-finished practice game.
- Use Stockfish for hidden analysis.
- Give graduated, non-spoiler guidance through coach chat.
- Keep board play nonblocking while coach replies are pending.
- Drop or archive stale live replies instead of showing them on a new position.
- Update progress under `~/.skills/chess/`.
- Recommend the next practice target from actual mistakes.
- Track progress toward the transfer-ready early-intermediate target.

Maia-3 79M is locally feasible and is the first practice-opponent candidate. Maia-3 5M is the low-resource fallback. Weakened Stockfish remains the fallback if Maia-3 is unavailable. Generic Stockfish or bot ratings should be treated as local difficulty settings until calibrated against reviewed games.
