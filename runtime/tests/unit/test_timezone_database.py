from datetime import datetime
from zoneinfo import ZoneInfo, reset_tzpath


def test_packaged_tzdb_without_os_database() -> None:
    try:
        reset_tzpath(())
        ZoneInfo.clear_cache()
        zone = ZoneInfo("America/Sao_Paulo")
        assert datetime(2026, 9, 8, 12, tzinfo=zone).utcoffset().total_seconds() == -10800
    finally:
        reset_tzpath()
        ZoneInfo.clear_cache()
