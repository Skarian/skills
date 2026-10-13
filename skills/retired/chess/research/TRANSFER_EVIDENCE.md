# Transfer Evidence

## Finding

Engine and computer training can transfer to stronger play against human opponents, but the evidence supports structured training rather than passive bot grinding.

The strongest thesis is: engines are useful as sparring partners when human partners are scarce, as feedback tools after the learner thinks first, and as objective analysis tools for real games. Engines should not be treated as the whole curriculum.

## Strong Evidence

- Gaessler and Piezunka studied the diffusion of chess computers across 20,000+ players and 500,000+ tournament games. Access to chess computers improved human tournament performance, especially where human training opportunities were scarce, but computer-trained players did not equally learn to exploit idiosyncratic human mistakes.
- Charness et al. found serious solitary study, tournament play, and instruction all correlate with chess skill; serious study alone was the strongest predictor in their samples.
- Large deliberate-practice and expertise literature supports structured, challenging practice, but warns that practice volume alone does not explain all performance variance.

Sources:

- https://doi.org/10.1002/smj.3512
- https://ideas.repec.org/a/bla/stratm/v44y2023i11p2724-2750.html
- https://doi.org/10.1002/acp.1106
- https://doi.org/10.1177/0956797614535810

## When Engine Training Helps

- The opponent is strong enough to challenge the learner.
- Human practice partners are scarce.
- The learner generates candidate moves before seeing engine feedback.
- The work is tied to real games and repeatable mistakes.
- Engine output is translated into human-playable concepts.
- Training targets concrete skills: tactics, endgames, conversion, opening survival, calculation, and blunder diagnosis.

## When Engine Training Fails

- The learner just plays bots without review.
- The bot is too weak, too strong, or weakened in non-human ways.
- The skill teaches Stockfish's best move without explaining a human-usable idea.
- The learner overfits to engine precision or memorized lines.
- Training ignores time management, opponent modeling, candidate generation, and practical human mistakes.

## Product Implications

- The skill should use Stockfish as a feedback microscope, not as the whole training environment.
- Later human-game import and review should become a calibration path, not a v1 dependency.
- Bot play should produce review artifacts, drills, and progress updates.
- Human-like opponent modeling is important because `learn` uses computer practice to prepare for real opponents.
- Real improvement should be measured against human-play outcomes, not only bot wins.

## Evidence Quality

High for the claim that AI/chess computers can improve human tournament performance under some conditions.

Medium for modern Stockfish-specific training transfer, because direct randomized evidence for "play weakened Stockfish to improve at online human chess" appears limited.

Low for broad product claims from chess-training marketing pages unless supported by data.
