# Engine Alternatives

## Current Policy

Use Maia-3 first.

Maia-3 is open, UCI-ready, locally tested, and has rating-conditioned human-move prediction. The largest available model, `maia3-79m`, is usable on this M1.

Use `maia3-79m` on CPU as the default practice opponent. Use `maia3-5m` as the low-resource fallback. Use MPS only when reducing CPU load matters more than move latency.

PyTorch MPS is real on Apple Silicon, but it has whole-model memory requirements and unsupported-op caveats. Local Maia-3 tests matter more than generic GPU assumptions here.

Sources:

- https://huggingface.co/docs/transformers/perf_train_special
- https://docs.pytorch.org/docs/2.12/notes/mps.html
- https://docs.pytorch.org/docs/2.12/mps_environment_variables.html

## Maia-3

- Best current fit for this skill.
- UCI-ready through `maia3-uci`.
- Models: 5M, 23M, 79M.
- Tested locally with CPU and MPS.
- 79M CPU is faster than 79M MPS on this machine, despite using more CPU/RSS.

Source: https://github.com/CSSLab/maia3

## Lc0 Human Sparring Networks

Good fallback research path if Maia-3 play feel is bad.

Lc0 has human sparring networks trained on human games, listed around 1100-2200 Elo. It supports UCI and broad hardware backends, including Apple Metal/MPS through Lc0 build options. Its Mac release path supports Apple Silicon. Operationally it is heavier than Maia-3 because it needs Lc0 plus network setup.

Sources:

- https://draft.lczero.org/play/networks/sparring-nets/
- https://github.com/LeelaChessZero/lc0
- https://lczero.org/dev/backend/
- https://lczero.org/play/download/

## Maia Web Platform

Useful for UI and browser-engine ideas, not a v1 engine dependency.

The Maia platform frontend runs Stockfish through WebAssembly and Maia through ONNX Runtime Web in the browser. That confirms a lightweight browser path is plausible, but the current local skill should start with the tested UCI path instead of adopting a web inference stack.

Source:

- https://github.com/csslab/maia-platform-frontend

## Nova

Worth watching.

Nova is a 99M style-conditioned transformer for human move prediction. It exposes rating, classical style, and aggression controls, ships ONNX weights, and claims roughly 35-50 ms CPU inference. It is not UCI-ready out of the box and has a custom non-commercial license.

Source:

- https://github.com/novachessai/novachess-engine

## ChessMimic

Interesting but not a near-term fit.

ChessMimic includes a frontend, FastAPI backend, move/clock/outcome models, and training code. It is source-available under PolyForm Noncommercial, uses Git LFS, and expects a multi-GB checkout with model artifacts.

Source:

- https://github.com/thomasj02/1e4_ai

## Other Projects Checked

These do not change v1:

- Allie / Allie v2: human-game transformer bots, but heavier Lichess/vLLM workflow rather than a simple local UCI engine.
- ShashChess: Stockfish-derived UCI engine with style/learning ideas, but not a human-move model.
- BrainLearn: Stockfish-family UCI engine with persisted learning data, interesting for later personal-game adaptation.
- DLChess: MIT AlphaZero-style UCI engine with ONNX Runtime, useful as a trainable-engine reference, not human-like by default.

Sources:

- https://github.com/ippolito-cmu/allie
- https://github.com/y0mingzhang/allie-v2
- https://github.com/amchess/ShashChess
- https://github.com/amchess/BrainLearn
- https://github.com/mcfarljm/dlchess
