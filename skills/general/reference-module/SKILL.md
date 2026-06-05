---
name: reference-module
description: Use when researching another Git repository
---

# Reference Module

Use when the user asks to inspect, compare, or research another Git repository.

## Workflow

1. Get the repo URL, plus any requested branch, tag, commit, or alias.
2. Store references in `~/.skills/reference-module/<name>`, where `<name>` is the alias, `<owner>/<repo-name>` when the URL has an owner or group, or the repo basename when it does not. Strip trailing `.git`.
3. If the target exists, ask unless the user already chose:
   - use as-is: do not fetch or check out; report current ref/SHA
   - update: fetch, then check out the requested ref or remote `HEAD`
   - copy: clone into a separate directory; ask for a name unless alias was provided
     Never modify an unsafe or wrong-repo target without asking.
4. If the target is missing, clone it. Use remote `HEAD` unless a ref was requested.
5. Fetch only for update/copy:

   ```bash
   git -C <reference-path> fetch --all --tags --prune
   ```

6. After clone/update/copy, check out the requested ref or remote `HEAD`, preferably detached. If the user chose use as-is, leave it untouched.
7. Treat contents as read-only. Do not create submodules, symlinks, or pointer files unless explicitly asked.
8. Report path, source URL, action taken, checked-out ref, and commit SHA.
