# General Skills

Skills meant to be installed system-wide

## Install

Install skills from this repo with interactive skill and agent selection:

```bash
npx skills@latest add https://github.com/Skarian/skills/tree/main/skills/general --global
```

External skills have README-only folders with their upstream sources and install commands, linked below.

All commands install globally. See [My Setup](../../README.md#my-setup) for my one-line preset, which installs the whole general selection for five named agents.

Update them with `npx skills@latest update -g`. Rerun the relevant install command to install new skills added to the selection.

## Skills

| Skill | Description |
| --- | --- |
| [asd-ste100](asd-ste100/) | Rewrite ambiguous English with Simplified Technical English rules |
| `consensus` | Use subagent review waves to reach consensus |
| `discussion` | Discuss multiple open items clearly |
| [grilling](grilling/) | Interview the user to reach a shared understanding of a plan or decision |
| [handoff](handoff/) | Compact the current conversation into a handoff document for another agent to pick up |
| [humanizer](humanizer/) | Remove AI slop from writing |
| `reference-module` | Study a git repository with a local cache across projects |
| `skill-research` | Scan Codex sessions, memories, and Chronicle for potential skills |
