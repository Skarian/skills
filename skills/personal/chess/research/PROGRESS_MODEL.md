# Progress Model

## Finding

Do not use one score. Track progress in layers:

1. Outcome: rating trend in the same pool and time control.
2. Transfer: severe errors in reviewed games, grouped by phase, motif, and time pressure.
3. Mastery: delayed first-try recall and solve quality for tactics, openings, and endgames.
4. Retention: spaced-repetition health.
5. Diagnosis: concept tags generated from real game failures.

## Metric Guidance

### Rating

Rating is meaningful but lagging. Track trend over enough games within one site, pool, and time control. Do not mix blitz, rapid, bots, puzzles, and platform ratings into one number.

### Accuracy and Centipawn Loss

Useful for diagnosis, weak as a north-star metric. Prefer phase-normalized win-probability loss and severe-error rate over raw average centipawn loss.

### Blunders and Mistakes

Useful for club-level improvement when grouped by phase and cause. Definitions vary across platforms and engines, so keep internal definitions consistent.

### Tactical Motifs

Track delayed accuracy, solve time, retries, and recurrence by motif. Derive motif priorities from real-game mistakes, not from a generic checklist alone.

### Puzzle Performance

Useful for drill quality, not proof of playing strength. Track fixed-difficulty accuracy, latency, retries, and recurring missed motifs.

### Opening Recall

Track first-try recall by line, branch frequency, and relevance to actual games. Avoid rewarding memorized rare deep lines that do not affect real play.

### Endgames

Use tablebase truth for covered endgames. Track WDL flips and missed drawing or winning resources in positions with tablebase coverage.

### Spaced Repetition

Use delayed recall, interval success, lapse rate, leeches, and due load. Retention is useful, but it must connect back to real-game transfer.

### Concept Tracking

Maintain mastery estimates only from repeated evidence: attempts, failures, reviews, and real-game errors. Manual labels alone create false certainty.

## Recommended Model

Use a transfer-weighted mastery model:

- Rating trend: slow outcome check.
- Reviewed-game severe error rate: primary improvement signal.
- Motif and concept weak spots: training selector.
- Spaced retention: memory health.
- Puzzle metrics: drill quality.
- Tablebase errors: exact endgame correction when available.

## Misleading Metrics

- Raw daily rating.
- Raw puzzle volume.
- Raw average centipawn loss.
- Global accuracy percentage.
- Opening-line count memorized.

## Better Metrics

- Reduced severe errors in reviewed games.
- Stable same-pool rating trend.
- Delayed first-try recall.
- Motif-specific improvement tied to real misses.
- Exact tablebase corrections in covered endgames.

## Evidence Quality

High for spaced repetition, retrieval practice, and tablebase truth.

Medium-high for rating trends and win-probability-loss diagnostics.

Medium for knowledge tracing and concept mastery, because tagging and inference quality matter.

Low-medium for puzzle-rating transfer to real-game strength.
