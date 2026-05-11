# My Personal Codex Skills Repository

Vercel `skills` CLI-compatible repository with separated source packs:

- `project/`: project-specific skills for repo-local installs.
- `user/`: user-level skills for global installs.

## Project-specific skills

List available skills

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --list -a codex
```

Interactive picker (choose a subset)

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project -a codex
```

### execplan-review

Use when the user requests a review of the ExecPlan.

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill execplan-review -a codex -y
```

### precommit-review

Use when the user requests a phased pre-commit review of the worktree.

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill precommit-review -a codex -y
```

### reference-module

Use to research git repos when user requests.

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill reference-module -a codex -y
```

### url-to-markdown-rjina

Download one or more URLs as markdown files in a user-specified folder using `r.jina.ai`.

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill url-to-markdown-rjina -a codex -y
```

## User-level skills

List available skills

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/user --list -a codex
```

Interactive picker (choose a subset)

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/user -a codex -g
```

### url-to-markdown

Local URL-to-markdown pipeline using Firecrawl self-hosted, with stdout output and idle shutdown.

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/user --skill url-to-markdown -a codex -g -y
```

## Install locations

| Agent | Project install                | Global install                  |
| ----- | ------------------------------ | ------------------------------- |
| Codex | `.agents/skills/<skill-name>/` | `~/.codex/skills/<skill-name>/` |
