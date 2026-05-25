# My Personal Codex Skills Repository

Vercel `skills` CLI-compatible repository with separated source packs:

- `project/`: project-specific skills for repo-local installs.
- `user/`: user-level skills for global installs. No current user-level skills.

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

### execplan-grill

Use as the first step when the user wants an ExecPlan.

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill execplan-grill -a codex -y
```

### grill-me

Stress-test a plan or design through a one-question-at-a-time interview. Subtree-managed from Matt Pocock's [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) skill.

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill grill-me -a codex -y
```

### humanizer

Remove signs of AI-generated writing from text. Subtree-managed from [`blader/humanizer`](https://github.com/blader/humanizer).

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill humanizer -a codex -y
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

### chatgpt-pro-review

Use when the user explicitly asks Codex to consult ChatGPT Pro through the Codex app browser.

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill chatgpt-pro-review -a codex -y
```

### ui-review-claude

Use to review UI screenshots in parallel with the installed Claude Code CLI.

```bash
npx skills add https://github.com/Skarian/codex-skills/tree/main/project --skill ui-review-claude -a codex -y
```

## User-level skills

No current user-level skills.

## Updating upstream-managed skills

Update `humanizer` from its upstream repo:

```bash
git subtree pull --prefix=project/skills/humanizer https://github.com/blader/humanizer.git main --squash
```

Update `grill-me` from Matt Pocock's nested skill directory:

```bash
tmpdir="$(mktemp -d)"
git clone https://github.com/mattpocock/skills.git "$tmpdir/mattpocock-skills"
git -C "$tmpdir/mattpocock-skills" subtree split --prefix=skills/productivity/grill-me -b grill-me-split
git subtree pull --prefix=project/skills/grill-me "$tmpdir/mattpocock-skills" grill-me-split --squash
rm -rf "$tmpdir"
```

## Install locations

| Agent | Project install                | Global install                  |
| ----- | ------------------------------ | ------------------------------- |
| Codex | `.agents/skills/<skill-name>/` | `~/.codex/skills/<skill-name>/` |
