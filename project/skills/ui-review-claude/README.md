# ui-review-claude

Project-level skill for adaptable UI screenshot review through the installed Claude Code CLI.

Behavior:

- Runs `claude -p` non-interactively.
- Can review multiple screenshots concurrently by launching independent CLI calls.
- Supports local image paths and URL references.
- Defaults to `sonnet`, JSON output, no session persistence, and at least 2 turns.
- Adds local screenshot directories with `--add-dir` and allows `Read`.
- Keeps command construction adaptable instead of hiding it behind a wrapper.

Install (Codex):

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill ui-review-claude -a codex -y
```

Install (Claude Code):

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill ui-review-claude -a claude-code -y
```

Example local screenshot command:

```bash
claude -p "Inspect this screenshot and describe what is visible. Image path: /absolute/path/to/screenshot.png" \
  --model sonnet \
  --output-format json \
  --max-turns 2 \
  --no-session-persistence \
  --add-dir /absolute/path/to \
  --allowedTools Read
```
