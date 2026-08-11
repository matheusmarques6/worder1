"""Commerce: a camada que decide sobre dinheiro.

Dois módulos (doc-fonte §3.5): `moments` resolve a verdade comercial vigente
para o turno (puro); `offer_engine` é o ÚNICO emissor de benefício (§3.4-1) —
a regra é pura (`decide_emission`) e a materialização passa pelo repository,
na transação curta de quem chamou. Nenhum módulo daqui abre conexão.
"""
