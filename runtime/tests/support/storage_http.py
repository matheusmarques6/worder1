"""Synthetic JWTs for the fixed loopback Storage HTTP proof (not GoTrue login)."""

import base64
import hashlib
import hmac
import json
import time
from urllib.parse import urlsplit


def checked_path(path):
    parsed = urlsplit(path)
    if parsed.scheme or parsed.netloc or not path.startswith("/") or "\\" in path:
        raise ValueError("Storage requests must remain relative to the fixed loopback origin")
    return path


def token(secret, role, *, user=None, session=None, seconds=300):
    claims = {"role": role, "iat": int(time.time()), "exp": int(time.time()) + seconds}
    if user is not None:
        claims.update(sub=str(user), session_id=str(session), aal="aal1")

    def encode(value):
        return base64.urlsafe_b64encode(value).rstrip(b"=")

    body = b".".join(encode(json.dumps(value, separators=(",", ":")).encode()) for value in (
        {"alg": "HS256", "typ": "JWT"}, claims,
    ))
    signature = encode(hmac.new(secret.encode(), body, hashlib.sha256).digest())
    return (body + b"." + signature).decode()
