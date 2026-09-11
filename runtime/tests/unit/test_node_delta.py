"""`_node_delta` — o delta que o nó do fluxo empurra sobre a missão.

Função pura, e mesmo assim sem afirmador nenhum em `-m unit`: o único
exercitador na árvore era `tests/db/test_toucher.py:62`, tier `db`. Mutação
medida na recon do item 63: reescrever o corpo inteiro para `return NodeDelta()`
— ignorando o `raw` — deixava a suíte verde e idêntica.

O que ela decide não é decoração. `mission_resolver.py:110` distingue "o nó não
falou de ferramentas" (`None`, não mexe) de "o nó zerou as ferramentas"
(`()`, apaga todas): um `()` onde devia haver `None` tira `create_coupon` de um
toque de recuperação, que é caminho do dinheiro.

O quarto caso preserva o contrato textual de `success_criteria` do item 95.
"""

from agents_runtime.agent_core.toucher import _node_delta


def test_enabled_tools_tells_silence_apart_from_an_empty_list() -> None:
    """`None` é "o nó não falou"; `()` é "o nó apagou todas". Colapsar os dois
    faz `mission_resolver.py:110` filtrar a lista da missão contra o vazio."""
    assert _node_delta({}).enabled_tools is None
    assert _node_delta({"enabled_tools": ["a", "b"]}).enabled_tools == ("a", "b")
    assert _node_delta({"enabled_tools": []}).enabled_tools == ()


def test_an_absent_delta_is_the_same_as_an_empty_one() -> None:
    """`raw=None` chega de nó sem delta; `raw={}` chega de nó com delta vazio.
    Nenhum dos dois pode inventar valor que a missão depois herde."""
    for raw in (None, {}):
        delta = _node_delta(raw)
        assert delta.objective is None
        assert delta.tone is None
        assert delta.context == {}
        assert delta.forbidden == ()
        assert delta.enabled_tools is None


def test_forbidden_keeps_the_order_the_node_wrote() -> None:
    """A lista de proibições vai interpolada no prompt; reordená-la muda o
    texto que o modelo lê sem mudar o conteúdo declarado."""
    assert _node_delta({"forbidden": ["b", "a"]}).forbidden == ("b", "a")


def test_success_criteria_stays_the_string_the_node_wrote() -> None:
    """O delta mantém a frase que o nó escreveu, sem fatiá-la em caracteres."""
    assert _node_delta({"success_criteria": "pessoa volta ao checkout"}).success_criteria == (
        "pessoa volta ao checkout"
    )
