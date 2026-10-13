# Create Or Re-Scope Mode

Use this mode when creating a new ExecPlan or substantially changing the scope of an existing one.

## Grounding

Start read-only. Inspect the repo, existing docs, relevant code, and existing ExecPlans before asking questions that can be answered locally.

If durable ExecPlan artifacts are missing and the user wants a durable plan, create the missing paths from this skill's templates after the plan type is known.

Initialize `.agent/execplans/INDEX.md` from `templates/index.md` if it is missing. Add the new plan entry to the section matching the selected type, remove that section's `- (none yet)` placeholder, and keep the entry's `Status:`, `Updated:`, and `Path:` aligned with the plan header and file location.

## Optional Companion Skill

Before drafting, ask whether the user wants to also use the `grilling` skill to help seed the ExecPlan.

If they say yes, use `grilling` as a separate companion workflow before drafting. If they say no, continue with the basic create flow here.

## Create Flow

Clarify only decisions that materially affect the plan. Include a recommended answer with a short reason when asking the user to choose.

Do not ask questions that repo exploration can answer. If a term, assumption, or file boundary can be checked locally, inspect first and report evidence.

During planning:

- Resolve the ExecPlan type before creating, moving, or indexing a plan.
- Prefer revising the existing plan when re-scoping. Create a forked `__v2` plan only when the direction truly diverges, and record the reason in `Decision Log`.
- Use project language from existing docs and code where it is clear.
- Call out conflicts between the user's wording and the repo's actual behavior.
- Define non-obvious terms directly in the plan.
- Record durable decisions in the ExecPlan `Decision Log`.

When drafting, make the ExecPlan self-contained. A future agent must be able to execute it with only the current working tree and the plan file.

Use `references/rules.md` for the plan rules and `templates/execplan.md` as the starting skeleton for the new plan file.
