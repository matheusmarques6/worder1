"""Fitness function — todo IO de texto do runtime declara o seu `encoding`.

`Path.read_text()`, `Path.write_text()` e `open()` em modo texto sem
`encoding` usam `locale.getpreferredencoding(False)`. Em `ubuntu-latest` isso
é UTF-8; na máquina de desenvolvimento deste projeto é **cp1252**. O mesmo
arquivo lido pelo mesmo código devolve strings diferentes conforme o SO de
quem roda.

Item 54: os dois fixtures de vetores eram lidos assim. E o defeito não foi
alto — nenhum dos dois arquivos contém byte indefinido em cp1252, então os
dois decodificavam **com sucesso** e produziam dado errado. `bubble_vectors.json`
saía com 9 dos 10 vetores corrompidos e **8 deles passavam**, porque
`test_humanize.py:46` compara `split_into_bubbles(vector["text"])` com
`vector["bubbles"]` e os dois lados vêm do mesmo fixture: a suíte que existe
para provar paridade com o TS estava provando paridade consigo mesma, em
espaço-mojibake. Verde e vazia.

Por que uma fitness e não uma regra de lint: a regra existe — `PLW1514`,
`unspecified-encoding` — e foi medida contra as duas formas sintáticas deste
defeito. A inferência de tipo do ruff sobrevive à atribuição de variável mas
**morre em `.parent` e em `/`**, que são exatamente as duas formas usadas:
`(Path(__file__).parent / "fixtures" / "x.json").read_text()` passa batido.
`--select PLW1514 --preview` devolvia `All checks passed!` **com o bug
presente**. Ela daria 0 hits antes, durante e depois. Ligá-la é defesa para
formas que ainda não existem aqui, não trava para esta porta.

A detecção é por **AST**, não por texto: `test_responder_factory.py:73` passa
o `encoding=` na linha seguinte (a chamada é multilinha), e um detector de
linha reprovaria código correto já hoje. Pelo AST a chamada é um nó só, com os
`keywords` completos — e uma string de código dentro de um teste ou de um
comentário não é um `ast.Call`.

Escopo: `read_text`/`write_text`/`open` em modo texto. **`bytes.decode()` sem
argumento fica de fora de propósito** — ele é sempre UTF-8, nunca o locale.
Incluí-lo reprovaria quatro chamadas corretas (`server.py:387`,
`judges/pre_send.py:74`, `tests/support/runtime_process.py:85`,
`tests/db/test_server.py:56`).

As violações saem **todas numa mensagem só**, não uma por arquivo: quem
consertar quer a lista inteira de uma vez, e o delta da suíte fica conferível.
"""

import ast
from pathlib import Path

# runtime/tests/unit/ -> runtime/tests -> runtime
_RUNTIME = Path(__file__).parents[2]

#: As três portas de IO de texto da stdlib usadas neste repositório.
#: `read_bytes`/`write_bytes` são binários e não têm encoding a declarar.
_TEXT_IO = frozenset({"read_text", "write_text", "open"})


def _scanned_files() -> list[Path]:
    """Todo `.py` versionado do runtime — `src`, `tests`, `scripts` e o que
    vier depois. Diretórios com ponto (`.venv`, `.pytest_cache`) ficam fora:
    são 1725 arquivos de dependência, e a trava é sobre o código desta casa."""
    return sorted(
        path
        for path in _RUNTIME.rglob("*.py")
        if not any(part.startswith(".") for part in path.relative_to(_RUNTIME).parts)
    )


def _called_name(node: ast.AST) -> str | None:
    """O nome invocado por uma Call — `p.read_text()` ou `open()` nu."""
    if not isinstance(node, ast.Call):
        return None
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    if isinstance(node.func, ast.Name):
        return node.func.id
    return None


def _mode_of(call: ast.Call) -> str:
    """O modo literal de um `open`, quando ele é literal.

    O índice posicional difere: `open(arquivo, modo)` é 1, `p.open(modo)` é 0.
    Um modo calculado em runtime devolve `""` e a chamada é tratada como texto
    — falhar fechado, porque `open(f, mode)` sem encoding é violação sempre que
    `mode` não tiver `b`, e não dá para saber daqui que não tem.
    """
    for keyword in call.keywords:
        if keyword.arg == "mode" and isinstance(keyword.value, ast.Constant):
            return keyword.value.value if isinstance(keyword.value.value, str) else ""
    index = 1 if isinstance(call.func, ast.Name) else 0
    if len(call.args) > index and isinstance(call.args[index], ast.Constant):
        value = call.args[index].value
        return value if isinstance(value, str) else ""
    return ""


def _violations(source: str, label: str = "<código>") -> list[str]:
    found = []
    for node in ast.walk(ast.parse(source)):
        name = _called_name(node)
        if name not in _TEXT_IO:
            continue
        assert isinstance(node, ast.Call)
        if any(keyword.arg == "encoding" for keyword in node.keywords):
            continue
        if name == "open" and "b" in _mode_of(node):
            continue
        found.append(f"{label}:{node.lineno}: {name}(...) sem encoding")
    return found


def test_no_text_io_depends_on_the_locale() -> None:
    found = [
        violation
        for path in _scanned_files()
        for violation in _violations(
            path.read_text(encoding="utf-8"),
            str(path.relative_to(_RUNTIME)),
        )
    ]

    assert found == [], (
        "IO de texto sem `encoding` explícito:\n  " + "\n  ".join(found) + "\n"
        "Passe `encoding=\"utf-8\"`. Sem ele o Python usa o locale do processo — "
        "UTF-8 no CI, cp1252 no Windows — e o mesmo arquivo vira duas strings "
        "diferentes. Quando os bytes são válidos nos dois, não há exceção: o "
        "dado só sai errado, em silêncio (item 54)."
    )


class TestTheDetectorItself:
    """Trava que ninguém viu falhar é decoração."""

    def test_catches_the_two_forms_that_ruff_misses(self) -> None:
        # As duas formas exatas do item 54, que `PLW1514` não enxerga.
        assert _violations('(Path(__file__).parent / "x.json").read_text()\n')
        assert _violations('F = Path(__file__).parent / "x"\nF.read_text()\n')

    def test_catches_a_write(self) -> None:
        assert _violations('Path("x").write_text("olá")\n')

    def test_catches_a_bare_open_in_text_mode(self) -> None:
        assert _violations('open("x")\n')
        assert _violations('open("x", "w")\n')
        assert _violations('Path("x").open("r")\n')

    def test_accepts_an_explicit_encoding(self) -> None:
        assert not _violations('Path("x").read_text(encoding="utf-8")\n')
        assert not _violations('open("x", "w", encoding="utf-8")\n')

    def test_accepts_a_multiline_call(self) -> None:
        # `test_responder_factory.py:73` — o falso positivo que reprova
        # qualquer detector de linha, e que o AST vê como um nó só.
        assert not _violations('(D / "Dockerfile").read_text(\n    encoding="utf-8"\n)\n')

    def test_accepts_binary_mode(self) -> None:
        assert not _violations('open("x", "rb")\n')
        assert not _violations('Path("x").open(mode="wb")\n')

    def test_ignores_a_string_that_only_looks_like_code(self) -> None:
        # Prosa e código-em-string não são chamadas. Esta própria classe
        # depende disso para não se reprovar.
        assert not _violations('# p.read_text()\nS = "p.read_text()"\n')

    def test_ignores_binary_reads_that_have_no_encoding_to_declare(self) -> None:
        assert not _violations('Path("x").read_bytes()\nb"x".decode()\n')
