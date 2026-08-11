"""Port Python de src/lib/crypto/secret-box.ts — byte-compatível com o Node.

Formato de escrita (v2): ``v2:salt:iv:authTag:ciphertext`` (hex) — salt
aleatório de 16 bytes POR SEGREDO; chave = scrypt(base_secret, salt, 32) com
os defaults do Node (N=16384, r=8, p=1). Leitura dual: v2 (5 partes) e legado
``iv:tag:cipher`` (3 partes, salt estático ``'salt'``).

A compatibilidade é TRAVADA por vetores gerados do node:crypto real
(tests/unit/fixtures/secret_box_vectors.json, via
scripts/gen-secret-box-vectors.mjs). Mudança aqui sem mudar lá é build quebrado.

`base_secret` é injetado (o ENCRYPTION_KEY do app); `from_env()` resolve do
ambiente e falha alto se ausente — um runtime sem a chave não lê token nenhum
e precisa morrer no deploy, não emudecer em produção.
"""

import hashlib
import os
import re

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_IV_LENGTH = 16
_SALT_LENGTH = 16
_V2 = "v2"
_LEGACY_SALT = b"salt"
_SCRYPT_N = 16384
_SCRYPT_R = 8
_SCRYPT_P = 1
_HEX = re.compile(r"^[0-9a-f]+$", re.IGNORECASE)

ENCRYPTION_KEY_VARIABLE = "ENCRYPTION_KEY"


def _derive_key(base_secret: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        base_secret.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=32,
        # O scrypt do Node usa maxmem ~32MiB para estes parâmetros; o do
        # OpenSSL via hashlib precisa do teto explícito ou recusa N=16384.
        maxmem=64 * 1024 * 1024,
    )


def encrypt_secret(plain: str, *, base_secret: str) -> str:
    salt = os.urandom(_SALT_LENGTH)
    iv = os.urandom(_IV_LENGTH)
    sealed = AESGCM(_derive_key(base_secret, salt)).encrypt(iv, plain.encode("utf-8"), None)
    ciphertext, tag = sealed[:-16], sealed[-16:]
    return ":".join((_V2, salt.hex(), iv.hex(), tag.hex(), ciphertext.hex()))


def decrypt_secret(stored: str, *, base_secret: str) -> str:
    parts = stored.split(":")

    if len(parts) == 5 and parts[0] == _V2:
        _, salt_hex, iv_hex, tag_hex, data_hex = parts
        salt = bytes.fromhex(salt_hex)
    elif len(parts) == 3:
        iv_hex, tag_hex, data_hex = parts
        salt = _LEGACY_SALT
    else:
        raise ValueError(
            "secret-box: formato inválido (esperado v2:salt:iv:tag:cipher ou iv:tag:cipher hex)"
        )

    try:
        iv = bytes.fromhex(iv_hex)
        sealed = bytes.fromhex(data_hex) + bytes.fromhex(tag_hex)
        plain = AESGCM(_derive_key(base_secret, salt)).decrypt(iv, sealed, None)
    except (InvalidTag, ValueError) as error:
        # Chave errada, tag adulterada e hex inválido são o MESMO desfecho para
        # quem chama: este valor não decifra. Nunca devolver lixo.
        raise ValueError(
            "secret-box: falha ao decifrar (chave errada ou valor adulterado)"
        ) from error

    return plain.decode("utf-8")


def is_encrypted_secret(value: str | None) -> bool:
    if not value:
        return False
    parts = value.split(":")
    if len(parts) == 5 and parts[0] == _V2:
        return all(part and _HEX.match(part) for part in parts[1:])
    return len(parts) == 3 and all(part and _HEX.match(part) for part in parts)


def base_secret_from_env() -> str:
    key = os.environ.get(ENCRYPTION_KEY_VARIABLE, "")
    if len(key) < 32:
        raise RuntimeError(
            f"{ENCRYPTION_KEY_VARIABLE} ausente ou curta demais (<32): o runtime não "
            "conseguiria ler nenhum token gravado pelo app"
        )
    return key
