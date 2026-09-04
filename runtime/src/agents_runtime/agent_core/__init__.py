"""Prompt compilation by typed blocks, think-gate and the LLM call.

The layered prompt this line used to name (`prompt.py`, RF-010's base ->
scenario -> context -> tools -> knowledge) was deleted; `prompt_compiler`
composes AGENTE/MISSÃO/ESTADO/CANAL/CONVERSA and is the only producer left.

Owns the three-phase cycle of ADR-6: claim (short transaction) -> work (OUTSIDE
any transaction) -> conclusion (short transaction with the extended CAS). A
message arriving during the LLM call invalidates the draft; the draft is
discarded, never sent.
"""
