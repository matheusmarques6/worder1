"""O desembrulho da resposta do modelo (defeito 1 de 17/08, camada b).

Ao vivo: o histórico backfilled ensinou o formato Meta ao Gemini e ele
respondeu '{"body": "Boa tarde…"}' — que foi ENTREGUE cru no WhatsApp do
cliente. O responder passa a desembrulhar envelopes óbvios (objeto JSON de
UMA chave body/text/message) antes do juiz e do envio; qualquer outra coisa
passa intocada — desembrulhar demais seria reescrever a resposta do agente.
"""

from agents_runtime.agent_core.responder import unwrap_model_reply


class TestUnwrapModelReply:
    def test_a_json_body_envelope_is_unwrapped(self) -> None:
        assert unwrap_model_reply('{"body": "Boa tarde, tudo bem?"}') == "Boa tarde, tudo bem?"

    def test_a_fenced_envelope_is_unwrapped(self) -> None:
        assert unwrap_model_reply('```json\n{"body": "Oi!"}\n```') == "Oi!"

    def test_text_and_message_envelopes_also_count(self) -> None:
        assert unwrap_model_reply('{"text": "Olá"}') == "Olá"
        assert unwrap_model_reply('{"message": "Oi"}') == "Oi"

    def test_plain_text_passes_through(self) -> None:
        reply = "Boa tarde! Posso ajudar com {algo} hoje?"
        assert unwrap_model_reply(reply) == reply

    def test_a_multi_key_object_is_not_unwrapped(self) -> None:
        reply = '{"body": "Oi", "mood": "feliz"}'
        assert unwrap_model_reply(reply) == reply

    def test_an_unknown_single_key_is_not_unwrapped(self) -> None:
        reply = '{"resposta": "Oi"}'
        assert unwrap_model_reply(reply) == reply
