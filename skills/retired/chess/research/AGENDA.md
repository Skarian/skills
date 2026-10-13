# Chess Skill Research Agenda

This research phase tested the core thesis: can a personal agent-run chess skill build beginner-to-intermediate chess strength through structured computer practice?

## Evidence Standard

- Prefer peer-reviewed papers, official docs, primary project docs, datasets, and serious product evidence.
- Distinguish evidence for real human-play improvement from evidence for engine accuracy or product convenience.
- Treat claims from blogs, forums, and product pages as leads unless backed by data or implementation detail.
- Record tradeoffs and failure modes, not only positive evidence.
- Keep sources linked and summarize why each source matters.

## Core Questions

- Does computer practice transfer beyond bot wins?
- Is Stockfish an opponent, coach, analyst, or oracle?
- Are human-like engines such as Maia better for practice games?
- How should the first Maia level be selected for beginners and intermediates?
- What progress signals matter before human calibration?
- What should the first version prove?

## Research Tracks

1. Transfer Evidence
   - Research chess-computer and engine-training studies.
   - Compare serious study, puzzles, coaching, databases, and engine play.
   - Identify what evidence exists for rating or human-opponent improvement.

2. Opponent Model
   - Compare Stockfish, weakened Stockfish, Maia, Lc0, and mixed approaches.
   - Evaluate human-likeness, operational complexity, availability, and training value.
   - Done: `learn` starts with Maia-3 79M CPU by default, 5M CPU as fallback, and npm WASM Stockfish for private live analysis and review.

3. Coaching Model
   - Research how chess tutors and training products give non-spoiler guidance.
   - Identify chat-mediated help ladders, feedback timing, post-game review patterns, and risks of dependency.
   - Decide what the agent should do during play versus after play.

4. Product/Workflow Survey
   - Study Learn Chess with Dr. Wolf, computer practice products, review tools, spaced-repetition tools, and Maia-style approaches.
   - Extract reusable workflow patterns without copying product scope.

5. Data and Progress Model
   - Research rating estimates, centipawn loss, blunder rates, puzzle performance, concept tracking, spaced repetition, and review metrics.
   - Decide what durable data the skill should track.

6. Initial Leveling
   - Research what chess products and rating systems use for beginner and intermediate labels.
   - Decide how the agent should select a first Maia setting without inventing a rating conversion.
   - Done: use `LEVELING_SYSTEM.md`.

## Decision Outputs

- A thesis note summarizing whether the project is viable and what should be built first.
- A mode-definition note for `learn` and `puzzles`.
- A researched recommendation for the first version.
- An updated roadmap with only current decisions.

## Kill Or Redirect Criteria

- If passive bot play has weak transfer, require review and drills after each game.
- If Stockfish is too hard or non-human as an opponent, use it mainly as oracle and fallback.
- If human-like engine setup is feasible and materially better, consider Maia or equivalent early.
- If no agent-run loop can provide meaningful feedback without being annoying or spoilery, shift toward review and drills.
