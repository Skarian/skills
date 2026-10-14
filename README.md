# Skills

A personal skill library for software projects, agent workflows, and practical routines I want to reuse

It includes skills I wrote and skills collected from other repos so I can install them from one place

## General

Skills I use across projects, installed globally.

| Skill | Description | Source |
| --- | --- | --- |
| [asd-ste100](skills/general/asd-ste100/) | Rewrite ambiguous English with Simplified Technical English rules | [danyuchn/asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill) |
| [consensus](skills/general/consensus/) | Use subagent review waves to reach consensus | - |
| [discussion](skills/general/discussion/) | Discuss multiple open items clearly | - |
| [grilling](skills/general/grilling/) | Interview the user to reach a shared understanding of a plan or decision | [mattpocock/skills](https://github.com/mattpocock/skills) |
| [handoff](skills/general/handoff/) | Write a handoff for an agent to continue in a new conversation | [mattpocock/skills](https://github.com/mattpocock/skills) |
| [humanizer](skills/general/humanizer/) | Remove AI slop from writing | [blader/humanizer](https://github.com/blader/humanizer) |
| [reference-module](skills/general/reference-module/) | Study a git repository with a local cache across projects | - |
| [skill-research](skills/general/skill-research/) | Scan Codex sessions, memories, and Chronicle for potential skills | - |

## Project

Skills installed into a coding project.

| Skill | Description | Source |
| --- | --- | --- |
| [execplan](skills/project/execplan/) | Create detailed plans for long-running agent work | - |

## Personal

Workflows specific to my setup.

| Skill | Description | Source |
| --- | --- | --- |
| [mac-screenshot](skills/personal/mac-screenshot/) | Review the latest macOS screenshot on Desktop | - |

See [retired skills](skills/retired/) for past workflows and [acknowledgments](ACKNOWLEDGMENTS.md) for sources and credits.

## Install

Requires Node.js 22.20 or newer, npm, and Git. These commands let you choose skills and target agents interactively.

| Category | Command |
| --- | --- |
| General | `npx skills@latest add https://github.com/Skarian/skills/tree/main/skills/general --global` |
| Personal | `npx skills@latest add https://github.com/Skarian/skills/tree/main/skills/personal --global` |
| Project | `npx skills@latest add https://github.com/Skarian/skills/tree/main/skills/project` |

The external general skills install from their original repositories:

```bash
npx skills@latest add mattpocock/skills --skill grilling handoff --global
npx skills@latest add blader/humanizer --skill humanizer --global
npx skills@latest add danyuchn/asd-ste100-skill --skill asd-ste100 --global
```

## My setup

My presets target Codex, Gemini CLI, Zed, Claude Code, and Grok Build without interactive selection.

```bash
npx --yes github:Skarian/skills
npx --yes github:Skarian/skills personal
```

The first installs the full general selection. The second installs `mac-screenshot` globally.

Run `npx --yes github:Skarian/skills project` inside a project to install `execplan` for the same agents.

## Update

Rerun my presets to update them. The general preset also adds new selections and removes skills it previously installed that have left the selection.

To update installed global skills from their recorded sources:

```bash
npx skills@latest update -g
```

Run `npx skills@latest update -p` inside a project to update its project skills. These update commands refresh installed skills; they do not synchronize the selection.
