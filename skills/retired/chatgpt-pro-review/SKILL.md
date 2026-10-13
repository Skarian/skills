---
name: chatgpt-pro-review
description: Use when the user explicitly asks Codex to consult ChatGPT Pro through the Codex app browser.
---

# ChatGPT Pro Review

Trigger: use only when the user explicitly asks to use ChatGPT Pro, ChatGPT Pro in the browser, or this skill by name.

## Availability Check

- This workflow requires the Codex desktop app browser capability.
- If browser automation is not available, state that this skill needs the Codex desktop app and ask the user to switch from CLI to the app.
- Do not substitute a generic web request, local shell command, or unrelated browser unless the user explicitly approves that fallback.

## Default Chat Choice

- Prefer starting a new ChatGPT chat.
- Reuse an existing ChatGPT chat only when the user asks for that chat or when preserving prior ChatGPT context is clearly more important than restating the context.
- When reusing an existing chat, briefly note why reuse is appropriate.

## Model Selection

- Ensure the ChatGPT Pro model is selected before submitting the prompt.
- If the exact label differs, choose the closest visible Pro-labelled ChatGPT model and mention the observed label in the final summary.
- If the Pro model is not available in the UI, stop and report that clearly instead of silently using another model.

## Prompt Construction

Write a self-contained prompt for ChatGPT Pro. Include enough context that the model can answer without hidden Codex state:

- the user's request and the exact question for ChatGPT Pro
- relevant repo, product, or task context
- what Codex has already tried or learned
- important constraints, acceptance criteria, and risk areas
- relevant file paths, snippets, errors, logs, screenshots, or artifact descriptions
- the desired output format

Keep the prompt focused. Prefer curated context over dumping unrelated files or logs.

Use this structure when it fits:

```text
I am using Codex and want a second-pass answer from ChatGPT Pro.

Task:
<the user's request>

Context:
<repo/task facts ChatGPT needs>

What has been tried or observed:
<short bullets, errors, screenshots, command results, open questions>

Attached files:
<list each uploaded file or zip and what it contains>

Question for you:
<specific question or deliverable>

Output format:
<requested format, constraints, and level of detail>
```

## Files And Attachments

- Attach individual files when they are small, directly relevant, or need visual inspection, especially images.
- Package related text/code files into a zip when multiple files are needed or directory structure matters.
- Keep zip contents minimal and task-focused.
- Do not include secrets, credentials, tokens, private keys, `.env` files, build caches, dependency directories, confidential source/customer data, private logs, or unrelated personal data.
- Ask for user approval before uploading sensitive or confidential material to ChatGPT.
- Before upload, summarize what will be sent and why if the contents are not obvious from the user's request.
- If upload fails or limits are hit, fall back to a smaller zip, individual key files, curated snippets, a file tree, or a pasted summary. Report any missing context in the final response.

Useful local packaging pattern:

```bash
zip -r /tmp/chatgpt-pro-context.zip <file-or-directory> -x '*/node_modules/*' '*/.git/*' '*/dist/*' '*/build/*' '*/.env*'
```

Adjust paths and excludes to the repo and task. Inspect the candidate file list before upload when there is any privacy or size risk.

## Browser Workflow

1. Open ChatGPT in the Codex app browser.
2. Start a new chat unless reuse is justified.
3. Select the ChatGPT Pro model.
4. Upload prepared files or images when useful.
5. Paste the self-contained prompt.
6. Submit and wait for completion.
7. Capture the answer and synthesize it for the user with Codex's own judgment.

Do not forward ChatGPT Pro's answer blindly. Classify material recommendations as accepted, rejected, or uncertain. Verify accepted findings against local files, tests, or docs when feasible, and call out remaining uncertainty.

## Waiting And Timeouts

- ChatGPT Pro responses can take up to 30 minutes.
- Do not abandon the attempt early just because the UI is slow.
- Poll patiently and provide short user updates while waiting.
- Treat transient loading, streaming pauses, and long reasoning phases as normal.
- If a browser tool call requires a timeout, prefer long waits or repeated polling up to roughly 30 minutes.
- Do not open duplicate chats unless the first attempt clearly failed.
- If interrupted, capture any partial output that is visible.
- Stop early only if the UI shows a clear failure, the user cancels, authentication is blocked, or browser automation becomes unavailable.

## Final Response

Report:

- whether a new chat or existing chat was used
- which Pro-labelled model was selected, if visible
- what files or zip archives were attached
- the useful ChatGPT Pro findings or answer
- Codex's accepted, rejected, and uncertain assessment of the findings
- any failures, missing access, or timeout limits reached
