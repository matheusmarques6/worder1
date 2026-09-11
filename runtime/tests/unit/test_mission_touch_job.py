from uuid import UUID

from agents_runtime.queueing.jobs import MissionTouchJob


def test_touch_identity_survives_transport_replay() -> None:
    payload = {
        "kind": "mission_touch",
        "organization_id": "11111111-1111-1111-1111-111111111111",
        "contact_id": "22222222-2222-2222-2222-222222222222",
        "conversation_id": "33333333-3333-3333-3333-333333333333",
        "touch_id": "44444444-4444-4444-8444-444444444444",
        "event_family": "cart.abandoned",
    }

    assert MissionTouchJob.from_payload(payload).touch_id == UUID(payload["touch_id"])
