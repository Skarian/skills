# Opponent Model

## Finding

The strongest researched default is not "Stockfish as the opponent." It is:

- Maia-3 as the preferred human-like sparring opponent; local setup is practical.
- Stockfish as the objective analysis and evaluation engine.
- Weakened Stockfish as the low-friction fallback opponent.

## Option Comparison

### Stockfish

Use full-strength Stockfish for analysis, tactics, candidate comparison, and objective post-game review.

Use weakened Stockfish only as a fallback sparring opponent. Its `Skill Level` and `UCI_Elo` controls are useful, but they weaken the engine by selecting suboptimal moves among engine candidates. That is not the same as modeling human play.

Sources:

- https://github.com/official-stockfish/Stockfish
- https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html
- https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html

### Maia

Maia-style models are designed to predict human moves by skill level, not to find the objectively best move. This is closer to the real-play training goal.

Maia-1 has strong research provenance but operational friction because it historically uses Lc0 plus Maia weights.

Maia-2 improves human-alignment modeling but appears better suited to analysis/inference workflows than a ready local UCI sparring engine.

Maia-3 is the current practical option because it is UCI-compatible, supports human-like calibration options, provides open model artifacts, and has run locally in this skill.

Sources:

- https://www.maiachess.com/
- https://github.com/CSSLab/maia-chess
- https://arxiv.org/abs/2006.01855
- https://github.com/CSSLab/maia2
- https://proceedings.neurips.cc/paper_files/paper/2024/hash/250190819ff1dda47cd23cecc0c5a69b-Abstract-Conference.html
- https://github.com/CSSLab/maia3
- https://huggingface.co/UofTCSSLab/Maia3-5M
- https://arxiv.org/abs/2605.19091

### Lc0

Lc0 is UCI-compatible and useful for neural-engine experiments, but it is heavier operationally than Stockfish. It is not human-like by default unless paired with human-style networks.

Sources:

- https://lczero.org/
- https://github.com/LeelaChessZero/lc0
- https://draft.lczero.org/play/networks/sparring-nets/

### Platform Bots

Chess.com bots are good product inspiration but poor as an agent-run default because the public API is read-only and bot ratings are product labels rather than transparent training measurements.

Lichess bots and bot APIs are more programmable, but account/API setup makes them a later integration target.

Sources:

- https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it
- https://support.chess.com/en/articles/8614091-how-can-i-play-against-the-chess-com-bots
- https://lichess.org/%40/lichess/blog/welcome-lichess-bots/WvDNticA
- https://github.com/lichess-bot-devs/lichess-bot
- https://lichess.org/page/api-tips

## Product Implications

- Do not define `learn` as "play weakened Stockfish." Maia-3 79M is locally feasible and should be the first practice-opponent candidate.
- Keep Maia-3 5M as the low-resource fallback.
- Keep Stockfish in the architecture as the oracle for analysis.
- Keep weakened Stockfish as the fallback opponent.

## Evidence Quality

High for Stockfish/Lc0 capabilities and platform API constraints.

High for Maia's general research thesis.

Medium-high for Maia-3 practical adoption: 5M and 79M both run locally, but Maia-3 is still new and may have tooling churn.

Low for platform bot rating labels as training measurements.
