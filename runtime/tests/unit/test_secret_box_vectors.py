"""O port Python do secret-box, travado byte a byte contra o Node.

Os vetores em fixtures/secret_box_vectors.json foram gerados por
scripts/gen-secret-box-vectors.mjs com o node:crypto REAL (scrypt
N=16384/r=8/p=1, AES-256-GCM), espelhando src/lib/crypto/secret-box.ts.
Se o Python discordar do Node em UM byte, o runtime não lê os tokens que o
app gravou — e este arquivo é o que impede isso de virar incidente.
"""

import json
from pathlib import Path

import pytest

from agents_runtime.crypto.secret_box import (
    decrypt_secret,
    encrypt_secret,
    is_encrypted_secret,
)

FIXTURE = Path(__file__).parent / "fixtures" / "secret_box_vectors.json"
DATA = json.loads(FIXTURE.read_text())
KEY = DATA["encryption_key"]


class TestTheNodeVectorsDecrypt:
    @pytest.mark.parametrize("vector", DATA["vectors"], ids=lambda v: v["name"])
    def test_what_node_wrote_python_reads(self, vector: dict) -> None:
        assert decrypt_secret(vector["stored"], base_secret=KEY) == vector["plain"]


class TestRoundtrip:
    def test_what_python_writes_python_reads(self) -> None:
        stored = encrypt_secret("um segredo novo 🧡", base_secret=KEY)
        assert stored.startswith("v2:")
        assert decrypt_secret(stored, base_secret=KEY) == "um segredo novo 🧡"

    def test_two_encrypts_never_share_a_salt(self) -> None:
        a = encrypt_secret("mesmo texto", base_secret=KEY)
        b = encrypt_secret("mesmo texto", base_secret=KEY)
        assert a.split(":")[1] != b.split(":")[1]


class TestFailureIsLoud:
    def test_a_wrong_key_raises_instead_of_garbage(self) -> None:
        stored = DATA["vectors"][0]["stored"]
        with pytest.raises(ValueError):
            decrypt_secret(stored, base_secret="outra-chave-de-32-caracteres-ok!!")

    def test_a_tampered_ciphertext_raises(self) -> None:
        stored = DATA["vectors"][0]["stored"]
        head, _sep, tail = stored.rpartition(":")
        flipped = "0" if tail[0] != "0" else "1"
        with pytest.raises(ValueError):
            decrypt_secret(head + ":" + flipped + tail[1:], base_secret=KEY)

    def test_an_unknown_format_raises(self) -> None:
        with pytest.raises(ValueError):
            decrypt_secret("isto-nao-e-um-segredo", base_secret=KEY)


class TestIsEncrypted:
    def test_the_predicate_matches_the_ts_one(self) -> None:
        assert is_encrypted_secret(DATA["vectors"][0]["stored"]) is True
        assert is_encrypted_secret(DATA["vectors"][3]["stored"]) is True
        assert is_encrypted_secret("EAAGtokenplaintextdoMeta") is False
        assert is_encrypted_secret(None) is False
        assert is_encrypted_secret("") is False
        # Quirk herdado do TS: "a:b:c" são 3 partes hex válidas → True.
        # O contrato é ser IGUAL ao isEncryptedSecret do app, não ser esperto.
        assert is_encrypted_secret("a:b:c") is True
        # 3 partes com não-hex: plaintext com dois-pontos, não legado.
        assert is_encrypted_secret("um:token:plaintext") is False
