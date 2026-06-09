# Maia-3 Feasibility

## Finding

Maia-3 is feasible locally for the first `learn` prototype.

Both the 5M and 79M models run as UCI engines locally. The 79M model is usable on this M1 and should be the default quality target. Use 5M as the low-resource fallback.

## Historical Prototype Setup

These paths were used for the original isolated feasibility probe. The current v1 runtime lives under `~/.skills/chess/runtime/maia3/`.

- Upstream repo: `https://github.com/CSSLab/maia3.git`
- Local source clone: `/private/tmp/maia3-prototype-src`
- Python: `/opt/homebrew/bin/python3.12`
- Virtualenv: `/private/tmp/maia3-prototype-venv`
- Model cache: `/private/tmp/maia3-hf-cache`
- Models tested: `maia3-5m`, `maia3-79m`
- Devices tested: CPU, MPS
- AMP: off
- Elo: `1800`
- MultiPV: `3`
- Probe: `prototype/maia3/maia3-probe.mjs`

## Current V1 Runtime Setup

The implemented skill setup stores Maia under:

- Source clone: `~/.skills/chess/runtime/maia3/src`
- Virtualenv: `~/.skills/chess/runtime/maia3/venv`
- Model cache: `~/.skills/chess/runtime/maia3/hf-cache`

The setup command is:

```bash
npm run setup:maia
```

## Historical Install Commands

```bash
git clone --depth 1 https://github.com/CSSLab/maia3.git /private/tmp/maia3-prototype-src
/opt/homebrew/bin/python3.12 -m venv /private/tmp/maia3-prototype-venv
PIP_CACHE_DIR=/private/tmp/pip-cache /private/tmp/maia3-prototype-venv/bin/python -m pip install /private/tmp/maia3-prototype-src
HF_HOME=/private/tmp/maia3-hf-cache /private/tmp/maia3-prototype-venv/bin/maia3-cache --model maia3-5m
HF_HOME=/private/tmp/maia3-hf-cache /private/tmp/maia3-prototype-venv/bin/maia3-cache --model maia3-79m
```

## Live UCI Tests

Short run:

- Report: `prototype/maia3/results/2026-06-06T00-05-01-780Z-maia3-maia3-5m-cpu.json`
- Handshake: 1412 ms
- Ready: 183 ms
- Move requests: 3
- Average move latency: 61 ms
- Best moves returned:
  - start position: `e2e4`
  - Ruy Lopez-ish opening position: `g8f6`
  - Queen's pawn position: `c1f4`

Stress run:

- Report: `prototype/maia3/results/2026-06-06T00-04-37-910Z-maia3-maia3-5m-cpu.json`
- Move requests: 900
- Average move latency: 42 ms
- Median move latency: 51 ms
- p95 move latency: 53 ms
- Max observed move latency: 355 ms

## 79M Results

CPU stress run:

- Report: `prototype/maia3/results/2026-06-06T00-13-14-824Z-maia3-maia3-79m-cpu.json`
- Move requests: 300
- Average move latency: 169 ms
- Median move latency: 157 ms
- p95 move latency: 184 ms
- Max observed move latency: 274 ms
- Average RSS: 811 MB
- Max RSS: 835 MB
- Average CPU: 105%
- Max CPU: 114%

MPS stress run:

- Report: `prototype/maia3/results/2026-06-06T00-14-42-080Z-maia3-maia3-79m-mps.json`
- Move requests: 300
- Average move latency: 264 ms
- Median move latency: 260 ms
- p95 move latency: 291 ms
- Max observed move latency: 572 ms
- Average process RSS: 285 MB
- Max process RSS: 517 MB
- Average CPU: 21%
- Max CPU: 94%

MPS works, but CPU is faster for 79M on this M1. MPS reduces CPU load and process RSS, but `ps` does not show total GPU/Metal memory.

## Current V1 Server Checks

The implemented Node server was tested against the current runtime under `~/.skills/chess/runtime/maia3/` using temp data roots.

- `maia3-79m` CPU API smoke: `e2e4` accepted, Maia replied `e7e5`, illegal user move returned `400`, legacy hint and review APIs worked.
- `maia3-5m` CPU fallback smoke: `e2e4` accepted, Maia replied `e7e5`.
- Browser UI smoke: board drag `e2e4` worked, Maia replied, invalid drag did not mutate the game, legacy hint buttons worked, and Review wrote JSON.
- Forced checkmate artifact smoke: PGN, review JSON, current session, progress NDJSON, and events NDJSON were written.
- 79M server move latency: about 2.2s for first Maia-backed move through the server, about 0.5s for a warmed move.
- 5M fallback first Maia-backed server move: about 1.1s.
- 79M process profile during one warmed server move: RSS about 389-398 MB; sampled `%CPU` peaked around 29%.

These server-level samples measure a short warmed move through the implemented skill. The prototype stress numbers above measure sustained direct UCI load and are not the same benchmark.

## CPU And Memory

External `ps -p` samples were required because this sandbox blocks process sampling from inside Node.

Idle after model load:

- RSS: 257,488 KB, about 251 MB
- CPU: 0.0%

Active 900-request benchmark:

- Sample 1: 250,128 KB RSS, about 244 MB; 71.6% CPU
- Sample 2: 241,504 KB RSS, about 236 MB; 76.8% CPU
- Sample 3: 235,600 KB RSS, about 230 MB; 96.7% CPU

Disk footprint:

- Python virtualenv: 632 MB
- Hugging Face model cache with 5M and 79M: 321 MB
- Maia-3 source clone: 516 KB
- `maia3-5m.pt`: 20 MB
- `maia3-79m.pt`: 301 MB

## Decision

Use Maia-3 79M CPU as the first high-quality practice-opponent candidate.

Use Maia-3 5M CPU as the low-resource fallback.

Use MPS only if CPU pressure matters more than latency.

Stockfish remains the required analysis oracle and fallback opponent.

## Remaining Work

- Test play feel from the researched intake range: Maia 600 for rules-level learners, a user-provided source level when available, and 1600-2000 for the long-term transfer target.
- Tune difficulty adjustment after real learner games.
