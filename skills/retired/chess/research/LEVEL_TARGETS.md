# Level Targets

## Recommendation

Use `learn` as the first mode name, not `play`.

`learn` is the durable user-facing mode: it owns the beginner-to-intermediate curriculum, adaptive computer practice, review, and progress tracking. `play` is an activity inside `learn`.

## Learn-Mode Target

The long-term `learn` mode should aim for transfer-ready early intermediate, but the computer target should be higher than 1200-1400.

This is a long-term learn-mode target, not the first-game setting.
First-game settings come from `LEVELING_SYSTEM.md`; true beginners can start at Maia 600 because that is Maia-3's researched floor.

Practical target:

- Primary machine target: consistently handle a human-like computer opponent in the 1800-2000 band.
- Maia target: `Elo` / `OppoElo` 1800-2000 with the locally tested Maia-3 runtime.
- Stockfish fallback target: no fixed numeric graduation target. Treat Stockfish as harder and less human-like than its label, then adapt the setting from actual game results, live-help usage, and severe-error rate.
- Later calibration target: roughly Chess.com rapid 1300-1500, treated as a hypothesis, not a conversion.

This is not "strong at chess." It is the point where computer-first training should hand off to regular human-game calibration and post-game review.

## Transfer Point

Use two transfer points:

1. Human calibration starts before graduation.
   - The learner can finish normal games without constant live help.
   - Basic one-move blunders are declining.
   - The learner can name candidate moves and opponent threats.
   - The learner can play low-help games around the 1600-1800 human-like machine band, or comparable personally calibrated Stockfish settings.

2. Computer-first graduation starts at early intermediate.
   - The learner can play low-help or no-help games against the 1800-2000 human-like computer band, or comparable personally calibrated Stockfish settings.
   - Recent games show fewer severe errors, not just more wins.
   - Repeated tactical motifs and basic endgame failures have active drill history.
   - Human-game review can become a regular calibration tool.

## Why This Target

Ratings are not directly comparable across platforms, and generic engine Elo is not human Elo. Chess.com ratings measure skill within its pool using Glicko-style confidence, while Lichess says ratings cannot be directly compared between servers and its median rating stays close to 1500. Stockfish says rating it against a human scale such as FIDE Elo has become virtually impossible. For this skill, Stockfish should be treated as a sharp fallback opponent whose useful difficulty has to be learned from this user's games.

So the skill should use a machine-level target for daily progression, then build a personal calibration table from later human games.

## Sources

- Lichess rating systems: https://lichess.org/page/rating-systems
- Chess.com ratings: https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com
- Stockfish UCI options: https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html
- Stockfish FAQ: https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html
- Maia-3 UCI options: https://github.com/CSSLab/maia3
- Rating conversion: `research/RATING_CONVERSION.md`
