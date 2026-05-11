---
name: ui-review-claude
description: Use when the user wants adaptable UI screenshot review or visual inspection through the installed Claude Code CLI.
---

# UI Review with Claude Code

Trigger: use when the user asks to review, inspect, compare, or summarize UI screenshots, visual states, or screenshot links with the installed Claude Code CLI.

## Operating principles

- Use the non-interactive Claude Code CLI path.
- Match the prompt and output shape to the user's task; do not force findings when the user asks for description, OCR, comparison, or triage.
- Hand-run `claude -p` commands directly so the review can adapt to the task.
- Run independent screenshots in parallel when speed matters and the images do not depend on each other.
- Use `--model sonnet`; the user's default `opus` setting may fail in non-interactive mode.
- Use at least `--max-turns 2`; local image review needs a tool turn to read the image and a response turn to report findings.
- For local image files, include the containing directory with `--add-dir` and allow `Read`.
- For URL images, pass the URL as the image reference. Treat URL vision through Claude Code CLI as less proven than local file review and report if a URL result appears to describe the URL rather than the image.
- Do not use `--bare` with the user's Claude Pro OAuth login unless an API key or `apiKeyHelper` is explicitly configured; `--bare` skips OAuth/keychain auth.

## Prompt patterns

Choose the smallest prompt that fits:

- Description: "Inspect this screenshot and describe what is visible. Be concise."
- UI QA: "Review this UI screenshot for clipped text, overlap, layout breaks, contrast, broken states, and confusing hierarchy. Lead with material issues."
- Comparison: "Compare these screenshots. Identify visible regressions, intentional differences, and uncertain differences."
- Triage: "Review these screenshots independently. Return only blocking or high-confidence UI issues."

Avoid broad prompts like "make this better" unless the user explicitly wants open-ended critique.

## Command patterns

Single local screenshot:

    claude -p "Inspect this screenshot and describe what is visible. Image path: /absolute/path/to/screenshot.png" \
      --model sonnet \
      --output-format json \
      --max-turns 2 \
      --no-session-persistence \
      --add-dir /absolute/path/to \
      --allowedTools Read

Single screenshot URL:

    claude -p "Inspect this screenshot URL and report visible UI issues. Image URL: https://example.com/screenshot.png" \
      --model sonnet \
      --output-format json \
      --max-turns 2 \
      --no-session-persistence

Parallel local screenshots:

    claude -p "<prompt for screenshot A> Image path: /path/a.png" --model sonnet --output-format json --max-turns 2 --no-session-persistence --add-dir /path --allowedTools Read
    claude -p "<prompt for screenshot B> Image path: /path/b.png" --model sonnet --output-format json --max-turns 2 --no-session-persistence --add-dir /path --allowedTools Read

Launch the independent commands concurrently when using an execution tool that supports parallel calls.

## Output expectations

- Report one section per screenshot unless the user asks for a combined synthesis.
- Include the image reference, command status, and concise findings.
- Lead with material UI problems when doing UI QA.
- If no material UI problem is visible during UI QA, say so.
- If a Claude invocation fails, include the failing image reference and the error/status without hiding the failure.

## Verified local image command shape

The local image path workflow was validated with:

    claude -p "<prompt with image path>" --model sonnet --output-format json --max-turns 2 --no-session-persistence --add-dir <image-dir> --allowedTools Read
