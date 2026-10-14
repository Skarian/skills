# Skills

A personal skill library for software projects, agent workflows, and practical routines I want to reuse

It includes skills I wrote and a selection of upstream skills. Each skill installs from its original source.

## Categories

- `skills/project/`: skills for software projects
- `skills/general/`: my skills meant to be installed system-wide
- `skills/personal/`: niche workflows specific to my use cases
- `skills/retired/`: skills I used in the past

## Install

Use the interactive Skills CLI to choose skills and target agents. General and personal skills install globally. Project skills install in the current directory.

| Category | Command |
| --- | --- |
| General, from this repo | `npx skills@latest add https://github.com/Skarian/skills/tree/main/skills/general --global` |
| Personal | `npx skills@latest add https://github.com/Skarian/skills/tree/main/skills/personal --global` |
| Project | `npx skills@latest add https://github.com/Skarian/skills/tree/main/skills/project` |

Install the selected upstream general skills separately:

```bash
npx skills@latest add mattpocock/skills --skill grilling handoff --global
npx skills@latest add blader/humanizer --skill humanizer --global
npx skills@latest add danyuchn/asd-ste100-skill --skill asd-ste100 --global
```

Requires Node.js 22.20 or newer, npm, and Git.

## My Setup

These presets install the selected skills for Codex, Gemini CLI, Zed, Claude Code, and Grok Build without interactive selection:

```bash
npx --yes github:Skarian/skills
npx --yes github:Skarian/skills personal
```

The first command installs all eight general skills. The second installs `mac-screenshot` globally.

Run `npx --yes github:Skarian/skills project` in a project to install `execplan` for the same five agents.

The preset passes explicit targets to avoid the Skills CLI's [PromptScript global-install bug](https://github.com/vercel-labs/skills/issues/1496). It checks structured results and stops on incomplete installs.

## Update

Update installed global skills from their recorded sources:

```bash
npx skills@latest update -g
```

Run `npx skills@latest update -p` inside a project to update its project skills.

For my setup, rerun the preset commands to update with the same explicit agent targets. The upstream update command can still encounter the PromptScript bug when it reinstalls changed global skills.

Rerun the install command to install new skills added to this selection. Updates refresh installed skills; they do not synchronize the selection.

## Maintain the Selection

Keep source code for my skills under its category. Add external sources and selected skill names to `scripts/install.mjs`, which also holds my agent preset.

Update the root catalog, category catalog, and acknowledgments when the selection changes. External skills remain active without a local source directory.

## Project

| Skill | Description |
| --- | --- |
| `execplan` | Create detailed plans for long-running agent work |

## General

| Skill | Description |
| --- | --- |
| `asd-ste100` ([source](https://github.com/danyuchn/asd-ste100-skill)) | Rewrite ambiguous English with Simplified Technical English rules |
| `consensus` | Use subagent review waves to reach consensus |
| `discussion` | Discuss multiple open items clearly |
| `grilling` ([source](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md)) | Interview the user to reach a shared understanding of a plan or decision |
| `handoff` ([source](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)) | Compact the current conversation into a handoff document for another agent to pick up |
| `humanizer` ([source](https://github.com/blader/humanizer/blob/main/SKILL.md)) | Remove AI slop from writing |
| `reference-module` | Study a git repository with a local cache across projects |
| `skill-research` | Scan Codex sessions, memories, and Chronicle for potential skills |

## Personal

| Skill | Description |
| --- | --- |
| `mac-screenshot` | Review the latest macOS screenshot on Desktop |

See [Acknowledgments](ACKNOWLEDGMENTS.md) for original sources for skills that originated from other repos or external opinions
