"""Commerce: a camada que decide sobre dinheiro — pura, sem banco.

Dois módulos (doc-fonte §3.5): `moments` resolve a verdade comercial vigente
para o turno; `offer_engine` é o ÚNICO emissor de benefício (§3.4-1). Nenhum
dos dois abre conexão — recebem dados e devolvem decisões; quem lê e grava é
o repository, na transação curta de quem chamou.
"""
