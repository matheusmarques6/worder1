"""Evals — the rubrics Judge 1 runs on, and the synthetic scenario pack.

Born in E2's S1, BEFORE any agent code exists: the rubric is the contract a
version must pass to activate, so it cannot be written by looking at what the
agent already does.

The activation-gate runner that used to live here (`harness.py`) was deleted by
item 57 of the audit: it was never wired to a route, a handler or a script, and
was unchanged since the fork. What survives has real consumers — the rubrics are
read from disk on every turn (`agent_core/responder.py:274`) and the pack is the
traceability lock against `core/requisitos-e-entidades.md`.
"""
