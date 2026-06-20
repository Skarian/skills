# friend

Ask Claude or Codex for a second opinion.

```bash
friend <claude|codex> "question" [evidence paths or URLs...] [--model name]
```

Pass a question plus optional evidence: files, directories, images, URLs, or `.` for the current repo. The wrapper runs the selected CLI in read-only review mode and prints the response to stdout.
