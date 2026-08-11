"""The job contracts the queues carry.

The payload shapes are fixed by the SQL that produces them (the coalescer for
`q_inbound`); this module is the Python mirror. Parsing is strict on purpose —
a job with a missing field is a contract violation, and a contract violation
classifies as permanent (unidade 4), which routes it to the DLQ instead of
retrying forever.
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID


@dataclass(frozen=True, slots=True)
class InboundJob:
    """What the coalescer enqueued: respond to this conversation up to target_seq."""

    conversation_id: UUID
    generation: int
    target_seq: int
    organization_id: UUID
    otel: dict[str, Any] | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "InboundJob":
        try:
            return cls(
                conversation_id=UUID(payload["conversation_id"]),
                generation=int(payload["generation"]),
                target_seq=int(payload["target_seq"]),
                organization_id=UUID(payload["organization_id"]),
                otel=payload.get("otel"),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"malformed inbound job: {payload!r}") from error


@dataclass(frozen=True, slots=True)
class DomainEventJob:
    """Contrato do motor para q_domain_events — MORRE no commit do toucher:
    internal.webhook_events não foi portada (FORK.md) e o payload canônico do
    Worder é o MissionTouchJob abaixo. Vive só até o handler trocar."""

    webhook_event_id: int
    otel: dict[str, Any] | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "DomainEventJob":
        try:
            return cls(
                webhook_event_id=int(payload["webhook_event_id"]),
                otel=payload.get("otel"),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"malformed domain event job: {payload!r}") from error


@dataclass(frozen=True, slots=True)
class MissionTouchJob:
    """O que `public.emit_ai_mission_job` enfileirou: o nó PEDIU um toque.

    `mission_version_id` do payload é INFORMATIVO (a missão ativa na hora da
    emissão) — o toucher re-resolve a família na hora do consumo, porque a
    verdade é do turno (§3.2.2 passo 2). `delta` refina a missão para ESTE
    toque; `concession_request` é o desejo do nó, capado pelo engine.
    """

    organization_id: UUID
    contact_id: UUID
    conversation_id: UUID
    event_family: str
    node_ref: str | None = None
    delta: dict[str, Any] | None = None
    concession_request: dict[str, Any] | None = None
    preferred_channel: str = "whatsapp"
    otel: dict[str, Any] | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "MissionTouchJob":
        try:
            if payload.get("kind") != "mission_touch":
                raise ValueError(f"kind: {payload.get('kind')!r}")
            return cls(
                organization_id=UUID(payload["organization_id"]),
                contact_id=UUID(payload["contact_id"]),
                conversation_id=UUID(payload["conversation_id"]),
                event_family=str(payload["event_family"]),
                node_ref=payload.get("node_ref"),
                delta=payload.get("delta") or None,
                concession_request=payload.get("concession_request"),
                preferred_channel=str(payload.get("preferred_channel") or "whatsapp"),
                otel=payload.get("otel"),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"malformed mission touch job: {payload!r}") from error
