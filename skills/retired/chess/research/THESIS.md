# Chess Skill Thesis

## Conclusion

The project is viable, but not as a pure "play Stockfish with hints" trainer.

For beginner to intermediate, the evidence supports a computer-practice loop if the practice is structured:

1. Practice on a local board against a calibrated computer opponent.
2. Make the learner think first, using candidate moves and threat checks.
3. Review each completed practice game instead of just starting another bot game.
4. Use a human-like opponent when practical, and Stockfish as the objective oracle.
5. Convert repeated mistakes into drills and spaced review.
6. Use occasional human games later as calibration.

This should become a personal agent-run chess training suite, not a standalone chess app and not an engine bot wrapper. The first user-facing mode should be `learn`; playing games is one activity inside that mode.

## Why Stockfish Alone Is Not Enough

Stockfish is essential, but its best role is analysis. It is strong, local, UCI-compatible, and exposes useful controls such as `MultiPV`, `UCI_LimitStrength`, `UCI_Elo`, and `Skill Level`.

Those strength controls are useful for a fallback practice opponent, but weakened Stockfish is still an engine selecting suboptimal engine moves. That is not the same as modeling the mistakes, plans, time-pressure choices, and exploitable inaccuracies that human opponents make.

The strongest research finding here is not "engines do not help." They can help, especially when human training opportunities are scarce. The problem is narrower: passive engine sparring is a weak thesis for real human-play improvement. Engine feedback transfers best when the learner thinks first, reviews games, and trains recurring weaknesses.

## Preferred Roles

- Stockfish: objective analysis, candidate checking, tactical punishment, post-game review, and hidden best-line comparison.
- Maia-3: preferred candidate for human-like sparring; local setup is practical.
- Weakened Stockfish: low-friction fallback opponent, not the core learning thesis.
- Human games: later calibration, not a v1 workflow.
- Puzzles: future reinforcement layer generated from repeated misses, not the first proof of the project.

## First-Version Recommendation

Build v1 as a computer-practice-first loop with review built in:

1. Open a local training board for guided practice games.
2. Use Maia-3 as the first human-like practice-opponent candidate.
3. Fall back to weakened Stockfish if Maia-3 setup is too heavy or unstable.
4. Run Stockfish privately as the analysis oracle.
5. Provide sparse live coaching through a small chat sidecar with an app-owned help ladder.
6. Keep live replies non-spoiler by default and never block board play while the coach is pending.
7. Save every practice game as PGN.
8. Ask the learner for a short self-review before engine analysis.
9. Run Stockfish analysis to identify severe errors, missed tactics, opening surprises, conversion failures, and endgame mistakes.
10. Convert repeated mistakes into drills and spaced review.
11. Append durable progress events under `~/.skills/chess/`.

This matches the goal of using computer practice to reach intermediate level while avoiding the weak version of the thesis: unstructured bot grinding.

The long-term learn-mode target is transfer-ready early intermediate: low-help or no-help games against a calibrated 1800-2000 human-like computer band. This is not the starting setting. Initial Maia level comes from the researched intake in `LEVELING_SYSTEM.md`, and true beginners can start at Maia 600 plus gentler coaching.

## Maia-3 Feasibility

Maia-3 runs locally as a UCI engine.

The prototype returned best moves and MultiPV lines in live tests. The 5M CPU model is very light. The 79M model is also usable locally and should be the quality default.

Use Maia-3 79M CPU as the first practice-opponent candidate. Keep Maia-3 5M CPU as the low-resource fallback. MPS works on this M1, but CPU was faster in local tests; use MPS only when lowering CPU pressure matters more than latency.

Keep Stockfish as the analysis oracle and fallback opponent.

## Core Sources

- Training with AI: https://doi.org/10.1002/smj.3512
- Deliberate practice in chess: https://doi.org/10.1002/acp.1106
- Stockfish UCI options: https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html
- Maia-3: https://github.com/CSSLab/maia3
- Maia-3 model card: https://huggingface.co/UofTCSSLab/Maia3-5M
- Maia-3 79M model card: https://huggingface.co/UofTCSSLab/Maia3-79M
- Maia-3 feasibility: `research/MAIA3_FEASIBILITY.md`
- Engine alternatives: `research/ENGINE_ALTERNATIVES.md`
- Level targets: `research/LEVEL_TARGETS.md`
- Rating conversion: `research/RATING_CONVERSION.md`
