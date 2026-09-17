import asyncio

import pytest

from agents_runtime.server import _read_request


def _reader(raw: bytes) -> asyncio.StreamReader:
    reader = asyncio.StreamReader()
    reader.feed_data(raw)
    reader.feed_eof()
    return reader


@pytest.mark.parametrize("header", [b"Broken-Header", b": missing-name"])
async def test_malformed_header_is_rejected(header: bytes) -> None:
    request = b"GET /healthz HTTP/1.1\r\n" + header + b"\r\n\r\n"

    with pytest.raises(ValueError):
        await _read_request(_reader(request))


async def test_whitespace_before_header_colon_is_rejected() -> None:
    request = (
        b"POST /internal/preview-prompt HTTP/1.1\r\n"
        b"Content-Length : 2\r\n\r\n{}"
    )

    with pytest.raises(ValueError):
        await _read_request(_reader(request))


async def test_negative_content_length_is_rejected_by_the_parser() -> None:
    request = b"POST /internal/preview-prompt HTTP/1.1\r\nContent-Length: -1\r\n\r\n"

    with pytest.raises(ValueError, match="content-length"):
        await _read_request(_reader(request))


@pytest.mark.parametrize("value", [b"", b"+2", b"-0", b"1_0", b"\xb2"])
async def test_content_length_must_be_ascii_decimal_digits(value: bytes) -> None:
    request = (
        b"POST /internal/preview-prompt HTTP/1.1\r\nContent-Length: "
        + value
        + b"\r\n\r\n0123456789"
    )

    with pytest.raises(ValueError, match="content-length"):
        await _read_request(_reader(request))


async def test_duplicate_content_length_is_rejected() -> None:
    request = (
        b"POST /internal/preview-prompt HTTP/1.1\r\n"
        b"Content-Length: 2\r\n"
        b"Content-Length: 2\r\n\r\n{}"
    )

    with pytest.raises(ValueError):
        await _read_request(_reader(request))


async def test_transfer_encoding_is_rejected() -> None:
    request = (
        b"POST /internal/preview-prompt HTTP/1.1\r\n"
        b"Transfer-Encoding: chunked\r\n\r\n"
    )

    with pytest.raises(ValueError):
        await _read_request(_reader(request))


async def test_valid_preview_request_is_accepted() -> None:
    request = (
        b"POST /internal/preview-prompt HTTP/1.1\r\n"
        b"Content-Length: 2\r\n\r\n{}"
    )

    method, path, headers, body = await _read_request(_reader(request))

    assert (method, path) == ("POST", "/internal/preview-prompt")
    assert headers == {"content-length": "2"}
    assert body == b"{}"


async def test_incomplete_body_preserves_asyncio_error() -> None:
    request = (
        b"POST /internal/preview-prompt HTTP/1.1\r\n"
        b"Content-Length: 2\r\n\r\n{"
    )

    with pytest.raises(asyncio.IncompleteReadError):
        await _read_request(_reader(request))
