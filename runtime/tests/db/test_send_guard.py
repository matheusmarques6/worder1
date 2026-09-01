"""Item 32 — o send-guard do runtime: breaker por número e cooldown de throttle.

A régua mora em SQL, como o `sender_preflight` (ruling A): uma função
`SECURITY DEFINER` decide e o sender executa o veredito. A chave é o
`phone_number_id` — o número FÍSICO da Meta — pelo mesmo motivo que o cabeçalho
do `send-guard.ts` escreve com todas as letras: chavear por id de tabela racha o
estado entre campanha e interativo e permite ~2x o limite real.

Os números são os do TS onde ambos existem, e a paridade não é estética: dois
motores com limiares diferentes na MESMA conta é a doença que este item trata.

- breaker: 5 falhas seguidas → 30 s (`send-guard.ts:64-65`)
- throttle: 10 / 20 / 50 erros de excesso no dia → 1 / 5 / 10 min
  (`rate-limiter.ts:612-623`), com o dia em UTC (`:726`, `toISOString`)

O que este item NÃO conta — pair-rate, throughput e cota diária — está fora por
ruling M, e o motivo não é falta de tempo: um número aqui seria falso enquanto o
outro motor gastar do mesmo teto sem ser visto.

**Por que quase tudo aqui roda na conexão `admin`:** o estado do guard é global
por número e as cascatas deste arquivo são longas (até 50 relatos seguidos), e
uma conexão em transação não enxergaria o que ela mesma acabou de gravar por
outra conexão. `admin` é autocommit. O que depende do PAPEL — o grant das duas
funções ao `sender_role` — tem o seu próprio teste, com `as_app_role`.
"""

import uuid
from collections.abc import Iterator

import psycopg
import pytest

from tests.db.conftest import TwoTenants, as_app_role

FAILURE_THRESHOLD = 5
THROTTLE_STEPS = ((10, 60), (20, 300), (50, 600))


def check(conn: psycopg.Connection, phone_number_id: str) -> tuple | None:
    """O veredito cru: `None` = pode enviar (linha ausente ou janela vencida)."""
    row = conn.execute(
        "select reason, retry_after from internal.send_guard_check(%s)",
        (phone_number_id,),
    ).fetchone()
    return None if row is None or row[0] is None else row


def report(
    conn: psycopg.Connection,
    phone_number_id: str,
    *,
    success: bool,
    rate_limited: bool = False,
) -> None:
    conn.execute(
        "select internal.send_guard_report(%s, %s, %s)",
        (phone_number_id, success, rate_limited),
    )


def a_number() -> str:
    """Um `phone_number_id` só deste teste — o estado do guard é global por
    número, então dois testes no mesmo número se contaminariam."""
    return f"pnid-{uuid.uuid4().hex[:16]}"


def expire_window(conn: psycopg.Connection, phone_number_id: str, column: str) -> None:
    """O relógio andando, sem `sleep`: a janela passa a estar no passado."""
    assert column in ("open_until", "throttled_until")
    conn.execute(
        f"update internal.whatsapp_send_guard set {column} = now() - interval '1 second'"
        " where phone_number_id = %s",
        (phone_number_id,),
    )


@pytest.fixture(autouse=True)
def clean_guard_state(admin: psycopg.Connection) -> Iterator[None]:
    """O estado do guard é por NÚMERO, não por org — o teardown por org da
    conftest não o alcança, e sem isto cada rodada deixaria lixo no banco."""
    yield
    admin.execute(
        "delete from internal.whatsapp_send_guard where phone_number_id like 'pnid-%'"
    )


class TestTheBreaker:
    def test_a_number_nobody_ever_failed_on_passes(self, admin: psycopg.Connection) -> None:
        assert check(admin, a_number()) is None

    def test_four_failures_do_not_open_and_the_fifth_does(
        self, admin: psycopg.Connection
    ) -> None:
        """O limiar é o do TS, e é `>=`, não `>`: a 5ª falha JÁ segura."""
        pnid = a_number()
        for _ in range(FAILURE_THRESHOLD - 1):
            report(admin, pnid, success=False)
        assert check(admin, pnid) is None

        report(admin, pnid, success=False)
        held = check(admin, pnid)

        assert held is not None
        reason, retry_after = held
        assert reason == "circuit_open"
        # 30 s do TS, com folga para o tempo que o próprio teste gastou.
        assert 25 <= retry_after.total_seconds() <= 30

    def test_a_success_closes_it_before_the_threshold(self, admin: psycopg.Connection) -> None:
        """"Seguidas" é a palavra: quatro falhas, um sucesso, quatro falhas —
        oito falhas no total e o número continua enviando, porque nenhuma
        sequência chegou a cinco."""
        pnid = a_number()
        for _ in range(FAILURE_THRESHOLD - 1):
            report(admin, pnid, success=False)
        report(admin, pnid, success=True)
        for _ in range(FAILURE_THRESHOLD - 1):
            report(admin, pnid, success=False)

        assert check(admin, pnid) is None

    def test_the_window_expiring_lets_the_next_send_through(
        self, admin: psycopg.Connection
    ) -> None:
        pnid = a_number()
        for _ in range(FAILURE_THRESHOLD):
            report(admin, pnid, success=False)
        assert check(admin, pnid) is not None

        expire_window(admin, pnid, "open_until")
        assert check(admin, pnid) is None

    def test_one_failure_after_the_window_reopens_it_immediately(
        self, admin: psycopg.Connection
    ) -> None:
        """O essencial do HALF_OPEN do TS, sem a máquina de três estados.

        Passada a janela, o contador NÃO volta a zero — ele fica no limiar. Uma
        falha o cruza de novo na hora, que é o `HALF_OPEN → OPEN` do TS
        (`circuit-breaker.ts:112-115`: uma falha reabre). Sem isso, uma conta
        derrubada de verdade levaria mais cinco mensagens a cada 30 s.
        """
        pnid = a_number()
        for _ in range(FAILURE_THRESHOLD):
            report(admin, pnid, success=False)
        expire_window(admin, pnid, "open_until")
        assert check(admin, pnid) is None

        report(admin, pnid, success=False)
        assert check(admin, pnid)[0] == "circuit_open"

    def test_one_success_after_the_window_closes_it_for_good(
        self, admin: psycopg.Connection
    ) -> None:
        """A outra metade da mesma regra — sem ela o número ficaria a uma falha
        de reabrir para sempre, e a recuperação nunca aconteceria."""
        pnid = a_number()
        for _ in range(FAILURE_THRESHOLD):
            report(admin, pnid, success=False)
        expire_window(admin, pnid, "open_until")

        report(admin, pnid, success=True)
        report(admin, pnid, success=False)
        assert check(admin, pnid) is None

    def test_two_numbers_do_not_contaminate_each_other(self, admin: psycopg.Connection) -> None:
        """A chave é o número, e o número é físico: o vizinho não paga."""
        broken, healthy = a_number(), a_number()
        for _ in range(FAILURE_THRESHOLD):
            report(admin, broken, success=False)

        assert check(admin, broken) is not None
        assert check(admin, healthy) is None


class TestTheThrottle:
    def test_nine_excess_signals_do_not_hold_and_the_tenth_does(
        self, admin: psycopg.Connection
    ) -> None:
        """O 1º degrau da escada do TS. As 9 primeiras já abrem o breaker
        (5 falhas seguidas), então um sucesso o fecha para que o que sobra na
        mesa seja o throttle, e só ele."""
        pnid = a_number()
        for _ in range(9):
            report(admin, pnid, success=False, rate_limited=True)
        report(admin, pnid, success=True)  # fecha o breaker, não o throttle
        assert check(admin, pnid) is None

        report(admin, pnid, success=False, rate_limited=True)
        report(admin, pnid, success=True)
        held = check(admin, pnid)

        assert held is not None
        reason, retry_after = held
        assert reason == "throttled"
        assert 55 <= retry_after.total_seconds() <= 60

    def test_the_ladder_climbs_at_twenty_and_at_fifty(self, admin: psycopg.Connection) -> None:
        pnid = a_number()
        seen = 0
        for threshold, window in THROTTLE_STEPS:
            while seen < threshold:
                report(admin, pnid, success=False, rate_limited=True)
                seen += 1
            report(admin, pnid, success=True)  # o breaker sai da frente
            reason, retry_after = check(admin, pnid)
            assert reason == "throttled"
            assert window - 5 <= retry_after.total_seconds() <= window

    def test_a_failure_that_is_not_excess_never_throttles(
        self, admin: psycopg.Connection
    ) -> None:
        """Cinquenta 503 abrem o breaker — e não devem throttlar o número por
        dez minutos. Quem não sinalizou excesso não gastou limite nenhum."""
        pnid = a_number()
        for _ in range(50):
            report(admin, pnid, success=False, rate_limited=False)
        assert check(admin, pnid)[0] == "circuit_open"

        expire_window(admin, pnid, "open_until")
        report(admin, pnid, success=True)
        assert check(admin, pnid) is None

    def test_plain_failures_do_not_inflate_the_excess_counter(
        self, admin: psycopg.Connection
    ) -> None:
        """A guarda tem DUAS metades e a suíte só provava uma.

        A escada não dispara sem sinal de excesso — isso o teste acima prende.
        Falta o contador: se uma falha comum o incrementasse, 9 sinais de
        excesso mais uma pilha de 503 e um último excesso saltariam direto para
        o 3º degrau, e o número ficaria dez minutos calado por erros que não
        gastaram limite nenhum. Nove, quarenta e cinco, um: o desfecho certo é
        o PRIMEIRO degrau.
        """
        pnid = a_number()
        for _ in range(9):
            report(admin, pnid, success=False, rate_limited=True)
        for _ in range(45):
            report(admin, pnid, success=False, rate_limited=False)
        report(admin, pnid, success=False, rate_limited=True)
        report(admin, pnid, success=True)  # o breaker sai da frente

        reason, retry_after = check(admin, pnid)
        assert reason == "throttled"
        assert 55 <= retry_after.total_seconds() <= 60

    def test_a_plain_failure_does_not_renew_an_expired_throttle(
        self, admin: psycopg.Connection
    ) -> None:
        """A terceira metade: passada a janela, um 503 não pode recarregá-la.

        O contador do dia continua acima do degrau — é assim que o TS funciona,
        a contagem é diária. Se a escada fosse consultada em toda falha em vez
        de só nas de excesso, qualquer erro comum devolveria o número ao
        silêncio pela janela inteira, para sempre, até a virada do dia.
        """
        pnid = a_number()
        for _ in range(10):
            report(admin, pnid, success=False, rate_limited=True)
        expire_window(admin, pnid, "throttled_until")
        report(admin, pnid, success=True)  # fecha o breaker
        assert check(admin, pnid) is None

        report(admin, pnid, success=False, rate_limited=False)
        report(admin, pnid, success=True)
        assert check(admin, pnid) is None

    def test_yesterdays_errors_do_not_count_for_todays_step(
        self, admin: psycopg.Connection
    ) -> None:
        """O contador do TS é por DIA CORRIDO (chave `wa:errors:{id}:{dia}`,
        `rate-limiter.ts:595`), com o dia em UTC. Replicado, não corrigido: uma
        janela deslizante seria melhor NOS DOIS, e divergir de um lado só cria
        divergência nova."""
        pnid = a_number()
        for _ in range(9):
            report(admin, pnid, success=False, rate_limited=True)
        admin.execute(
            "update internal.whatsapp_send_guard"
            " set error_day = error_day - 1 where phone_number_id = %s",
            (pnid,),
        )

        report(admin, pnid, success=False, rate_limited=True)  # o 1º de hoje
        report(admin, pnid, success=True)
        assert check(admin, pnid) is None

    def test_the_day_is_utc_whatever_the_session_timezone_says(
        self, admin: psycopg.Connection
    ) -> None:
        """`toISOString()` corta em UTC (`rate-limiter.ts:726`). Um
        `current_date` cru cortaria no fuso da SESSÃO, e os dois motores
        virariam o dia em horas diferentes no mesmo número.

        O banco de teste roda em UTC, então comparar com `(now() at time zone
        'utc')` seria comparar a expressão consigo mesma — verde com
        `current_date` também. Por isso a sessão é empurrada para um fuso em
        que a data local é comprovadamente OUTRA: com o relógio UTC na segunda
        metade do dia, UTC+14 já virou; na primeira, UTC-11 ainda não chegou.
        Determinístico a qualquer hora, e é o `current_date` que ele mata.
        """
        utc_now = admin.execute("select now() at time zone 'utc'").fetchone()[0]
        far_away = "Pacific/Kiritimati" if utc_now.hour >= 12 else "Pacific/Midway"

        pnid = a_number()
        admin.execute(f"set timezone to '{far_away}'")
        try:
            local_day, utc_day = admin.execute(
                "select current_date, (now() at time zone 'utc')::date"
            ).fetchone()
            # Se este assert cair, o fuso escolhido não separa os dias e o
            # teste voltaria a ser vazio — melhor falhar aqui, dizendo isso.
            assert local_day != utc_day, f"{far_away} não separa o dia de {utc_now}"

            report(admin, pnid, success=False, rate_limited=True)
        finally:
            admin.execute("set timezone to 'UTC'")

        stored = admin.execute(
            "select error_day from internal.whatsapp_send_guard where phone_number_id = %s",
            (pnid,),
        ).fetchone()[0]
        assert stored == utc_day

    def test_the_open_breaker_is_the_reason_reported_first(
        self, admin: psycopg.Connection
    ) -> None:
        """Ordem do TS (`send-guard.ts:130-145`): o breaker é consultado antes
        do limiter. Com os dois segurando, o motivo que a operação lê é o que
        aconteceu primeiro na cascata."""
        pnid = a_number()
        for _ in range(10):
            report(admin, pnid, success=False, rate_limited=True)

        assert check(admin, pnid)[0] == "circuit_open"


class TestTheDoorIsShut:
    def test_the_sender_role_may_ask_and_report(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A metade que o resto do arquivo não prova: os grants existem para o
        papel que roda em produção. Sem isto a suíte inteira ficaria verde num
        banco onde o sender não alcança nem uma das duas funções."""
        pnid = a_number()
        with as_app_role(dsn, "sender_role", two_tenants.a.id) as sender:
            for _ in range(FAILURE_THRESHOLD):
                report(sender, pnid, success=False)
            assert check(sender, pnid)[0] == "circuit_open"

    def test_the_data_api_roles_cannot_reach_the_guard_state(self, dsn: str) -> None:
        """A tabela mora em `internal` como a outbox — fora do schema exposto
        por HTTP, sem grant para papel nenhum da Data API."""
        for role in ("anon", "authenticated", "service_role"):
            with psycopg.connect(dsn) as conn, conn.cursor() as cur:
                cur.execute(f"set role {role}")
                try:
                    cur.execute("select 1 from internal.whatsapp_send_guard limit 1")
                except psycopg.errors.InsufficientPrivilege:
                    continue
                raise AssertionError(f"{role} alcançou o estado do guard")
