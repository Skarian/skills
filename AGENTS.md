# skills

This is my single source of truth for the skills I actually use.

It is the homepage for my agent workflows: the ones I built myself, the ones I pulled in from other people, and the ones I want to be able to install quickly into a project or my own environment.

The goal is leverage. Better coding projects, better use of coding agents, better research and writing workflows, and eventually personal workflows for things like devices, home automation, and whatever else makes sense as a skill.

## Current status

This repo has been in production usage for a few months. It has been rebuilt multiple times and has grown in importance in my personal workflows. I expect the workflows to continue to change as AI improves. My goal is to develop a cohesive set of skills that help level up all digital areas of my life.

## Some thoughts from me

The following is a note from me to you, the agent working in this repo.

This repo is personal-first, but I want it to be useful to someone else who finds it. If a skill is in `skills/project/` or `skills/general/`, assume another person should be able to understand what it is for, when to use it, and how to install it without knowing my private context.

The repo has three categories. `skills/project/` is for workflows I install into coding projects. `skills/general/` is for broader workflows I use across projects or in my agent environment. `skills/personal/` is for personal workflows that may only make sense for me.

### Keep the skill library sharp

Keep this repo as a tight library of workflows I actually use.

A skill belongs here when it captures a workflow I actually want to repeat. The best evidence is real use: Codex sessions, repeated work, annoying manual patterns, or something I keep asking agents to do.

### Make skills tiny

Most skills should be tiny.

If you are writing a long skill, something is probably wrong. If you are adding flags, modes, forms, config fields, fallback paths, or a giant command surface, stop and justify why the workflow actually needs them.

I want skills that get the agent to do the right thing quickly. I do not want miniature products hidden inside `SKILL.md`.

For new helper scripts, prefer plain Node.js. Use Node for real parsing, file handling, JSON, paths, or branching. Stay close to the standard library, keep one script to one job, and add dependencies only when they materially simplify the workflow.

### Write the actual workflow

Turn my preferences into the instructions the agent should follow.

If I say I want short skills, write instructions that produce short skills. If I say I want lessons from real sessions, build from real session evidence. If something is fuzzy or you think the preference needs a sharper version, ask me.

### Invocation matters

A good skill has a clear trigger. A clear user phrase is even better.

Make most skills activate when I explicitly name them or use an unmistakable phrase. I would rather have a skill that is easy to call on purpose than one that tries to be clever in the background.

Names should be short, memorable, and a little clever when that helps.

### Credit good work

Some of the best skills in this repo may come from other people. Treat that as a strength.

Preserve where they came from, credit the original authors in the right places, and make the skill easy for me and others to use from this library. When adapting an imported skill, keep the useful parts intact and make the packaging fit this repo.

### Retire skills deliberately

Before retiring a skill, interview me.

Retiring a skill should be a decision, not cleanup drift. Keep the original skill intact under `skills/retired/<skill>/` and explain what changed, why it was retired, and what replaces it if anything does.

## Some general rules

These are here to keep the repo pointed in the right direction:

- never use the built-in `skill-creator` skill for this repo
- preserve the `project`, `general`, and `personal` categories
- prefer real-session evidence over speculative workflow design
- keep skill names short and memorable
- keep skill instructions short unless the workflow truly needs more
- keep script command surfaces small, boring, and cross-platform
- preserve provenance and credit for work from others
- when a repo-shaping decision is fuzzy, ask me instead of encoding a generic default
