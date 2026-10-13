# Coaching Model

## Finding

The best-supported coaching pattern is not "show the best move." It is:

- Make the learner think first.
- Ask for candidate moves and threat identification.
- Give graduated help only when stuck.
- Review critical moments afterward.
- Convert recurring mistakes into spaced drills.
- Fade assistance over time.

Live guidance belongs in local computer practice, but it should be a quiet sidecar rather than an engine assistant.

## In-Game Practice Guidance

Use a board plus a small coach chat. Do not expose the ladder as nudge, direction, reveal, best-move, or engine-analysis buttons.

The app owns a chat-mediated help ladder:

1. Think gate: ask for the opponent threat and two candidate moves.
2. General nudge: point to a search habit such as checks, captures, threats, loose pieces, king safety, or pawn tension.
3. Focal direction: name the theme or focal feature, not the move.
4. Concrete clue: narrow to a piece, zone, or action type while still avoiding SAN/UCI move names.
5. Gated reveal: only after typed intent and app permission; name one candidate to examine, not "the best move", with no PV or eval.
6. Ask the learner to explain why the candidate works, usually in review.

The user can type natural follow-ups such as `stuck`, `more`, `why`, or `reveal`. The app maps those to ladder steps and passes only the allowed help level to the agent.

Default constraints:

- No eval bar by default.
- No best move by default.
- No visible hint/reveal buttons.
- Live help budget or cooldown.
- Some unassisted games in every cycle.
- Assistance should fade as proficiency improves.
- Never block board play while the coach is pending.
- Most turns should stay quiet.

## Post-Game Review

1. Self-annotate first without an engine.
2. Identify opening surprise, critical moment, missed tactic, time-pressure decision, and emotional/attention failure.
3. Run engine/coach review second.
4. Retry key mistakes before seeing the answer.
5. Convert recurring or instructive misses into drills.
6. Revisit themes on a spaced schedule.

## Sequencing

- Beginner: rules, checkmates, piece safety, board vision, opening principles, basic tactics.
- Lower-intermediate: tactical motifs, blunder checks, basic endgames, simple plans, annotated own games.
- Intermediate: calculation discipline, defense, resourcefulness, pawn structures, model games, opening repertoire by ideas.
- Advanced: deep self-analysis, opening prep, endgame precision, prophylaxis, practical decision-making, time management.

## Product Patterns

- Dr. Wolf: beginner-friendly in-game verbal coaching, hints, undo, lessons.
- Chess.com review/coach: post-game classifications, summaries, key moves, retry mistakes.
- Lichess: transparent analysis, studies, puzzle themes, "learn from your mistakes."
- Chessable: spaced repetition for openings and endgames.
- Aimchess: aggregate analytics and personalized drills from recent games.
- Noctie: human-like practice partner plus mistake-based drills.
- DecodeChess: natural-language engine explanation and threat/planning views.
- Maia: human-move likelihood and likely blunder modeling.

## Evidence Quality

High for deliberate structured study, retrieval practice, spacing, and avoiding answer-first tutoring.

Medium for chess-product-specific improvement claims unless backed by published methods.

High for product-pattern observation, but product patterns are design evidence, not proof of rating improvement.
