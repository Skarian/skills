---
name: url-to-markdown-rjina
description: Download one or more URLs as markdown files into a user-specified folder using r.jina.ai.
---

# URL to Markdown (r.jina.ai)

Trigger: use when the user asks to download URLs/web pages as markdown files in a folder.

## Required behavior

- Require an output folder path.
- If the user did not provide a folder, ask for it and wait.
- Never assume or invent an output folder.
- Accept one or more URLs.
- Keep the existing user-level `url-to-markdown` skill unchanged; this skill is project-level and uses `r.jina.ai` + `curl`.
- Before any `curl` run, ask the user for network permission and wait for a clear approval for that run.
- Run `curl` with explicit network escalation (sandbox network permissions required); if escalation is not granted, do not run.
- If a site is being indexed by `r.jina.ai` for the first time, the fetch can take several minutes; do not stop early because output is delayed.
- Use a command timeout of at least 300 seconds when executing this workflow.

## Run

Codex project install path:

    bash "./.agents/skills/url-to-markdown-rjina/scripts/download_urls_md.sh" --out <output-folder> <url1> [url2 ...]

Codex global install path:

    bash "$HOME/.codex/skills/url-to-markdown-rjina/scripts/download_urls_md.sh" --out <output-folder> <url1> [url2 ...]

Claude Code project install path:

    bash "./.claude/skills/url-to-markdown-rjina/scripts/download_urls_md.sh" --out <output-folder> <url1> [url2 ...]

## Output expectations

- Save each URL as a `.md` file in the requested folder.
- Print one line per saved file in the format `saved<TAB><url><TAB><path>`.
- If a URL fails, print an error to stderr and continue with remaining URLs.
- At the end, report which files were created and which URLs failed.

## Notes

- `r.jina.ai` usage follows Jina Reader's documented pattern: prepend `https://r.jina.ai/` to the target URL.
- This skill writes files; it does not return markdown on stdout like the user-level Firecrawl skill.
