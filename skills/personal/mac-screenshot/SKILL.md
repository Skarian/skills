---
name: mac-screenshot
description: Use when the user asks to inspect, review, compare, or reason from a macOS screenshot without providing a path.
---

# Mac Screenshot

When invoked, assume the user means the latest macOS screenshot on their Desktop unless they provide a path, URL, or count.

Find the newest matching files in `~/Desktop`, preferring `Screenshot*`, `Screen Shot*`, and `CleanShot*` image files. If the user asks for "two", "latest two", "before/after", or comparison, use the newest screenshots in reverse chronological order.

Inspect the image or images in the context of the current task. Use available image-review tooling.

Report the exact file or files used, then give concrete visual findings, likely implications, and uncertainty. Ask for a path only when no screenshot can be found or multiple candidates are genuinely ambiguous.
