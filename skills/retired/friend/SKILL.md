---
name: friend
description: Use when the user asks to call a friend or get a CLI-backed second opinion from Claude or Codex.
---

# Friend

Use when the user asks to call a friend or wants a second opinion from another local CLI model.

Prefer Claude for UI, screenshots, and visual review; Codex for independent code, repo, plan, or process review.

Run the bundled `scripts/friend` wrapper:

Submit the shell command with sandbox escalation up front; do not try the wrapper inside the restricted sandbox first.

```bash
friend <claude|codex> "question" [evidence paths or URLs...] [--model name]
```

Evidence can be paths, directories, images, URLs, or `.`. Use the configured model unless the user asks for one. Treat the friend as read-only advice: summarize, adjudicate, and verify important claims instead of forwarding the answer blindly.
