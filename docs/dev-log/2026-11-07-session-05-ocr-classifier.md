# Session 05 — T1 OCR and T2 trained line classifier (2026-11-07)

Plan block 8. Same instruction: continue until finish, with commits and PRs.

## T1: OCR

- Selects pages with fewer than 30 printable characters, or a text layer that is still garbled after the
  EBCDIC repair.
- Rasterizes them with `pdftoppm -r 300 -gray`, then runs `tesseract -l spa --psm 6 -c
preserve_interword_spaces=1`. Keeping the spaces preserves the column gaps the layout parser needs.
- Reparses the merged text with the T0 parser, and hands the merged text to the later tiers through a
  new `text` field on the extraction result.
- Runs only after T0 fails, so image-only ad pages in documents T0 resolves (Banamex pp. 26–31) are
  never OCR'd. Capped at 12 pages.
- On the dev set T1 always skips: no page in a failing document needs OCR. The unit test (fake OCR) and
  the integration test (real Tesseract on a generated PDF) cover it.

## T2: classifier

- **Labels.** T0 records the role of each table line. Only documents that pass every validator are used
  for training (7 of 9), so the labels are checked by arithmetic.
- **Model.** Softmax regression over 21 features, written in plain TS. Training takes about 2 s.
- **Row builder.** First run: T2 rebuilt 6 of 7 training documents. BBVA got 0 rows, because its rows
  have one unsigned amount and no running balance.
  - **Fix 1:** use the column of the classified header as a fallback. BBVA got all 161 rows, but
    Inbursa, Banamex and HSBC picked up balance-only rows.
  - **Fix 2:** a lone amount nearest the balance column is not a movement. Inbursa and Banamex were
    fixed; HSBC still took in noise lines.
  - **Fix 3:** enable the column fallback only when fewer than half the rows are explained by the running
    balance. Result: 6 of 7 rebuilt exactly, and BBVA has 161 of 161 rows with one side mix-up
    (in-sample).
- **Unit test.** A synthetic statement whose header uses words T0 doesn't know (SALIDAS, ENTRADAS,
  DISPONIBLE). T0 finds no rows; T2 recovers all three and they pass the validators.

## Results

| Check                   | Result                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| `make test`             | 86 passed                                                              |
| `make test-integration` | 7 passed (new: real Tesseract OCR)                                     |
| `make eval`             | 78/80, unchanged. Cascade shown as T0 → T1 → T2 → T3 → T4 per document |
| `make train-classifier` | Report in `eval/reports/classifier.md`                                 |
