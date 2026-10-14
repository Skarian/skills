# General Skills

Skills meant to be installed system-wide

## Install

Choose skills and target agents interactively:

```bash
npx skills@latest add https://github.com/Skarian/skills/tree/main/skills/general --global
```

External skills have README-only folders with their upstream sources and install commands, linked below.

All commands install globally. See [My Setup](../../README.md#my-setup) for my one-line preset, which installs the whole general selection for five named agents.

Update them with `npx skills@latest update -g`. Rerun the relevant install command to install new skills added to the selection.

## Skills

| Skill | Description | Source |
| --- | --- | --- |
| [asd-ste100](asd-ste100/) | Rewrite ambiguous English with Simplified Technical English rules | External: [danyuchn/asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill) |
| `consensus` | Use subagent review waves to reach consensus | |
| `discussion` | Discuss multiple open items clearly | |
| [grilling](grilling/) | Interview the user to reach a shared understanding of a plan or decision | External: [mattpocock/skills](https://github.com/mattpocock/skills) |
| [handoff](handoff/) | Compact the current conversation into a handoff document for another agent to pick up | External: [mattpocock/skills](https://github.com/mattpocock/skills) |
| [humanizer](humanizer/) | Remove AI slop from writing | External: [blader/humanizer](https://github.com/blader/humanizer) |
| `reference-module` | Study a git repository with a local cache across projects | |
| `skill-research` | Scan Codex sessions, memories, and Chronicle for potential skills | |
