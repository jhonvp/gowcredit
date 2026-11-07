# LLM fixtures

Recorded LLM responses for `LLM_MODE=replay` (ADR 0004). One file per request:
`<purpose>/<sha256 of the canonical request>.json`. Only the response and metadata are stored;
prompts live in code and document text is never written here. Record with `make eval-record`.
