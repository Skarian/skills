# Rating Conversion

## Finding

There is no reliable universal conversion from "computer rating" to human rating.

Do not use a 1200-1400 machine band as the graduation target for this skill. It is too low for the transfer goal and mixes human rating language with computer-practice difficulty.

Use different targets for different opponent types:

- Maia or human-like engines: use their conditioning labels as source-specific practice settings, not as the learner's rating.
- Stockfish `UCI_Elo`: treat as a local difficulty setting, not a human rating. Stockfish is often harder than a human at the same-looking number because it is tactically consistent, defends unnaturally well, and makes non-human weakened-engine mistakes.
- Chess.com bot ratings: treat as product difficulty labels, not transfer-proof ratings.
- Human games: use same-site, same-time-control rating as the external transfer check.

## Source Findings

### Stockfish

Stockfish says rating it against a human scale such as FIDE Elo has become virtually impossible.

Stockfish `UCI_Elo` is only active with `UCI_LimitStrength`, starts at 1320, and is calibrated at 120s+1s anchored to CCRL 40/4. That means it is an engine-rating calibration, not Chess.com rapid, Lichess rapid, USCF, or FIDE.

For training, Stockfish should be assumed harder and less human-like than its label suggests until personally calibrated. It can be a fallback opponent, but the setting should be chosen by whether the learner gets instructive games, not by a target number.

Sources:

- https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html
- https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html

### Maia

Maia is the better source for a human-like target. Maia was trained on human games at rating bands and evaluated by move-matching to human moves at those levels. Maia-1 covered 1100-1900 rating bands; Maia-3 targets the Lichess.org scale from 600 to 2600 and exposes UCI options including `Elo`, `SelfElo`, and `OppoElo`.

These labels are not a Chess.com, US Chess, FIDE, or learner-rating conversion. They are human-style conditioning labels from the model's training/evaluation context. They are still much closer to "practice against a human-like player at this level" than weakened Stockfish.

Sources:

- https://csslab.cs.toronto.edu/blog/2020/08/24/maia_chess_kdd/
- https://www.maiachess.com/
- https://github.com/CSSLab/maia3

### Lc0 Human Sparring Networks

Lc0 human sparring networks are explicitly framed for practicing against human-like opponents of specific levels, typically around 1100-2200 Elo. They are another possible route if Maia-3 is not practical.

Source:

- https://lczero.org/play/networks/sparring-nets/

### Chess.com Bots

Chess.com bots and computer play are powered by Komodo, are unrated, and expose product difficulty labels. The public bot bands are: beginner 250-850, intermediate 1000-1400, advanced 1500-2100, and master 2200-2450. Those ratings are useful UX labels and intake anchors, but should not be treated as proof of human rating transfer.

Source:

- https://support.chess.com/en/articles/8614091-how-can-i-play-against-the-chess-com-bots

### Human Platform Ratings

Lichess explicitly warns that ratings cannot be directly compared across servers. Chess.com ratings are pool-relative and use confidence/rating deviation. Human transfer should therefore be measured on one site, one time control, and enough games.

Sources:

- https://lichess.org/page/rating-systems
- https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com

## Revised Target

Use:

- Start human calibration around the 1600-1800 machine band.
- Graduate from computer-first training around the 1800-2000 machine band.
- If using Maia, interpret this as Maia/human-like `Elo` or `OppoElo` 1800-2000.
- If using Stockfish fallback, do not set graduation by `UCI_Elo`. Start lower, adapt difficulty from actual results and severe-error rate, and record the learner's personal calibration.
- Use human calibration games to test whether that corresponds roughly to Chess.com rapid 1300-1500 for this learner.

## Implementation Implication

The skill should build its own calibration table over time:

- opponent type
- opponent setting
- engine family
- live help used
- game result
- severe errors
- review result
- later human-game result

That personal calibration is more honest than hard-coding "computer X equals human Y."

For first-game intake and beginner/intermediate anchors, use `research/LEVELING_SYSTEM.md`.
