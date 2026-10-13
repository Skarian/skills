# Initial Leveling System

## Finding

Do not ask the learner for a generic Elo, and do not call the Maia setting the learner's rating.

Accept a user-provided level when they have one, but require the source. If they do not have one, use the question-based intake. Either way, treat the first few games as calibration. The target is a complete, reviewable, instructive game, not a perfect rating estimate.

## Evidence

- Chess.com bot bands are the clearest product anchor: beginner bots are 250-850, intermediate bots are 1000-1400, advanced bots are 1500-2100, and bot games are unrated.
- Chess.com live ratings are pool-local and confidence-based. New chess users commonly start at 400 or 800, depending on onboarding choice.
- Lichess starts new players at 1500 and says ratings cannot be directly compared across servers.
- Lichess AI level is 1-8, not an Elo scale.
- Maia-3 is a human-move prediction engine, not a strength-maximizing engine. It targets the Lichess.org rating scale from 600 to 2600 and exposes `Elo`, `SelfElo`, and `OppoElo`.
- ChessKid ratings start at 800, are local to ChessKid, and the product supports complete beginners up to about 1600.
- Dr. Wolf uses beginner/intermediate language and adaptive difficulty, but no public Elo map. Its useful pattern is challenge without overwhelm.
- Noctie uses human-like play at the learner's level and publishes rough cross-platform labels, while warning that rating systems can differ by 400+ points.
- US Chess gives a useful OTB label anchor: Class C 1400-1599 is intermediate; 1399 and below is novice/beginner. FIDE is not useful for true beginners because ratings below 1400 are not published.

## Policy

1. Ask whether the learner already has a level they trust.
   If yes, record exact source details:
   - Platform.
   - Time control.
   - Rating or bot/level that felt fair.
   - Whether the rating is recent and stable.
   If no, use rule fluency, full-game experience, blunder pattern, and desired first-game difficulty.

2. Prefer evidence in this order:
   - Recent stable Lichess rapid/blitz rating: strongest prior for Maia because Maia is Lichess-scale. Round to a practical Maia setting and clamp to 600-2600.
   - Chess.com rapid/blitz, ChessKid, US Chess, or FIDE: useful prior, but store the source and do not convert as fact.
   - Chess.com bot band, Lichess AI level, Dr. Wolf difficulty, or Noctie rating test: useful product signals, not ratings.
   - No provided level: infer from the intake questions.

3. For true beginners, separate rules coaching from rating:
   - If legal moves, checkmate, castling, promotion, or stalemate are still shaky, start at Maia 600 because that is Maia-3's researched floor.
   - If the learner is below that in practical terms, keep Maia at 600 and make the agent coaching gentler. Do not invent sub-600 ratings.

4. For unrated players who can finish games:
   - Start low enough that the game can finish and produce useful review.
   - Use Chess.com's beginner-bot range as the mental anchor for gentle first games.
   - Use Chess.com's intermediate-bot range only after the learner has shown full-game stability or has outside evidence.

5. Phrase the result as calibration:
   - Say "I'll start Maia at X for calibration."
   - Do not say "you are X rated."

6. Adjust from game evidence:
   - Lower by 100-200 if the game collapses early, rules confusion appears, live-help use is high, or the learner is overwhelmed.
   - Hold if the game is complete, mixed, and reviewable.
   - Raise by 100-200 if the learner wins or holds comfortably with little live help and few severe errors.

## Data To Store

Keep these as structured profile fields when the helper grows beyond the current small script:

- `sourceRatings`: platform, time control, rating, date, confidence.
- `providedLevel`: exact user-provided rating, bot level, or app difficulty, if any.
- `currentMaiaElo`: current Maia setting.
- `calibrationSource`: why this setting was chosen.
- `lastAdjustmentReason`: why the level moved or stayed.
- Live-help count, reveal count, `severeErrorCount`, result, and review summary per game.

## Sources

- Chess.com bot bands: https://support.chess.com/en/articles/8614091-how-can-i-play-against-the-chess-com-bots
- Chess.com starting ratings: https://support.chess.com/en/articles/8614256-what-is-the-number-next-to-my-name-what-does-it-mean
- Chess.com rating system: https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com
- Lichess rating systems: https://lichess.org/page/rating-systems
- Lichess AI API level: https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/tags/challenges/api-challenge-ai.yaml
- Maia Chess: https://www.maiachess.com/
- Maia-3 UCI options: https://github.com/CSSLab/maia3
- Maia3-79M model card: https://huggingface.co/UofTCSSLab/Maia3-79M
- ChessKid ratings: https://support.chesskid.com/en/articles/8863344-how-do-ratings-work-does-the-site-link-to-my-uscf-or-other-international-rating
- ChessKid range: https://support.chesskid.com/en/articles/8863001-what-age-range-is-chesskid-designed-for
- Dr. Wolf App Store: https://apps.apple.com/us/app/learn-chess-with-dr-wolf/id1353041020
- Noctie rating guide: https://noctie.ai/chess/what-is-a-good-chess-rating/
- Noctie product positioning: https://noctie.ai/
- US Chess FAQ: https://new.uschess.org/frequently-asked-questions-faqs
- FIDE rating rules: https://handbook.fide.com/chapter/B022024
- ChessGoals rating comparison: https://chessgoals.com/rating-comparison/
