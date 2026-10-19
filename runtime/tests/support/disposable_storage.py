"""Explicit local Storage extension; canonical DB/Auth executor stays unchanged.

Invoke via JSON stdin with the canonical four request keys plus Profile set to
``storage-http-v1``. Prepare/Replay/Stop remain canonical; Test has fixed targets.
All credentials are freshly generated local fixtures, never caller configuration.
"""

import json
import re
import secrets
import socket
import sys
import time
from pathlib import Path

import httpx
import psycopg

from tests.support import disposable_executor as ex

STORAGE_IMAGE = (
    "public.ecr.aws/supabase/storage-api@sha256:"
    "a4846b3329f3afd52cd2ae31b89a0c1ae841221e9d3a22d55db65f9dca2a72b6"
)
TARGETS = [
    "tests/db/test_private_whatsapp_media.py",
    "tests/db/test_mirror_media_ownership.py",
    "tests/db/test_private_whatsapp_media_http.py",
]


def labels(project):
    ex.require(re.fullmatch(r"waudit-[0-9a-f]{32}", project), "invalid Storage project")
    return {
        "com.supabase.cli.project": project,
        "com.docker.compose.project": project,
        "worder.disposable.profile": "storage-http-v1",
    }


def validate_storage_record(data, project, image_id, network_id, container_id):
    """Reject drift before HTTP access or any cleanup mutation."""
    name = "waudit_storage_" + project
    network = "supabase_network_" + project
    try:
        ex.require(isinstance(data, list) and len(data) == 1, "Storage container not unique")
        item = data[0]
        ex.require(
            re.fullmatch(r"[0-9a-f]{64}", container_id)
            and item["Id"] == container_id and item["Name"] == "/" + name,
            "Storage container identity changed",
        )
        ex.require(
            item["Image"] == image_id and item["Config"]["Image"] == STORAGE_IMAGE,
            "Storage image changed",
        )
        ex.require(
            all(item["Config"]["Labels"].get(k) == v for k, v in labels(project).items()),
            "Storage labels changed",
        )
        environment = dict(entry.split("=", 1) for entry in item["Config"]["Env"])
        ex.require(
            environment.get("DATABASE_URL") == (
                "postgresql://supabase_storage_admin:postgres@"
                f"supabase_db_{project}:5432/postgres"
            ) and environment.get("STORAGE_BACKEND") == "file"
            and environment.get("STORAGE_FILE_BACKEND_PATH") == "/var/lib/storage"
            and re.fullmatch(r"[0-9a-f]{64}", environment.get("AUTH_JWT_SECRET", "")),
            "Storage DB or local backend configuration changed",
        )
        bindings = {"5000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "45323"}]}
        running = item["State"]["Running"]
        ex.require(type(running) is bool, "invalid Storage running state")
        ex.require(item["HostConfig"]["PortBindings"] == bindings,
                   "Storage must bind only loopback 45323")
        if running:
            ex.require(item["NetworkSettings"]["Ports"] == bindings,
                       "Storage live port mapping changed")
        networks = item["NetworkSettings"]["Networks"]
        ex.require(
            set(networks) == {network}
            and networks[network]["NetworkID"] in ({network_id} if running else {network_id, ""}),
            "Storage network changed",
        )
        mounts = item["Mounts"]
        ex.require(
            len(mounts) == 1 and mounts[0]["Type"] == "volume"
            and mounts[0]["Name"] == name
            and mounts[0]["Destination"] == "/var/lib/storage" and mounts[0]["RW"] is True,
            "Storage volume changed",
        )
        ex.require(
            item["HostConfig"]["Privileged"] is False
            and item["HostConfig"]["NetworkMode"] == network,
            "unsafe Storage host configuration",
        )
    except (KeyError, TypeError, IndexError, AttributeError):
        raise ValueError("invalid Storage inspect record") from None
    return container_id


class StorageExecutor(ex.Executor):
    def render_config(self, text, enabled, *, source=False):
        return ex.config_text(text, self.project, enabled, source=source, storage_profile=True)

    def local(self, *arguments):
        result = super().local(*arguments)
        if arguments[0] == "start":
            # Docker health may precede Windows port-forward readiness. This is
            # only a bounded read; canonical physical() still compares both SIDs.
            deadline = time.monotonic() + 30
            while True:
                try:
                    ex.read_system_identifier(ex.DSN)
                    break
                except psycopg.OperationalError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.5)
        return result

    def __init__(self, repo, run, *, runner=ex.run_process):
        self.storage = None
        self.storage_secret = None

        def storage_runner(argv, **kwargs):
            # Canonical child_env has already discarded ambient secrets/routing.
            if argv[0] == "uv" and self.storage_secret:
                kwargs["env"] = dict(
                    kwargs["env"], WORDER_TEST_STORAGE_SECRET=self.storage_secret,
                    WORDER_TEST_STORAGE_PROFILE="storage-http-v1",
                )
            result = runner(argv, **kwargs)
            if result.returncode:
                output = (result.stdout or "") + "\n" + (result.stderr or "")
                output = re.sub(r"[A-Za-z][A-Za-z0-9+.-]*://\S+", "[url-redacted]", output)
                output = re.sub(r"eyJ[A-Za-z0-9_.-]+", "[jwt-redacted]", output)
                for value in (self.storage_secret, (self.identity or {}).get("sentinel")):
                    if value:
                        output = output.replace(value, "[redacted]")
                path = self.run / "storage-command-failure.log"
                ex.no_links(path)
                path.write_text(output[-64000:], encoding="utf-8")
            return result

        super().__init__(repo, run, runner=storage_runner)

    def storage_proof(self):
        self.proof()
        state = self.storage
        ex.require(isinstance(state, dict), "Storage identity unavailable")
        db = json.loads(self.command("docker", "inspect", self.identity["containerId"],
                                     timeout=30).stdout)[0]
        ex.require(
            db["NetworkSettings"]["Networks"]["supabase_network_" + self.project]["NetworkID"]
            == state["networkId"], "Storage no longer shares the proven DB network",
        )
        volume = json.loads(self.command(
            "docker", "volume", "inspect", state["volume"], timeout=30,
        ).stdout)
        ex.require(
            len(volume) == 1 and volume[0]["Name"] == "waudit_storage_" + self.project
            and volume[0]["Labels"] == labels(self.project)
            and state["volume"] not in ex.read_json(self.run / "storage-volumes-before.json"),
            "Storage volume ownership unavailable",
        )
        if state["containerId"]:
            raw = json.loads(self.command(
                "docker", "inspect", state["containerId"], timeout=30,
            ).stdout)
            validate_storage_record(
                raw, self.project, state["imageId"], state["networkId"], state["containerId"],
            )

    def start_storage(self):
        self.proof()
        self.history(self.files())
        ex.require(self.local_context_proven, "local Docker context proof unavailable")
        # Replay must have installed real official Storage tables already.
        ex.require(self.psql(self.identity["containerId"],
            "select to_regclass('storage.objects') is not null "
            "and to_regclass('storage.buckets') is not null;"
        ) == "t", "official Storage schema missing")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 45323))
        name = "waudit_storage_" + self.project
        network = "supabase_network_" + self.project
        ex.require(not self.command(
            "docker", "ps", "-a", "--filter", "name=^/" + name + "$",
            "--format", "{{.ID}}", timeout=30,
        ).stdout.strip(), "Storage name already occupied")
        before = self.command("docker", "volume", "ls", "--format", "{{.Name}}",
                              timeout=30).stdout.splitlines()
        ex.require(name not in before, "Storage volume already exists")
        ex.write_json(self.run / "storage-volumes-before.json", before)
        db = json.loads(self.command("docker", "inspect", self.identity["containerId"],
                                     timeout=30).stdout)[0]
        net = json.loads(self.command("docker", "network", "inspect", network,
                                      timeout=30).stdout)[0]
        ex.require(
            net["Name"] == network
            and net["Labels"].get("com.supabase.cli.project") == self.project
            and db["NetworkSettings"]["Networks"][network]["NetworkID"] == net["Id"],
            "DB network ownership unavailable",
        )
        self.command("docker", "pull", STORAGE_IMAGE, timeout=300)
        image = json.loads(self.command("docker", "image", "inspect", STORAGE_IMAGE,
                                        timeout=30).stdout)[0]
        ex.require(STORAGE_IMAGE in image["RepoDigests"], "Storage digest not pinned")
        self.storage_secret = secrets.token_hex(32)
        environment = {
            "DATABASE_URL": f"postgresql://supabase_storage_admin:postgres@supabase_db_{self.project}:5432/postgres",
            "AUTH_JWT_SECRET": self.storage_secret,
            "AUTH_JWT_ALGORITHM": "HS256",
            "STORAGE_BACKEND": "file",
            "STORAGE_FILE_BACKEND_PATH": "/var/lib/storage",
            "TENANT_ID": self.project,
            "SERVER_HOST": "0.0.0.0", "SERVER_PORT": "5000",
            "DB_INSTALL_ROLES": "false", "DB_ALLOW_MIGRATION_REFRESH": "false",
            "IMAGE_TRANSFORMATION_ENABLED": "false", "PG_QUEUE_ENABLE": "false",
            "DATABASE_MAX_CONNECTIONS": "4", "OTEL_METRICS_ENABLED": "false",
        }
        env_file = self.run / "storage-local.env"
        ex.no_links(env_file)
        env_file.write_text("".join(f"{k}={v}\n" for k, v in environment.items()),
                            encoding="utf-8")
        label_args = [part for pair in labels(self.project).items()
                      for part in ("--label", "=".join(pair))]
        try:
            self.command("docker", "volume", "create", *label_args, name, timeout=30)
            self.storage = {
                "volume": name, "containerId": None, "imageId": image["Id"],
                "networkId": net["Id"],
            }
            ex.write_json(self.run / "storage-identity.json", self.storage)
            self.storage_proof()
            container = self.command(
                "docker", "create", "--name", name, *label_args,
                "--network", network, "--publish", "127.0.0.1:45323:5000",
                "--mount", f"type=volume,source={name},target=/var/lib/storage",
                "--env-file", env_file, STORAGE_IMAGE, timeout=30,
            ).stdout.strip()
            ex.require(re.fullmatch(r"[0-9a-f]{64}", container), "invalid Storage id")
            self.storage["containerId"] = container
            ex.write_json(self.run / "storage-identity.json", self.storage)
        finally:
            env_file.unlink(missing_ok=True)
        self.command("docker", "start", container, timeout=30)
        self.storage_proof()
        deadline = time.monotonic() + 45
        with httpx.Client(base_url="http://127.0.0.1:45323", trust_env=False, timeout=2) as client:
            while time.monotonic() < deadline:
                try:
                    if client.get("/status").status_code == 200:
                        self.storage_proof()
                        return
                except httpx.HTTPError:
                    pass
                time.sleep(0.5)
        raise RuntimeError("official Storage HTTP did not become ready")

    def test(self, test_targets):
        ex.require(test_targets in ([], TARGETS), "fixed Storage targets required")
        self.gate["stage"] = "storage-start"
        self.start_storage()
        super().test(test_targets)
        # Full Test[] already includes the HTTP file in canonical -m db. Keep
        # clean-commit, collection counts, DB/RLS/pipeline and skip guards intact.

    def pytest_command(self, arguments, stage):
        return super().pytest_command(
            [*arguments, "--tb=short", "-o", "verbosity_assertions=0"], stage,
        )

    def stop(self):
        state_file = self.run / "storage-identity.json"
        ex.no_links(state_file)
        if state_file.is_file():
            persisted = ex.read_json(state_file)
            if self.storage:
                ex.require(persisted == self.storage, "Storage cleanup identity changed")
            self.storage = persisted
            self.storage_proof()
            if self.storage["containerId"]:
                self.command("docker", "rm", "-f", self.storage["containerId"], timeout=30)
                self.storage["containerId"] = None
                ex.write_json(state_file, self.storage)
            self.command("docker", "volume", "rm", self.storage["volume"], timeout=30)
            state_file.unlink()
            self.storage_secret = None
        return super().stop()


def main():
    try:
        request = json.loads(sys.stdin.read())
        ex.require(isinstance(request, dict) and set(request) == {
            "Profile", "Action", "RunDirectory", "TestTargets", "MigrationThrough",
        }, "invalid Storage request")
        ex.require(request["Profile"] == "storage-http-v1", "explicit Storage opt-in required")
        ex.require(request["Action"] in {"Prepare", "Replay", "Test", "Stop"},
                   "invalid Storage action")
        repo = Path(__file__).resolve().parents[3]
        run = ex.safe_run(repo, request["RunDirectory"])
        return StorageExecutor(repo, run).execute(
            request["Action"], request["TestTargets"], request["MigrationThrough"],
        )
    except (Exception, KeyboardInterrupt) as error:
        sys.stderr.write("Storage profile refused request; inspect local gates evidence\n")
        return error.code if isinstance(error, ex.CommandFailure) else 2


if __name__ == "__main__":
    raise SystemExit(main())
