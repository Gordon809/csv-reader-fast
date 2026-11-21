# csv-reader-fast

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Gordon809/csv-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Gordon809/csv-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0 — reads broken CSV files exactly as the reference does, about 5x faster. `solve.js` is a dependency-free ES module exporting `run(input)` for `{text, header}` inputs, returning `{columns, rows, errors}` with csv-reader 1.0.0's exact broken-row policy (BOM, CRLF and lone CRs, quoted fields with doubled quotes and embedded line breaks, quote junk, unterminated quotes, short and long rows). Instead of the reference's one-character-at-a-time loop it scans with `indexOf` and takes whole fields with `slice`, so the common paths cost a few C++ scans and no per-char work. On the competition's practice set (6 cases, ~10 MB) it answers in ~92 ms vs ~501 ms for the reference (trimmed mean, same machine), and its outputs are byte-identical to the reference's. `main.ts` is the competition harness driver: it reads every case from the input directory, answers each with `run`, and writes `answers.json`.

## Run it

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=output node main.ts
```

`input/cases.json` holds the cases (`[{"id", "input"}]`); the answers land in `output/answers.json`. Needs Node 22.18 or later.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5g7k5t7n&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
