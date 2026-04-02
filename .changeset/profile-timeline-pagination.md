---
"agent-react-devtools": minor
---

Pagination and sorting for `profile timeline`

Large profiling sessions no longer flood agent context with hundreds of commits:

- **Default limit of 20**: `profile timeline` returns at most 20 entries unless `--limit N` is specified.
- **`--offset N` flag**: Skip the first N commits for pagination.
- **`--sort duration`**: Sort commits by render duration (slowest first) instead of chronological order.
- **Paginated header**: Output shows `Commit timeline (showing 1–20 of 87):` when paginated, or `Commit timeline (87 commits):` when all results fit on one page.
