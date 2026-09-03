"""O desembrulho da resposta do modelo (defeito 1 de 17/08, camada b).

Ao vivo: o histórico backfilled ensinou o formato Meta ao Gemini e ele
respondeu '{"body": "Boa tarde…"}' — que foi ENTREGUE cru no WhatsApp do
cliente. Envelopes óbvios (objeto JSON de UMA chave body/text/message) são
desembrulhados antes do juiz e do envio; qualquer outra coisa passa intocada —
desembrulhar demais seria reescrever a resposta do agente.

Aqui a função é testada PURA. Que ela seja de fato chamada no caminho de todo
produtor de fala é a outra metade, e ela mora em `test_pre_send_judge.py`
(`TestTheEnvelopeIsUnwrappedAtTheSeam`): item 44 da auditoria nasceu justamente
de a função ter cobertura e a ligação não ter nenhuma — o toque devolvia o
envelope cru e nada aqui apitava.
"""

from agents_runtime.agent_core.llm import unwrap_model_reply


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
