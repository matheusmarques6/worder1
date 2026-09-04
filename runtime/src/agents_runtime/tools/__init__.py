"""The per-turn toolset: the responder builds the table, there is no registry.

The subset is still data (`agent_versions.enabled_tools`), enforced inline in
`agent_core/responder.py:642-664` — the registry that used to do it had no
caller and went with item 59.

Every tool validates tenant and authorisation itself — it never trusts what the
model decided. Contact messages are hostile input.
"""
