import signal
from types import SimpleNamespace

from agents_runtime import __main__ as entrypoint
from tests.support import runtime_process


class FakeProcess:
    def __init__(self):
        self.sent_signal = None

    def send_signal(self, received):
        self.sent_signal = received

    def terminate(self):
        raise AssertionError("Windows graceful shutdown must not use TerminateProcess")

    def wait(self, timeout):
        assert timeout == 15
        return 0


def test_windows_runtime_process_uses_ctrl_break(monkeypatch):
    created = {}
    process = FakeProcess()

    def popen(*args, **kwargs):
        created.update(kwargs)
        return process

    monkeypatch.setattr(runtime_process.os, "name", "nt")
    monkeypatch.setattr(runtime_process.subprocess, "Popen", popen)
    monkeypatch.setattr(runtime_process.subprocess, "CREATE_NEW_PROCESS_GROUP", 512, raising=False)
    monkeypatch.setattr(runtime_process.signal, "CTRL_BREAK_EVENT", 21, raising=False)

    running = runtime_process.RuntimeProcess("postgresql://test", name="signals")
    running.start()

    assert created["creationflags"] == 512
    assert running.terminate() == 0
    assert process.sent_signal == 21


def test_windows_entrypoint_registers_sigbreak(monkeypatch):
    registered = []

    class UnsupportedLoop:
        def add_signal_handler(self, *_):
            raise NotImplementedError

    monkeypatch.setattr(entrypoint.asyncio, "get_running_loop", UnsupportedLoop)
    monkeypatch.setattr(entrypoint.signal, "SIGBREAK", 21, raising=False)
    monkeypatch.setattr(
        entrypoint.signal,
        "signal",
        lambda received, callback: registered.append((received, callback)),
    )

    stop = SimpleNamespace(set=lambda: None)
    entrypoint._stop_on_shutdown_signals(stop)

    assert [received for received, _ in registered] == [signal.SIGINT, signal.SIGTERM, 21]
