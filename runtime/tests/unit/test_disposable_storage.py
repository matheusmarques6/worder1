"""Guard regressions for the opt-in real Storage profile."""

import copy
import json
import tomllib
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlunsplit

import pytest

from tests.support import disposable_executor as canonical
from tests.support import disposable_storage as storage

PROJECT = 'waudit-' + 'a' * 32
ID = 'b' * 64
IMAGE_ID = 'sha256:' + 'c' * 64
NETWORK_ID = 'd' * 64


def record():
    return {
        'Id': ID, 'Name': '/waudit_storage_' + PROJECT,
        'Image': IMAGE_ID,
        'Config': {'Image': storage.STORAGE_IMAGE,
                   'Env': [
                       'DATABASE_URL=postgresql://supabase_storage_admin:postgres@'
                       f'supabase_db_{PROJECT}:5432/postgres',
                       'STORAGE_BACKEND=file',
                       'STORAGE_FILE_BACKEND_PATH=/var/lib/storage',
                       'AUTH_JWT_SECRET=' + 'a' * 64,
                   ],
                   'Labels': storage.labels(PROJECT)},
        'State': {'Running': True},
        'NetworkSettings': {
            'Ports': {'5000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '45323'}]},
            'Networks': {'supabase_network_' + PROJECT: {'NetworkID': NETWORK_ID}},
        },
        'Mounts': [{'Type': 'volume', 'Name': 'waudit_storage_' + PROJECT,
                    'Destination': '/var/lib/storage', 'RW': True}],
        'HostConfig': {
            'Privileged': False, 'NetworkMode': 'supabase_network_' + PROJECT,
            'PortBindings': {'5000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '45323'}]},
        },
    }


def test_storage_profile_preserves_canonical_defaults():
    assert canonical.EXPECTED['storage'] == {'enabled': False}
    assert 'storage-api' in canonical.EXCLUDED.split(',')
    assert storage.StorageExecutor.prepare is canonical.Executor.prepare
    assert storage.StorageExecutor.replay is canonical.Executor.replay
    assert storage.StorageExecutor.config is canonical.Executor.config
    assert storage.StorageExecutor.proof is canonical.Executor.proof
    assert storage.StorageExecutor.execute is canonical.Executor.execute


def test_storage_opt_in_changes_only_the_storage_config_value():
    repo = Path(__file__).resolve().parents[3]
    source = (repo / 'supabase/config.toml').read_text(encoding='utf-8')
    normal = canonical.config_text(source, PROJECT, False, source=True)
    opted = canonical.config_text(source, PROJECT, False, source=True, storage_profile=True)
    expected = tomllib.loads(normal)
    expected['storage']['enabled'] = True
    assert tomllib.loads(opted) == expected
    with pytest.raises(ValueError, match='unexpected config'):
        canonical.config_text(opted, PROJECT, False)
    with pytest.raises(ValueError, match='unexpected config'):
        canonical.config_text(normal, PROJECT, False, storage_profile=True)
    assert canonical.config_text(opted, PROJECT, True, storage_profile=True)


@pytest.mark.parametrize('value', ['true', 1, None])
def test_storage_opt_in_requires_a_real_boolean(value):
    repo = Path(__file__).resolve().parents[3]
    source = (repo / 'supabase/config.toml').read_text(encoding='utf-8')
    with pytest.raises(ValueError, match='invalid Storage profile'):
        canonical.config_text(source, PROJECT, False, source=True, storage_profile=value)


def test_exact_owned_storage_record_is_accepted():
    assert storage.validate_storage_record(
        [record()], PROJECT, IMAGE_ID, NETWORK_ID, ID,
    ) == ID


def test_stopped_owned_storage_is_still_provable_for_cleanup():
    stopped = record()
    stopped['State']['Running'] = False
    stopped['NetworkSettings']['Ports'] = {}
    assert storage.validate_storage_record([stopped], PROJECT, IMAGE_ID, NETWORK_ID, ID) == ID
    # Docker create may fail to start before allocating the runtime network ID.
    stopped['NetworkSettings']['Networks']['supabase_network_' + PROJECT]['NetworkID'] = ''
    assert storage.validate_storage_record([stopped], PROJECT, IMAGE_ID, NETWORK_ID, ID) == ID


@pytest.mark.parametrize('change', [
    lambda r: r.update(Id='e' * 64),
    lambda r: r.update(Name='/unrelated'),
    lambda r: r.update(Image='sha256:' + 'e' * 64),
    lambda r: r['Config'].update(Image='storage-api:latest'),
    lambda r: r['Config']['Labels'].update({'com.supabase.cli.project': 'other'}),
    lambda r: r['Config'].update(Env=['DATABASE_URL=postgresql://remote/postgres']),
    lambda r: r['NetworkSettings']['Ports']['5000/tcp'][0].update(HostIp='0.0.0.0'),
    lambda r: r['NetworkSettings']['Ports']['5000/tcp'][0].update(HostPort='54323'),
    lambda r: r['NetworkSettings']['Networks'].update({'foreign': {'NetworkID': NETWORK_ID}}),
    lambda r: r['Mounts'][0].update(Name='real-data'),
    lambda r: r['Mounts'][0].update(Type='bind'),
    lambda r: r['Mounts'].append({'Type': 'bind', 'Destination': '/host'}),
    lambda r: r['HostConfig'].update(Privileged=True),
    lambda r: r['HostConfig']['PortBindings']['5000/tcp'][0].update(HostIp='0.0.0.0'),
])
def test_storage_identity_drift_is_refused(change):
    altered = copy.deepcopy(record())
    change(altered)
    with pytest.raises(ValueError):
        storage.validate_storage_record([altered], PROJECT, IMAGE_ID, NETWORK_ID, ID)


def test_extra_test_targets_are_rejected_before_storage_start(tmp_path):
    executor = storage.StorageExecutor(Path(__file__).resolve().parents[3], tmp_path / ('a' * 32))
    with pytest.raises(ValueError, match='fixed Storage targets'):
        executor.test(['tests/db/test_other.py'])


def test_storage_failure_evidence_redacts_local_credentials(tmp_path):
    run = tmp_path / ('a' * 32)
    run.mkdir()
    secret, sentinel = 'c' * 64, 'd' * 64
    jwt = 'eyJ' + 'synthetic.header.signature'
    output = f'failure {secret} {sentinel} {jwt} postgresql://fixture:fixture@localhost/db'
    executor = storage.StorageExecutor(
        Path(__file__).resolve().parents[3], run,
        runner=lambda argv, **kwargs: SimpleNamespace(returncode=1, stdout=output, stderr=''),
    )
    executor.storage_secret = secret
    executor.identity = {'sentinel': sentinel}
    executor.runner(['synthetic-command'])
    evidence = (run / 'storage-command-failure.log').read_text(encoding='utf-8')
    for value in (secret, sentinel, jwt, 'postgresql://'):
        assert value not in evidence
    assert 'failure' in evidence
    assert '[jwt-redacted]' in evidence and '[url-redacted]' in evidence


@pytest.mark.parametrize('local_proven', [False, True])
def test_storage_pulls_exact_digest_only_after_local_proof(tmp_path, monkeypatch, local_proven):
    executor = storage.StorageExecutor(Path(__file__).resolve().parents[3], tmp_path / ('a' * 32))
    executor.local_context_proven = local_proven
    executor.identity = {'containerId': ID}
    monkeypatch.setattr(executor, 'proof', lambda: None)
    monkeypatch.setattr(executor, 'history', lambda files: None)
    monkeypatch.setattr(executor, 'files', lambda: [])
    monkeypatch.setattr(executor, 'psql', lambda *args: 't')
    monkeypatch.setattr(canonical, 'write_json', lambda *args: None)

    class ImageReached(Exception):
        pass

    calls = []
    network = 'supabase_network_' + PROJECT

    def command(*args, **kwargs):
        calls.append(args)
        if args[:3] == ('docker', 'image', 'inspect'):
            assert ('docker', 'pull', storage.STORAGE_IMAGE) in calls
            raise ImageReached
        if args[:2] == ('docker', 'inspect'):
            return SimpleNamespace(stdout=json.dumps([{
                'NetworkSettings': {'Networks': {network: {'NetworkID': NETWORK_ID}}},
            }]))
        if args[:3] == ('docker', 'network', 'inspect'):
            return SimpleNamespace(stdout=json.dumps([{
                'Name': network, 'Id': NETWORK_ID,
                'Labels': {'com.supabase.cli.project': PROJECT},
            }]))
        return SimpleNamespace(stdout='')

    # No real socket or Docker call: exercise startup ordering on a fresh image cache.
    class Listener:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def bind(self, address):
            assert address == ('127.0.0.1', 45323)

    monkeypatch.setattr(storage.socket, 'socket', Listener)
    monkeypatch.setattr(executor, 'command', command)
    with pytest.raises(ImageReached if local_proven else ValueError):
        executor.start_storage()
    if not local_proven:
        assert calls == []


def test_http_requests_reject_foreign_origin():
    from tests.support.storage_http import checked_path
    # Reserved .invalid host is only parser input; this test performs no HTTP.
    remote = urlunsplit(('https', 'storage.invalid', '/object/x', '', ''))
    for path in [remote, '//host/object/x', '/\\host/x']:
        with pytest.raises(ValueError):
            checked_path(path)
    assert checked_path('/object/whatsapp-media/a/b/c') == '/object/whatsapp-media/a/b/c'
