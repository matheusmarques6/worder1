"""Stored Shopify tokens must never send a broken envelope to a provider."""
import pytest

from agents_runtime.agent_core.providers import decode_stored_key

KEY = "synthetic-credential-test-key-at-least-32-characters"


@pytest.mark.parametrize("value", ["v2:broken", "aa:bb:zz", "v3:unsupported"])
def test_declared_ciphertext_never_falls_through_as_plaintext(value):
    with pytest.raises(ValueError):
        decode_stored_key(value, base_secret=KEY)


def test_legacy_plaintext_remains_readable():
    assert decode_stored_key("shpat_synthetic", base_secret=None) == "shpat_synthetic"
