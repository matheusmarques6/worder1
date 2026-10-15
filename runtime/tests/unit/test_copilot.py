"""Alteração 2026-10-15-07 — o copiloto do inbox pelo runtime."""

from agents_runtime.agent_core.copilot import COPILOT_INSTRUCTION, copilot_messages
from agents_runtime.agent_core.think_gate import PendingMessage


class TestCopilotMessages:
    def test_the_frame_and_the_instruction_are_the_system_turn(self) -> None:
        messages = copilot_messages("# AGENTE\nDuda", (), "oi")
        assert messages[0].role == "system"
        assert messages[0].content.startswith("# AGENTE\nDuda")
        assert COPILOT_INSTRUCTION in messages[0].content

    def test_contact_is_user_and_the_store_is_assistant(self) -> None:
        transcript = (
            PendingMessage("contact", "tem no tamanho M?"),
            PendingMessage("agent", "Tenho sim!"),
            PendingMessage("human", "Quer que eu separe?"),
        )
        messages = copilot_messages("frame", transcript, "quero 2")
        assert [(m.role, m.content) for m in messages[1:]] == [
            ("user", "tem no tamanho M?"),
            ("assistant", "Tenho sim!"),
            ("assistant", "Quer que eu separe?"),
            ("user", "quero 2"),
        ]

    def test_the_last_message_is_not_duplicated(self) -> None:
        transcript = (PendingMessage("contact", "quero 2"),)
        messages = copilot_messages("frame", transcript, " quero 2 ")
        assert [m.content for m in messages[1:]] == ["quero 2"]

    def test_empty_lines_are_skipped(self) -> None:
        transcript = (PendingMessage("agent", ""), PendingMessage("contact", "oi"))
        messages = copilot_messages("frame", transcript, "")
        assert [m.content for m in messages[1:]] == ["oi"]
