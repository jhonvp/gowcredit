# Session 12 — internal transfers and summary-only amounts (2026-11-08)

**Prompts.** "con el de nubank ✗ rows-reconcile … nosotros la estamos marcando con error"; "Podemos mostrar
esos valores en campos aparte como otros y en detalles hacer una descripción"; "en caso que pasaran ajustemos
la ia para que resuelva sin preguntarle al cliente"; "implementarlo y volver a probar".

**Finding.** Nu prints each Cajita transfer twice with opposite signs (account and Cajita sections), which is
why both sides were $47,010.94 too high. Date and amount alone gave 141 pairs, 5 of them real deposits and
expenses, so the concept must match too. The real count is 136.

**Result.** Eval 80/80 fields, 9/9 validators, no LLM cost. The LLM path was tested with scripted model
responses, not against the live API: no development document reaches it now.
