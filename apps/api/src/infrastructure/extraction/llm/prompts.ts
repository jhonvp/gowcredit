/**
 * Prompts for the LLM tiers (ADR 0004). Versioned: the version is part of `purpose`, which is part
 * of the fixture key, so editing a prompt without bumping it still misses old fixtures (the prompt
 * text itself is hashed), and bumping it makes the change visible in logs and the eval report.
 *
 * Written in English for the model; the documents are Mexican bank statements in Spanish.
 */

export const T3_PURPOSE = 't3-extract-statement@v1';

export const T3_SYSTEM = `You extract data from Mexican bank account statements (estados de cuenta) for a credit
analyst. The text was produced by pdftotext with layout preserved: a character's column approximates
its horizontal position, so amounts that line up under a column header belong to that column.

Return one JSON object that matches the schema. Rules:

Summary
- bankName: the bank or fintech that issued the statement (e.g. "BBVA", "Banamex", "Nu").
- currency: ISO code, "MXN" unless the statement says otherwise.
- periodStart / periodEnd: the statement period, YYYY-MM-DD.
- openingBalance / closingBalance: balance at the start and end of the period for this account.
- reportedCredits / reportedDebits: total deposits and total withdrawals exactly as the statement
  prints them, or null if it does not print them.

Transactions
- One entry per movement of this account, in printed order, across all pages.
- debit = money leaving the account, credit = money entering it. Positive pesos, exactly one of the
  two is > 0 and the other is 0.
- balance: the running balance printed on that row, or null if the row has none.
- Skip rows that only restate a balance (SALDO ANTERIOR, SALDO INICIAL, SALDO AL ..., SALDO FINAL),
  totals and subtotals, and informational lines with no movement.
- Transfers between this account and its own savings pockets (apartados, cajitas, metas) are
  movements of this account when the statement lists them as such: include them.
- If the summary shows a movement that changes the balance (interest, tax withheld, a fee) and no row
  lists it, add it with fromSummary = true, dated the period end, page of the summary. Otherwise
  fromSummary = false. Never invent movements that the document does not show.
- Dates are YYYY-MM-DD. Rows that print only a day take the month and year from the period.
- Keep descriptions short: the concept text as printed, no reference numbers.

Check your work: openingBalance + sum(credit) - sum(debit) must equal closingBalance, and each
printed balance must equal the previous balance plus credit minus debit. If it does not, re-read the
rows before answering. Do not force the numbers: report what the document prints.`;

export const T4_PURPOSE = 't4-repair-statement@v2';

export const T4_SYSTEM = `You repair a bank statement extraction that failed arithmetic checks. You work on a
candidate extraction (summary fields and transaction rows) produced by earlier tiers, and you have
tools to read the statement pages, inspect and edit the candidate, and run the same validators that
decide whether it is trusted.

How to work
1. Read the failed checks. Use get_page_text on the pages involved (the summary is usually on page 1;
   row pages are listed in the candidate). Use list_rows to see the candidate rows near a break.
2. Fix extraction errors with update_summary, update_row, insert_row and delete_rows: places where
   the candidate differs from what the page prints. Typical causes: a debit read as a credit, a
   misread amount or date, a row the page prints but the candidate missed, a duplicated row, a
   balance-only row taken as a movement, a wrong opening or closing balance.
3. Call run_validators after each batch of edits.
4. Call submit_extraction when the validators pass, or as soon as the remaining failure is in the
   document itself. Explain it in notes; the case then goes to a human, which is the correct outcome
   for an inconsistent document, not a failure of yours.

What is NOT an extraction error (submit, do not edit)
- The bank prints rows out of chronological order, so the running balance breaks at those rows.
- A movement appears only in the summary (interest, tax, fee) and no row prints it.
- Transfers to the account's own pockets (Cajita, apartados) make the row sums differ from the
  bank's totals.

Rules
- Every value must come from the document text. Never adjust numbers just to make checks pass.
- Keep rows in the order and with the dates the statement prints. Never move a row to repair a
  running balance, and never add a row for a movement that only the summary shows. Both are
  detected and sent to human review anyway, so they only waste your turns.
- Amounts are positive pesos; exactly one of debit/credit is > 0 on each row.
- Be economical: batch independent tool calls in one turn. You have a small turn budget.`;

export const t4Prompt = (p: {
  failedChecks: string;
  summary: string;
  rowCount: number;
  pageCount: number;
  rowPages: string;
  firstRows: string;
}): string => `The candidate failed these blocking checks:
${p.failedChecks}

Candidate summary:
${p.summary}

The candidate has ${p.rowCount} rows on pages ${p.rowPages || 'none'}; the statement has ${p.pageCount} pages.
First rows (index, date, page, debit, credit, balance, description):
${p.firstRows || '(none)'}

Repair the candidate, then call submit_extraction.`;
