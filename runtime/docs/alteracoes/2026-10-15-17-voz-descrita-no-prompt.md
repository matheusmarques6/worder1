# 2026-10-15-17 · Voz do agente descrita no prompt

Pedido do lojista depois da integração da UI. No Construtor, as opções de
voz (Casual, Amigável, Profissional, Sofisticada) pareciam abas que não
mudavam nada. Sem migration.

## Por que

A escolha de voz grava `persona.tone` com uma chave em inglês (`casual`,
`friendly`, `professional`, `luxury`). O runtime colocava essa chave crua no
prompt: `Tom base: luxury.`. O modelo tinha que adivinhar o que "luxury"
quer dizer, e a tela não tinha como mostrar o efeito da escolha.

## O que mudou

`agent_core/prompt_compiler.py` ganha `_TONE`, um mapa de cada chave para
uma descrição em português. A linha do bloco AGENTE passa a ser, por
exemplo: `Tom base: sofisticado: vocabulário cuidado e frases completas,
sem gírias, abreviações ou emoji.`

Uma chave fora do mapa segue crua, como antes. Isso mantém valores antigos
ou escritos à mão.

## No app (mesmo commit)

`builder-model.VOICE_INFO` repete as mesmas descrições, com uma frase de
exemplo de cada voz. O Inspector do bloco do agente mostra os dois embaixo
das opções, então trocar a voz muda o que se vê. Se uma descrição mudar,
os dois lados mudam juntos.

## Cobertura

Unit: `tests/unit/test_prompt_compiler_blocks.py::TestToneIsDescribed`.
Cobre as quatro vozes e a chave desconhecida.

## Como reverter

Reverta o commit. O prompt volta a `Tom base: <chave>.`.
