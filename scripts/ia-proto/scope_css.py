#!/usr/bin/env python3
"""Escopa o CSS do protótipo da aba IA (Worder_Completo_offline_1.html).

O protótipo escreve CSS global (:root, body, button, .btn…). No app ele só
pode valer dentro da área IA, então cada seletor ganha o prefixo de um
invólucro e os nomes de animação ganham o prefixo `wp-` (o Tailwind também
tem `spin`, `pulse`…). As regras da sidebar e do layout falso do protótipo
saem: o app já tem a sua.

Uso:  python3 scripts/ia-proto/scope_css.py
Lê   scripts/ia-proto/source/*.css (copiados do HTML, sem edição)
Grava src/styles/ia-proto/*.css (gerados; não editar à mão)
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts" / "ia-proto" / "source"
OUT = ROOT / "src" / "styles" / "ia-proto"

# arquivo -> seletor do invólucro que substitui :root/html/body
FILES = {
    "base.css": ".wp",
    "p1.css": ".wp",
    "p1-extra.css": ".wp",
    # Construtor e Conhecimento trocam fonte e cores (DM Sans, ação preta).
    "builder.css": ".wp.wp-b",
    "kb.css": ".wp.wp-b",
}

# Layout falso do protótipo (sidebar, app, root): o Worder já tem o seu.
DROP = re.compile(r"^(#root|\.app|\.main|\.sb(-[\w-]+)?|\.scrim-sb)(?![\w-])")

ANIM_NAMES: set[str] = set()


def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def parse(css: str) -> list:
    """Devolve [(prelude, body)] onde body é str (declarações) ou lista (bloco aninhado)."""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == "{":
                depth += 1
            elif css[k] == "}":
                depth -= 1
            k += 1
        inner = css[j + 1 : k - 1]
        if prelude.startswith("@") and not prelude.startswith("@font-face") and "{" in inner:
            out.append((prelude, parse(inner)))
        else:
            out.append((prelude, inner.strip()))
        i = k
    return out


def scope_selector(sel: str, wrap: str) -> str | None:
    sel = sel.strip()
    if not sel:
        return None
    if DROP.match(sel):
        return None
    if sel in (":root", "html", "body", "html,body"):
        return wrap
    if sel == "*":
        return f"{wrap},{wrap} *"
    for head in (":root", "body", "html"):
        if sel.startswith(head + " ") or sel.startswith(head + "."):
            rest = sel[len(head):]
            return wrap + rest if rest.startswith(".") else f"{wrap}{rest}"
    if sel.startswith("::") or sel.startswith(":focus") or sel.startswith(":"):
        return f"{wrap} {sel}"
    return f"{wrap} {sel}"


def rename_animations(body: str) -> str:
    def fix(m: re.Match) -> str:
        prop, val = m.group(1), m.group(2)
        parts = []
        for chunk in val.split(","):
            words = chunk.strip().split()
            words = [f"wp-{w}" if w in ANIM_NAMES else w for w in words]
            parts.append(" ".join(words))
        return f"{prop}:{', '.join(parts)}"

    return re.sub(r"(animation(?:-name)?)\s*:\s*([^;]+)", fix, body)


def emit(rules: list, wrap: str) -> str:
    out = []
    for prelude, body in rules:
        if prelude.startswith("@font-face"):
            continue
        if prelude.startswith("@keyframes"):
            name = prelude.split()[1]
            inner = body if isinstance(body, str) else emit_raw(body)
            out.append(f"@keyframes wp-{name}{{{inner}}}")
            continue
        if prelude.startswith("@"):
            inner = emit(body, wrap) if isinstance(body, list) else ""
            if inner:
                out.append(f"{prelude}{{{inner}}}")
            continue
        sels = [s for s in (scope_selector(x, wrap) for x in split_selectors(prelude)) if s]
        if not sels or not body:
            continue
        out.append(f"{','.join(sels)}{{{rename_animations(body)}}}")
    return "\n".join(out)


def emit_raw(rules: list) -> str:
    return "".join(f"{p}{{{b if isinstance(b, str) else emit_raw(b)}}}" for p, b in rules)


def split_selectors(prelude: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in prelude:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return parts


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sources = {name: strip_comments((SRC / name).read_text()) for name in FILES}
    for css in sources.values():
        ANIM_NAMES.update(re.findall(r"@keyframes\s+([\w-]+)", css))
    for name, wrap in FILES.items():
        body = emit(parse(sources[name]), wrap)
        header = (
            f"/* GERADO por scripts/ia-proto/scope_css.py a partir de scripts/ia-proto/source/{name}.\n"
            "   CSS do protótipo da aba IA, escopado em .wp. Não editar à mão. */\n"
        )
        (OUT / name).write_text(header + body + "\n")
        print(f"{name}: {len(body)} bytes")


if __name__ == "__main__":
    main()
