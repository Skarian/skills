# Skills

A personal skill library for software projects, agent workflows, and practical routines I want to reuse

It includes skills I wrote and a selection of upstream skills, installed from their original sources with one command.

## Categories

- `skills/project/`: skills for software projects
- `skills/general/`: my skills meant to be installed system-wide
- `skills/personal/`: niche workflows specific to my use cases
- `skills/retired/`: skills I used in the past

## Install

| Category | Command |
| --- | --- |
| General (default) | `npx --yes github:Skarian/skills` |
| Personal | `npx --yes github:Skarian/skills personal` |
| Project | `npx --yes github:Skarian/skills project` |

Requires Node.js 20 or newer, npm, and Git. General and personal skills install globally. Project skills install in the current directory.

The installer runs the Skills CLI with explicit skill names and automatic agent detection. External skills install directly from upstream.

## Update

Update installed global skills from their recorded sources:

```bash
npx skills@latest update -g
```

Run `npx skills@latest update -p` inside a project to update its project skills.

Rerun the install command to install new skills added to this selection. Updates refresh installed skills; they do not synchronize the selection.

## Maintain the Selection

Keep source code for my skills under its category. Add external sources and selected skill names to `scripts/install.mjs`.

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
