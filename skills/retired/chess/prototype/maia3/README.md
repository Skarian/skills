# Maia-3 Prototype

Purpose: verify whether Maia-3 can run locally as the chess skill's human-like practice opponent.

This prototype keeps repo code small. The current installed runtime is under `~/.skills/chess/runtime/maia3/`; the old `/private/tmp` paths were only for the original feasibility probe.

## Live Probe

```bash
HF_HOME="$HOME/.skills/chess/runtime/maia3/hf-cache" \
MAIA3_BIN="$HOME/.skills/chess/runtime/maia3/venv/bin/maia3-uci" \
node skills/personal/chess/prototype/maia3/maia3-probe.mjs
```

Defaults:

- model: `maia3-5m`
- device: CPU
- AMP: off
- Elo: `1800`
- MultiPV: `3`
- model cache: `~/.skills/chess/runtime/maia3/hf-cache`

Reports are written to `prototype/maia3/results/` and ignored by git.

For a longer active CPU run:

```bash
HF_HOME="$HOME/.skills/chess/runtime/maia3/hf-cache" \
MAIA3_BIN="$HOME/.skills/chess/runtime/maia3/venv/bin/maia3-uci" \
MAIA3_REPEAT=300 \
node skills/personal/chess/prototype/maia3/maia3-probe.mjs
```

For the largest model:

```bash
HF_HOME="$HOME/.skills/chess/runtime/maia3/hf-cache" \
MAIA3_BIN="$HOME/.skills/chess/runtime/maia3/venv/bin/maia3-uci" \
MAIA3_MODEL=maia3-79m \
MAIA3_DEVICE=cpu \
node skills/personal/chess/prototype/maia3/maia3-probe.mjs
```

For Apple MPS:

```bash
HF_HOME="$HOME/.skills/chess/runtime/maia3/hf-cache" \
MAIA3_BIN="$HOME/.skills/chess/runtime/maia3/venv/bin/maia3-uci" \
MAIA3_MODEL=maia3-79m \
MAIA3_DEVICE=mps \
node skills/personal/chess/prototype/maia3/maia3-probe.mjs
```

## Historical Install Used For The First Probe

```bash
git clone --depth 1 https://github.com/CSSLab/maia3.git /private/tmp/maia3-prototype-src
/opt/homebrew/bin/python3.12 -m venv /private/tmp/maia3-prototype-venv
PIP_CACHE_DIR=/private/tmp/pip-cache /private/tmp/maia3-prototype-venv/bin/python -m pip install /private/tmp/maia3-prototype-src
HF_HOME=/private/tmp/maia3-hf-cache /private/tmp/maia3-prototype-venv/bin/maia3-cache --model maia3-5m
HF_HOME=/private/tmp/maia3-hf-cache /private/tmp/maia3-prototype-venv/bin/maia3-cache --model maia3-79m
```

Do not vendor the Maia-3 repo or model weights into this skill folder.
