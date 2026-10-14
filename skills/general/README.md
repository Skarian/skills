# General Skills

Skills meant to be installed system-wide

## Install

Install skills from this repo with interactive skill and agent selection:

```bash
npx skills@latest add https://github.com/Skarian/skills/tree/main/skills/general --global
```

Install the selected upstream skills directly:

```bash
npx skills@latest add mattpocock/skills --skill grilling handoff --global
npx skills@latest add blader/humanizer --skill humanizer --global
npx skills@latest add danyuchn/asd-ste100-skill --skill asd-ste100 --global
```

All commands install globally. See [My Setup](../../README.md#my-setup) for my one-line preset, which installs the whole general selection for five named agents.

Update them with `npx skills@latest update -g`. Rerun the relevant install command to install new skills added to the selection.

## Skills

| Skill | Description |
| --- | --- |
| `asd-ste100` ([source](https://github.com/danyuchn/asd-ste100-skill)) | Rewrite ambiguous English with Simplified Technical English rules |
| `consensus` | Use subagent review waves to reach consensus |
| `discussion` | Discuss multiple open items clearly |
| `grilling` ([source](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md)) | Interview the user to reach a shared understanding of a plan or decision |
| `handoff` ([source](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)) | Compact the current conversation into a handoff document for another agent to pick up |
| `humanizer` ([source](https://github.com/blader/humanizer)) | Remove AI slop from writing |
| `reference-module` | Study a git repository with a local cache across projects |
| `skill-research` | Scan Codex sessions, memories, and Chronicle for potential skills |
