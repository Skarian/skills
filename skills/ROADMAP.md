# Skills Roadmap

Status date: 2026-06-02

This note tracks skill-inventory decisions while the repository migration settles. It is not an ExecPlan; it is a lightweight product roadmap for what to keep, retire, or reshape next.

## Current Direction

- Keep skills as the durable distribution mechanism now that the starter-repo and `agents-md` workflows have been retired.
- Do not retire a skill merely because similar behavior appears in local `AGENTS.md` or other legacy repo guidance.
- Keep retired skills intact under `skills/retired/<skill>/`, including their original `SKILL.md`.
- Interview the user before retiring a skill and capture the reason in `RETIREMENT.md`.
- Keep this roadmap temporary; do not link it from stable README files.

## Keep

- `execplan`: still the main project-planning workflow.
- `discussion`: still useful as portable behavior previously carried by starter-style guidance.
- `consensus`: captures the repeated true-consensus workflow across red/green/adjudication subagent waves.
- `grill-me`: used regularly and should stay active.
- `chatgpt-pro-review`: useful in the Codex app browser for direct ChatGPT Pro review.
- `friend`: read-only second-opinion CLI wrapper for Claude, Gemini, and Codex.
- `humanizer`: used somewhat regularly and should stay active.
- `reference-module`: migrated to a general skill and remains the repository reference workflow.
- `skill-research`: captures the system-wide workflow audit used to find repeated manual work worth packaging.
- `screenshot`: captures the user's repeated latest-Desktop-screenshot shortcut as a personal skill.
- `scratch`: captures the repo-root scratch-file workflow used for docs and draft work.

## Migration Handoff

- Repository docs now point at `Skarian/skills` install URLs.
- Rename the GitHub repository to `skills` in repository settings.
- Update the local `origin` remote to `https://github.com/Skarian/skills.git`.
- Rename the local checkout directory to `skills` if desired.
- Verify the GitHub install URLs after the remote rename resolves.
- Close out this temporary roadmap after the migration lands.

## Settled During Roadmap

- `AGENTS.md` rewrite completed through the interview process.
- Root `README.md` rewrite completed through the `grill-me` interview process.
- `skills/user/` renamed to `skills/general/`; docs and install wording now use General Skills.
- Added project `scratch` skill for repo-root scratch files.
- Rewrote group and non-upstream individual READMEs from the new root README style path.
- Install docs policy: root and group READMEs use one interactive category install command; group READMEs keep compact skill catalogs; individual skill READMEs omit install commands.
- Prepared public docs and install URLs for the repository rename to `skills`.

## Recently Retired

- `continuity`: retired because Codex memories now cover the continuity use case directly, and a separate repo-local continuity ledger can create drift from memory and current repo truth.
- `precommit-review`: retired because Codex `/review` and Codex code review now cover commit-readiness review without a dedicated phased skill.
