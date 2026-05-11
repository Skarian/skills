# url-to-markdown-rjina

Project-level skill to download one or more web pages as markdown files using `r.jina.ai`.

Behavior:

- Requires a user-specified output folder.
- If folder is not provided, the skill asks and waits.
- Uses `curl` against `https://r.jina.ai/<url>` and writes `.md` files.
- Leaves the existing user-level `url-to-markdown` skill unchanged.
- Requires explicit network approval/escalation before each `curl` run.
- First-time indexing for a site may take several minutes; avoid stopping the run preemptively.

Install (Codex):

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill url-to-markdown-rjina -a codex -y
```

Install (Claude Code):

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill url-to-markdown-rjina -a claude-code -y
```
