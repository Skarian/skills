# chatgpt-pro-review

Project-level skill for consulting ChatGPT Pro through the Codex desktop app browser when explicitly requested.

Behavior:

- Requires Codex app browser support; CLI-only sessions should ask the user to switch to the app.
- Prefers a new ChatGPT chat unless reuse is justified by the task.
- Selects a Pro-labelled ChatGPT model and stops if Pro is unavailable.
- Builds a self-contained prompt with relevant task context, prior observations, attachments, and desired output.
- Uploads focused individual files or a minimal zip archive when attachments will help, with privacy checks and upload fallbacks.
- Waits patiently for long-running Pro responses, with polling guidance up to about 30 minutes and no duplicate chats unless the first clearly failed.
- Synthesizes ChatGPT Pro's answer into accepted, rejected, and uncertain findings instead of forwarding it uncritically.

Install (Codex):

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill chatgpt-pro-review -a codex -y
```
