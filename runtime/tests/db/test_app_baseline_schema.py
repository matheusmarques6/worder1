"""App prerequisites: protects replay RED 42P01 at public.email_sends.

The first failure was recorded before this migration by the disposable replay
guardian. Collection is offline; executing these assertions requires real PG.
"""

import hashlib

import psycopg
import pytest

from tests.db.conftest import as_authenticated_user

RELATIONS = (
    "organization_members", "pipelines", "pipeline_stages",
    "automations", "automation_runs",
    "email_campaigns", "whatsapp_campaigns", "sms_campaigns",
    "email_sends", "whatsapp_sends", "sms_sends",
)


def column_contract(admin, table, column):
    return admin.execute(
        """select data_type, udt_name, is_nullable, column_default
             from information_schema.columns
            where table_schema='public' and table_name=%s and column_name=%s""",
        (table, column),
    ).fetchone()


def constraint_definitions(admin, table):
    return dict(admin.execute(
        """select conname, pg_get_constraintdef(oid, true)
             from pg_constraint
            where conrelid=to_regclass(%s)
            order by conname""",
        (f"public.{table}",),
    ).fetchall())


# Literal expectations from the reviewed readers/writers, not introspection.
# Each group is (table, columns, PostgreSQL type, nullable, default).
# UUID store/flow/run links that had no FK in the sources remain loose links.
COLUMN_GROUPS = (
    ("organization_members", "id", "uuid", False, "uuid_generate_v4()"),
    ("organization_members", "organization_id", "uuid", False, None),
    ("organization_members", "user_id invited_by", "uuid", True, None),
    ("organization_members", "role", "user_role", True, "'member'::user_role"),
    ("organization_members", "email name", "text", True, None),
    ("organization_members", "status", "text", True, "'active'::text"),
    ("organization_members", "invited_at created_at", "timestamp with time zone", True, "now()"),
    ("organization_members", "joined_at", "timestamp with time zone", True, None),
    ("pipelines", "id", "uuid", False, "uuid_generate_v4()"),
    ("pipelines", "organization_id", "uuid", False, None),
    ("pipelines", "store_id", "uuid", True, None),
    ("pipelines", "name", "text", False, None),
    ("pipelines", "description", "text", True, None),
    ("pipelines", "color", "text", True, "'#8b5cf6'::text"),
    ("pipelines", "position automation_rules_count", "integer", True, "0"),
    ("pipelines", "is_default has_active_automations", "boolean", True, "false"),
    ("pipelines", "created_at updated_at", "timestamp with time zone", True, "now()"),
    ("pipeline_stages", "id", "uuid", False, "uuid_generate_v4()"),
    ("pipeline_stages", "pipeline_id", "uuid", False, None),
    ("pipeline_stages", "name", "text", False, None),
    ("pipeline_stages", "color", "text", True, "'#8b5cf6'::text"),
    ("pipeline_stages", "position", "integer", False, "0"),
    ("pipeline_stages", "probability", "integer", True, "50"),
    ("pipeline_stages", "is_won is_lost", "boolean", True, "false"),
    ("pipeline_stages", "created_at", "timestamp with time zone", True, "now()"),
    ("automations", "id", "uuid", False, "uuid_generate_v4()"),
    ("automations", "organization_id", "uuid", False, None),
    ("automations", "store_id created_by", "uuid", True, None),
    ("automations", "name trigger_type", "text", False, None),
    ("automations", "description", "text", True, None),
    ("automations", "status", "text", True, "'draft'::text"),
    ("automations", "trigger_config", "jsonb", True, "'{}'::jsonb"),
    ("automations", "trigger_filters audience_filters exit_conditions nodes edges", "jsonb", True,
     "'[]'::jsonb"),
    ("automations", "frequency_config", "jsonb", True, "'{\"type\": \"once\"}'::jsonb"),
    ("automations", "total_runs successful_runs failed_runs conversions", "integer", True, "0"),
    ("automations", "total_revenue", "numeric(12,2)", True, "0"),
    ("automations", "attributed_revenue recipient_revenue", "numeric", True, "0"),
    ("automations", "last_run_at activated_at paused_at", "timestamp with time zone", True, None),
    ("automations", "created_at updated_at", "timestamp with time zone", True, "now()"),
    ("automation_runs", "id", "uuid", False, "uuid_generate_v4()"),
    ("automation_runs", "automation_id", "uuid", False, None),
    ("automation_runs", "organization_id contact_id deal_id trigger_event_id lock_token", "uuid",
     True, None),
    ("automation_runs", "status", "text", True, "'pending'::text"),
    ("automation_runs", "current_node_id trigger_type error_message error_node_id "
     "last_error locked_by",
     "text", True, None),
    ("automation_runs", "retry_count", "integer", True, "0"),
    ("automation_runs", "result node_results metadata trigger_data", "jsonb", True, "'{}'::jsonb"),
    ("automation_runs", "resume_data", "jsonb", True, None),
    ("automation_runs", "waiting_until completed_at locked_at last_heartbeat_at resume_at",
     "timestamp with time zone", True, None),
    ("automation_runs", "started_at created_at updated_at", "timestamp with time zone",
     True, "now()"),
    ("email_campaigns", "id", "uuid", False, "gen_random_uuid()"),
    ("email_campaigns", "organization_id", "uuid", False, None),
    ("email_campaigns", "store_id template_id list_id segment_id created_by", "uuid", True, None),
    ("email_campaigns", "name", "text", False, None),
    ("email_campaigns", "subject from_name from_email sender_name reply_to "
     "html_content text_content",
     "text", True, None),
    ("email_campaigns", "status", "text", True, "'draft'::text"),
    ("email_campaigns", "total_recipients total_sent total_delivered total_opened total_clicked "
     "total_bounced total_unsubscribed total_complained total_failed opens clicks bounces "
     "unsubscribes conversions", "integer", True, "0"),
    ("email_campaigns", "revenue attributed_revenue", "numeric(12,2)", True, "0"),
    ("email_campaigns", "recipient_revenue", "numeric", True, "0"),
    ("email_campaigns", "open_rate click_rate bounce_rate", "numeric(5,2)", True, "0"),
    ("email_campaigns", "settings metadata", "jsonb", True, "'{}'::jsonb"),
    ("email_campaigns", "scheduled_at sent_at completed_at", "timestamp with time zone",
     True, None),
    ("email_campaigns", "created_at updated_at", "timestamp with time zone", True, "now()"),
    ("email_campaigns", "timezone_mode", "text", False, "'fixed'::text"),
    ("whatsapp_campaigns", "id", "uuid", False, "gen_random_uuid()"),
    ("whatsapp_campaigns", "organization_id", "uuid", False, None),
    ("whatsapp_campaigns", "store_id instance_id template_id audience_segment_id "
     "audience_phonebook_id phonebook_id created_by updated_by", "uuid", True, None),
    ("whatsapp_campaigns", "name title campaign_id description template_name media_url media_type "
     "created_by_name", "text", True, None),
    ("whatsapp_campaigns", "type", "text", True, "'broadcast'::text"),
    ("whatsapp_campaigns", "status", "text", True, "'draft'::text"),
    ("whatsapp_campaigns", "template_language", "text", True, "'pt_BR'::text"),
    ("whatsapp_campaigns", "audience_type", "text", True, "'all'::text"),
    ("whatsapp_campaigns", "audience_tags", "text[]", True, None),
    ("whatsapp_campaigns", "template_variables audience_filters", "jsonb", True, "'{}'::jsonb"),
    ("whatsapp_campaigns", "body_variables button_variables", "jsonb", True, "'[]'::jsonb"),
    ("whatsapp_campaigns", "imported_contacts header_variable", "jsonb", True, None),
    ("whatsapp_campaigns", "timezone", "text", True, "'America/Sao_Paulo'::text"),
    ("whatsapp_campaigns", "messages_per_second", "integer", True, "10"),
    ("whatsapp_campaigns", "batch_size", "integer", True, "100"),
    ("whatsapp_campaigns", "delay_between_batches send_interval_ms", "integer", True, "1000"),
    ("whatsapp_campaigns", "audience_count total_recipients total_contacts "
     "total_sent total_delivered total_read total_clicked total_replied total_failed "
     "total_opted_out sent_count delivered_count "
     "read_count failed_count replied_count attributed_orders conversions", "integer", True, "0"),
    ("whatsapp_campaigns", "attribution_window_hours", "integer", True, "72"),
    ("whatsapp_campaigns", "revenue attributed_revenue total_cost", "numeric(12,2)", True, "0"),
    ("whatsapp_campaigns", "recipient_revenue", "numeric", True, "0"),
    ("whatsapp_campaigns", "cost_per_message", "numeric(6,4)", True, "0.05"),
    ("whatsapp_campaigns", "scheduled_at started_at completed_at paused_at",
     "timestamp with time zone", True, None),
    ("whatsapp_campaigns", "created_at updated_at", "timestamp with time zone", True, "now()"),
    ("sms_campaigns", "id", "uuid", False, "gen_random_uuid()"),
    ("sms_campaigns", "organization_id", "uuid", False, None),
    ("sms_campaigns", "store_id", "uuid", True, None),
    ("sms_campaigns", "name", "text", False, None),
    ("sms_campaigns", "status", "text", True, "'draft'::text"),
    ("sms_campaigns", "message_body", "text", True, None),
    ("sms_campaigns", "audience_count sent_count delivered_count failed_count "
     "replied_count conversions",
     "integer", True, "0"),
    ("sms_campaigns", "revenue", "numeric(12,2)", True, "0"),
    ("sms_campaigns", "attributed_revenue recipient_revenue", "numeric", True, "0"),
    ("sms_campaigns", "scheduled_at started_at completed_at", "timestamp with time zone",
     True, None),
    ("sms_campaigns", "created_at updated_at", "timestamp with time zone", False, "now()"),
    ("email_sends", "id", "uuid", False, "gen_random_uuid()"),
    ("email_sends", "organization_id", "uuid", False, None),
    ("email_sends", "campaign_id contact_id store_id automation_id automation_run_id flow_id "
     "email_template_id", "uuid", True, None),
    ("email_sends", "email", "text", False, None),
    ("email_sends", "to_email from_email sender_email subject provider resend_id "
     "provider_message_id dedupe_key node_id bounce_type bounce_message error_message "
     "ip_address user_agent order_id "
     "ab_variant isp_domain", "text", True, None),
    ("email_sends", "status", "text", True, "'queued'::text"),
    ("email_sends", "sent_at delivered_at opened_at mpp_opened_at clicked_at bounced_at failed_at "
     "unsubscribed_at complained_at converted_at", "timestamp with time zone", True, None),
    ("email_sends", "open_count click_count", "integer", True, "0"),
    ("email_sends", "conversion_value", "numeric(12,2)", True, "0"),
    ("email_sends", "metadata", "jsonb", True, "'{}'::jsonb"),
    ("email_sends", "created_at updated_at", "timestamp with time zone", True, "now()"),
    ("whatsapp_sends", "id", "uuid", False, "gen_random_uuid()"),
    ("whatsapp_sends", "organization_id", "uuid", False, None),
    ("whatsapp_sends", "contact_id campaign_id store_id automation_id automation_run_id flow_id",
     "uuid", True, None),
    ("whatsapp_sends", "phone_number", "text", False, None),
    ("whatsapp_sends", "node_id message_body template_name media_url error_message order_id "
     "external_message_id", "text", True, None),
    ("whatsapp_sends", "template_params", "jsonb", True, None),
    ("whatsapp_sends", "status", "text", False, "'pending'::text"),
    ("whatsapp_sends", "sent_at delivered_at read_at replied_at failed_at converted_at",
     "timestamp with time zone", True, None),
    ("whatsapp_sends", "conversion_value", "numeric(12,2)", True, "0"),
    ("whatsapp_sends", "metadata", "jsonb", True, "'{}'::jsonb"),
    ("whatsapp_sends", "created_at updated_at", "timestamp with time zone", False, "now()"),
    ("sms_sends", "id", "uuid", False, "gen_random_uuid()"),
    ("sms_sends", "organization_id", "uuid", False, None),
    ("sms_sends", "contact_id campaign_id store_id automation_id automation_run_id flow_id",
     "uuid", True, None),
    ("sms_sends", "phone_number", "text", False, None),
    ("sms_sends", "node_id error_message order_id external_message_id", "text", True, None),
    ("sms_sends", "message_body", "text", False, "''::text"),
    ("sms_sends", "status", "text", False, "'pending'::text"),
    ("sms_sends", "sent_at delivered_at clicked_at failed_at converted_at",
     "timestamp with time zone", True, None),
    ("sms_sends", "conversion_value", "numeric(12,2)", True, "0"),
    ("sms_sends", "metadata", "jsonb", True, "'{}'::jsonb"),
    ("sms_sends", "created_at updated_at", "timestamp with time zone", False, "now()"),
)

FOREIGN_KEYS = (
    ("organization_members", "organization_id", "organizations", "CASCADE"),
    ("organization_members", "user_id", "profiles", "CASCADE"),
    ("organization_members", "invited_by", "profiles", ""),
    ("pipelines", "organization_id", "organizations", "CASCADE"),
    ("pipeline_stages", "pipeline_id", "pipelines", "CASCADE"),
    ("automations", "organization_id", "organizations", "CASCADE"),
    ("automations", "created_by", "profiles", "SET NULL"),
    ("automation_runs", "automation_id", "automations", "CASCADE"),
    ("automation_runs", "contact_id", "contacts", "SET NULL"),
    ("email_campaigns", "organization_id", "organizations", "CASCADE"),
    ("whatsapp_campaigns", "organization_id", "organizations", "CASCADE"),
    ("whatsapp_campaigns", "template_id", "whatsapp_templates", ""),
    ("whatsapp_campaigns", "instance_id", "whatsapp_instances", ""),
    ("sms_campaigns", "organization_id", "organizations", "CASCADE"),
    ("email_sends", "organization_id", "organizations", "CASCADE"),
    ("email_sends", "campaign_id", "email_campaigns", "SET NULL"),
    ("email_sends", "contact_id", "contacts", "SET NULL"),
    ("whatsapp_sends", "organization_id", "organizations", "CASCADE"),
    ("whatsapp_sends", "campaign_id", "whatsapp_campaigns", "SET NULL"),
    ("whatsapp_sends", "contact_id", "contacts", "SET NULL"),
    ("sms_sends", "organization_id", "organizations", "CASCADE"),
    ("sms_sends", "campaign_id", "sms_campaigns", "SET NULL"),
    ("sms_sends", "contact_id", "contacts", "SET NULL"),
)

# The unions preserve both production and legacy writers; default is separate.
CHECK_VALUES = (
    ("automations", "status", ("draft", "active", "paused", "archived")),
    ("automation_runs", "status",
     ("pending", "waiting", "running", "completed", "failed", "cancelled")),
    ("email_campaigns", "status",
     ("draft", "scheduled", "sending", "sent", "paused", "cancelled", "failed")),
    ("email_campaigns", "timezone_mode", ("fixed", "recipient")),
    ("whatsapp_campaigns", "status",
     ("draft", "scheduled", "pending", "running", "sending", "sent", "completed", "paused",
      "cancelled", "failed", "PENDING", "SCHEDULED", "RUNNING", "SENDING", "SENT", "COMPLETED",
      "PAUSED", "CANCELLED", "FAILED")),
    ("email_sends", "status",
     ("queued", "pending", "sent", "delivered", "opened", "clicked", "bounced", "failed",
      "unsubscribed", "complained")),
    ("whatsapp_sends", "status", ("pending", "sent", "delivered", "read", "replied", "failed")),
    ("sms_sends", "status", ("pending", "sent", "delivered", "clicked", "failed", "undelivered")),
)

INDEXES = (
    ("pipeline_stages", ("pipeline_id", '"position"'), False, None),
    ("automation_runs", ("created_at",), False, "(status = 'pending'::text)"),
    ("automation_runs", ("waiting_until",), False, "(status = 'waiting'::text)"),
    ("email_sends", ("dedupe_key",), True, "(dedupe_key IS NOT NULL)"),
    ("email_sends", ("organization_id", "order_id"), True, "(order_id IS NOT NULL)"),
    ("whatsapp_sends", ("organization_id", "order_id"), True, "(order_id IS NOT NULL)"),
    ("sms_sends", ("organization_id", "order_id"), True, "(order_id IS NOT NULL)"),
    ("email_sends", ("store_id",), False, "(store_id IS NOT NULL)"),
    ("whatsapp_sends", ("store_id",), False, "(store_id IS NOT NULL)"),
    ("sms_sends", ("store_id",), False, "(store_id IS NOT NULL)"),
    ("email_campaigns", ("status", "scheduled_at"), False, "(status = 'scheduled'::text)"),
)

# Reviewed active definitions: normalize line endings and outer whitespace only.
# The literals include the pg_get_functiondef header: signature, defaults,
# return shape, volatility, security and search_path as well as the entire body.
# No expected value reads a migration, invokes the reader or writes a golden.
FUNCTIONS = (
    ("attribution_candidates", "uuid, uuid, timestamp with time zone, uuid, integer, integer, "
     "integer, boolean, boolean, text",
     "aa53f47dac5dd5d2b5605406aa11024275203d5868a9d40d0d75b723b767f8db"),
    ("attribute_order", "uuid, text, uuid, timestamp with time zone, numeric, numeric, text, uuid, "
     "integer, integer, integer, boolean, boolean, text",
     "d4f2b84261fc4c58b2bcbc7bb5dd07d71266a9700eca09715ff11c24fdb2312a"),
    ("refund_order_attribution", "uuid, text, numeric",
     "991c3286b50f383753c8de92cd4dcc187fee452ac52994bdaa9b702c03992ed5"),
    ("revoke_order_attribution", "uuid, text",
     "53a1ff90617ce3367cfe9a17677f9ef7e54395d7b432bb1b2a2946773ee272b0"),
    ("refresh_attribution_totals", "uuid",
     "23d4c90679e53d4d8798359e0ebf4fe4e7ab3cae1ef5486737a8e76f36d2b439"),
    ("automation_email_stats", "uuid, uuid, timestamp with time zone",
     "3a6e1228af81bdf7047747e319d7cdb292929bd4d0ddd64064698572efcd82c7"),
    ("campaign_email_stats", "uuid, uuid",
     "e0ae9c29e336f0a69d7f222c266727ef2647ee08d9e61f9f7a65b0f8b119cf29"),
    ("bump_email_send_open", "uuid, boolean",
     "3da0aa4b1e62191094f2aa6c0883c8cd78288a7b7695a3c61d4282bad5893c41"),
    ("bump_email_send_click", "uuid",
     "9b1abe0f38aa6de5be702cb69b37cab66b4af1c37c87503baf235efe83454f68"),
    ("get_user_organization_id", "",
     "75201ac93ee64426135de60415cbc8fe4eaeac23ff6488749037d23cafd9c3bc"),
    ("handle_new_user", "",
     "b332ee52c4b4810af7f8ebbb54f10aff9fd58f106de695089c87ea6969db60eb"),
)


def function_definition_digest(definition):
    definition = definition.replace("\r\n", "\n").replace("\r", "\n").strip()
    return hashlib.sha256(definition.encode()).hexdigest()


@pytest.mark.parametrize("original,changed", (
    ("SELECT 'Sales Pipeline';", "SELECT 'Sales  Pipeline';"),
    ("SELECT 1 WHERE true -- tenant filter\nAND false;",
     "SELECT 1 WHERE true -- tenant filter AND false;"),
))
def test_function_digest_preserves_sql_content(original, changed):
    assert function_definition_digest(original) != function_definition_digest(changed)


def scoped_catalog(admin):
    """Semantic catalog for fresh/upgrade equality; names/OIDs are not identity.

    Scope: all columns/constraints/non-constraint indexes/policies/table ACLs on
    the eleven relations; the directly associated active functions and their
    ACLs; non-internal triggers on these tables or invoking those functions.
    """
    tables = list(RELATIONS)
    functions = [name for name, _, _ in FUNCTIONS]
    rows = []
    # Stabilize PostgreSQL's schema qualification without changing database state.
    with admin.transaction():
        admin.execute("set local search_path = public, extensions")
        rows.extend(admin.execute(
            """select 'column', c.relname, a.attname,
                      format_type(a.atttypid, a.atttypmod), not a.attnotnull,
                      pg_get_expr(d.adbin, d.adrelid)
                 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 join pg_attribute a on a.attrelid=c.oid
                 left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
                where n.nspname='public' and c.relname=any(%s)
                  and a.attnum>0 and not a.attisdropped""", (tables,),
        ).fetchall())
        rows.extend(admin.execute(
            """select 'enum', t.typname,
                      (row_number() over (
                          partition by t.oid order by e.enumsortorder
                      ))::integer,
                      e.enumlabel
                 from pg_type t join pg_namespace n on n.oid=t.typnamespace
                 join pg_enum e on e.enumtypid=t.oid
                where n.nspname='public' and t.typname='user_role'""",
        ).fetchall())
        rows.extend(admin.execute(
            """select 'constraint', c.relname, pg_get_constraintdef(k.oid, true)
                 from pg_constraint k join pg_class c on c.oid=k.conrelid
                 join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname=any(%s)
                  and k.contype in ('p','f','u','c')""", (tables,),
        ).fetchall())
        for table, keys, unique, predicate, method, valid, ready, nulls, nkeys in admin.execute(
            """select c.relname,
                      array(select pg_get_indexdef(i.indexrelid, pos, true)
                              from generate_series(1,i.indnatts) pos),
                      i.indisunique, pg_get_expr(i.indpred,i.indrelid), am.amname,
                      i.indisvalid, i.indisready, i.indnullsnotdistinct, i.indnkeyatts
                 from pg_index i join pg_class c on c.oid=i.indrelid
                 join pg_namespace n on n.oid=c.relnamespace
                 join pg_class idx on idx.oid=i.indexrelid
                 join pg_am am on am.oid=idx.relam
                where n.nspname='public' and c.relname=any(%s)
                  and not exists(select 1 from pg_constraint k
                                 where k.conindid=i.indexrelid)""", (tables,),
        ).fetchall():
            rows.append(("index", table, tuple(keys), unique, predicate, method,
                         valid, ready, nulls, nkeys))
        rows.extend(admin.execute(
            """select 'rls', c.relname, c.relrowsecurity, c.relforcerowsecurity
                 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname=any(%s)""", (tables,),
        ).fetchall())
        for table, command, roles, permissive, qual, check in admin.execute(
            """select tablename, cmd, roles, permissive, qual, with_check from pg_policies
                where schemaname='public' and tablename=any(%s)""", (tables,),
        ).fetchall():
            rows.append(("policy", table, command, tuple(sorted(roles)), permissive,
                         " ".join(qual.split()) if qual else None,
                         " ".join(check.split()) if check else None))
        for name, signature, definer, config, definition in admin.execute(
            """select p.proname, oidvectortypes(p.proargtypes), p.prosecdef, p.proconfig,
                      pg_get_functiondef(p.oid)
                 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname=any(%s)""", (functions,),
        ).fetchall():
            digest = function_definition_digest(definition)
            rows.append(("function", "public", name, signature, definer,
                         tuple(sorted(config or ())), digest))
        for schema, table, definition, enabled in admin.execute(
            """select n.nspname, c.relname, pg_get_triggerdef(t.oid, true), t.tgenabled
                 from pg_trigger t join pg_class c on c.oid=t.tgrelid
                 join pg_namespace n on n.oid=c.relnamespace
                 join pg_proc p on p.oid=t.tgfoid
                 join pg_namespace pn on pn.oid=p.pronamespace
                where not t.tgisinternal and
                      ((n.nspname='public' and c.relname=any(%s))
                       or (pn.nspname='public' and p.proname=any(%s)))""",
            (tables, functions),
        ).fetchall():
            rows.append(("trigger", schema, table, " ".join(definition.split()), enabled))
        rows.extend(admin.execute(
            """select 'table_acl', c.relname,
                      case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
                      pg_get_userbyid(a.grantor), a.privilege_type, a.is_grantable
                 from pg_class c join pg_namespace n on n.oid=c.relnamespace,
                      lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
                where n.nspname='public' and c.relname=any(%s)""", (tables,),
        ).fetchall())
        rows.extend(admin.execute(
            """select 'function_acl', p.proname, oidvectortypes(p.proargtypes),
                      case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
                      pg_get_userbyid(a.grantor), a.privilege_type, a.is_grantable
                 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
                      lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
                where n.nspname='public' and p.proname=any(%s)""", (functions,),
        ).fetchall())
    return tuple(sorted(rows, key=repr))


def expected_scoped_catalog():
    """Expand immutable, source-reviewed expectations; never introspect here."""
    rows = [
        ("column", table, column, pg_type, nullable, default)
        for table, columns, pg_type, nullable, default in COLUMN_GROUPS
        for column in columns.split()
    ]
    rows.extend(("enum", "user_role", order, role) for order, role in (
        (1, "owner"), (2, "admin"), (3, "member"), (4, "agent"), (5, "analyst"),
    ))
    rows.extend(("constraint", table, "PRIMARY KEY (id)") for table in RELATIONS)
    rows.append(("constraint", "organization_members", "UNIQUE (organization_id, user_id)"))
    for table, column, target, delete in FOREIGN_KEYS:
        definition = f"FOREIGN KEY ({column}) REFERENCES {target}(id)"
        if delete:
            definition += f" ON DELETE {delete}"
        rows.append(("constraint", table, definition))
    for table, column, values in CHECK_VALUES:
        array = ", ".join(f"'{value}'::text" for value in values)
        rows.append(("constraint", table, f"CHECK ({column} = ANY (ARRAY[{array}]))"))
    rows.extend(("index", *index, "btree", True, True, False, len(index[1])) for index in INDEXES)
    rows.extend(("rls", table, True, False) for table in RELATIONS)
    for table in RELATIONS:
        if table != "pipeline_stages":
            pred = "(organization_id = get_user_organization_id())"
            rows.append(("policy", table, "ALL", ("authenticated",), "PERMISSIVE", pred, pred))
    pred = ("(store_id IN ( SELECT s.id FROM shopify_stores s "
            "WHERE (s.organization_id = get_user_organization_id())))")
    rows.append(("policy", "pipelines", "ALL", ("authenticated",), "PERMISSIVE", pred, pred))
    pred = ("(EXISTS ( SELECT 1 FROM pipelines p "
            "WHERE ((p.id)::text = (pipeline_stages.pipeline_id)::text)))")
    rows.append(("policy", "pipeline_stages", "ALL", ("authenticated",), "PERMISSIVE", pred, pred))
    for name, signature, digest in FUNCTIONS:
        rows.append(("function", "public", name, signature, True, ("search_path=public",), digest))
        roles = ("postgres", "service_role")
        if name == "get_user_organization_id":
            roles += ("anon", "authenticated")
        for role in roles:
            rows.append(("function_acl", name, signature, role, "postgres", "EXECUTE", False))
    # Supabase's public-schema defaults, retained by the active RLS migrations.
    for table in RELATIONS:
        for role in ("postgres", "anon", "authenticated", "service_role"):
            for privilege in ("INSERT", "SELECT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES",
                              "TRIGGER", "MAINTAIN"):
                rows.append(("table_acl", table, role, "postgres", privilege, False))
    # Final auth attachment is owned by Task 5, after the prerequisite replay.
    rows.append(("trigger", "auth", "users",
                 "CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users "
                 "FOR EACH ROW EXECUTE FUNCTION handle_new_user()", "O"))
    return tuple(sorted(rows, key=repr))


def test_app_baseline_scoped_catalog(admin):
    assert scoped_catalog(admin) == expected_scoped_catalog()


@pytest.mark.parametrize("table,columns,pg_type,nullable,default", COLUMN_GROUPS)
def test_app_baseline_columns(admin, table, columns, pg_type, nullable, default):
    with admin.transaction():
        admin.execute("set local search_path = public, extensions")
        for column in columns.split():
            assert admin.execute(
                """select format_type(a.atttypid, a.atttypmod), not a.attnotnull,
                          pg_get_expr(d.adbin, d.adrelid)
                     from pg_attribute a
                     left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
                    where a.attrelid=to_regclass(%s) and a.attname=%s and not a.attisdropped""",
                (f"public.{table}", column),
            ).fetchone() == (pg_type, nullable, default), (table, column)


@pytest.mark.parametrize("table", RELATIONS)
def test_app_baseline_relations_exist(admin, table):
    assert admin.execute(
        "select to_regclass(%s)", (f"public.{table}",)
    ).fetchone()[0] == table


def test_product_feeds_final_contract(admin):
    """Fails if either replay history omits the reviewed product-feeds base."""
    expected_columns = {
        "id": ("uuid", "uuid", "NO", "gen_random_uuid()"),
        "organization_id": ("uuid", "uuid", "NO", None),
        "name": ("text", "text", "NO", None),
        "feed_type": ("text", "text", "NO", "'bestsellers'::text"),
        "time_period": ("text", "text", "YES", "'30d'::text"),
        "filters": ("jsonb", "jsonb", "YES", "'[]'::jsonb"),
        "max_products": ("integer", "int4", "YES", "4"),
        "layout": ("text", "text", "YES", "'2x2'::text"),
        "show_price": ("boolean", "bool", "YES", "true"),
        "show_compare_price": ("boolean", "bool", "YES", "true"),
        "show_button": ("boolean", "bool", "YES", "true"),
        "button_text": ("text", "text", "YES", "'Comprar'::text"),
        "created_at": ("timestamp with time zone", "timestamptz", "YES", "now()"),
        "updated_at": ("timestamp with time zone", "timestamptz", "YES", "now()"),
        "store_id": ("uuid", "uuid", "YES", None),
        "excluded_product_ids": ("ARRAY", "_text", "NO", "'{}'::text[]"),
    }
    with admin.transaction():
        admin.execute("set local search_path = public, extensions")
        relation = admin.execute(
            "select to_regclass('public.product_feeds')"
        ).fetchone()[0]
        assert relation == "product_feeds"
        columns = {row[0]: row[1:] for row in admin.execute(
            """select column_name, data_type, udt_name, is_nullable, column_default
                 from information_schema.columns
                where table_schema='public' and table_name='product_feeds'"""
        ).fetchall()}
        assert columns == expected_columns
        assert admin.execute(
            """select relrowsecurity, relforcerowsecurity
                 from pg_class where oid='public.product_feeds'::regclass"""
        ).fetchone() == (True, False)
        policy = admin.execute(
            """select cmd, roles, permissive,
                      regexp_replace(
                        regexp_replace(qual, 'profiles\\.', '', 'g'), '\\s+', '', 'g'
                      ),
                      regexp_replace(
                        regexp_replace(
                          coalesce(with_check, qual), 'profiles\\.', '', 'g'
                        ), '\\s+', '', 'g'
                      )
                 from pg_policies
                where schemaname='public' and tablename='product_feeds'
                  and policyname='Users can manage their org product_feeds'"""
        ).fetchone()
        assert policy == (
            "ALL", ["public"], "PERMISSIVE",
            "(organization_idIN(SELECTorganization_idFROMprofilesWHERE(id=auth.uid())))",
            "(organization_idIN(SELECTorganization_idFROMprofilesWHERE(id=auth.uid())))",
        )
        indexes = dict(admin.execute(
            """select indexname, indexdef from pg_indexes
                 where schemaname='public' and tablename='product_feeds'
                   and indexname in ('idx_product_feeds_org', 'idx_product_feeds_store')"""
        ).fetchall())
        assert indexes == {
            "idx_product_feeds_org": (
                "CREATE INDEX idx_product_feeds_org ON public.product_feeds "
                "USING btree (organization_id)"
            ),
            "idx_product_feeds_store": (
                "CREATE INDEX idx_product_feeds_store ON public.product_feeds "
                "USING btree (store_id)"
            ),
        }


# Replay prerequisites consumed unconditionally after the app bootstrap. They
# stay outside RELATIONS so the reviewed eleven-table catalog remains stable.
REPLAY_DEPENDENCY_RELATIONS = (
    "shopify_products", "api_keys", "email_templates", "deals", "deal_activities",
    "events", "pipeline_stage_transitions", "email_clicks", "automation_executions",
    "automation_versions", "automation_run_steps", "automation_pending_steps",
    "whatsapp_campaign_recipients",
)

REPLAY_DEPENDENCY_COLUMN_GROUPS = (
    ("shopify_products", "id", "uuid", False, "uuid_generate_v4()"),
    ("shopify_products", "store_id organization_id", "uuid", False, None),
    ("shopify_products", "shopify_product_id title", "text", False, None),
    ("shopify_products", "handle product_type vendor description body_html sku barcode image_url",
     "text", True, None),
    ("shopify_products", "status", "text", True, "'active'::text"),
    ("shopify_products", "price cost_per_item", "numeric(12,2)", True, "0"),
    ("shopify_products", "compare_at_price", "numeric(12,2)", True, None),
    ("shopify_products", "inventory_quantity", "integer", True, "0"),
    ("shopify_products", "images variants collections", "jsonb", True, "'[]'::jsonb"),
    ("shopify_products", "created_at updated_at", "timestamp with time zone", True, "now()"),
    ("shopify_products", "published_at", "timestamp with time zone", True, None),
    ("shopify_products", "hidden_from_feeds", "boolean", False, "false"),
    ("shopify_products", "available", "boolean", True, None),
    ("api_keys", "id", "uuid", False, "uuid_generate_v4()"),
    ("api_keys", "organization_id", "uuid", False, None),
    ("api_keys", "created_by user_id", "uuid", True, None),
    ("api_keys", "name", "text", False, None),
    ("api_keys", "key key_hash key_prefix", "text", True, None),
    ("api_keys", "permissions", "text[]", True, "'{}'::text[]"),
    ("api_keys", "expires_at last_used_at", "timestamp with time zone", True, None),
    ("api_keys", "created_at", "timestamp with time zone", True, "now()"),
    ("api_keys", "is_active", "boolean", True, "true"),
    ("email_templates", "id", "uuid", False, "gen_random_uuid()"),
    ("email_templates", "organization_id", "uuid", False, None),
    ("email_templates", "store_id", "uuid", True, None),
    ("email_templates", "name", "text", False, None),
    ("email_templates", "editor_type", "text", False, "'visual'::text"),
    ("email_templates", "description html thumbnail_url", "text", True, None),
    ("email_templates", "category", "text", True, "'custom'::text"),
    ("email_templates", "design_json design", "jsonb", True, None),
    ("email_templates", "is_prebuilt", "boolean", True, "false"),
    ("email_templates", "is_active", "boolean", True, "true"),
    ("email_templates", "created_at updated_at", "timestamp with time zone", True, "now()"),
    ("deals", "id", "uuid", False, "uuid_generate_v4()"),
    ("deals", "organization_id pipeline_id", "uuid", False, None),
    ("deals", "store_id stage_id contact_id assigned_to", "uuid", True, None),
    ("deals", "contact_phone", "character varying(50)", True, None),
    ("deals", "contact_name contact_email", "character varying(255)", True, None),
    ("deals", "title", "text", False, None),
    ("deals", "currency", "text", True, "'BRL'::text"),
    ("deals", "status", "text", True, "'open'::text"),
    ("deals", "value", "numeric(12,2)", True, "0"),
    ("deals", "probability", "integer", True, "50"),
    ("deals", "position", "integer", True, "0"),
    ("deals", "tags", "text[]", True, "'{}'::text[]"),
    ("deals", "custom_fields", "jsonb", True, "'{}'::jsonb"),
    ("deals", "expected_close_date", "date", True, None),
    ("deals", "won_at lost_at", "timestamp with time zone", True, None),
    ("deals", "lost_reason notes", "text", True, None),
    ("deals", "created_at updated_at", "timestamp with time zone", True, "now()"),
    ("deal_activities", "id", "uuid", False, "gen_random_uuid()"),
    ("deal_activities", "organization_id deal_id", "uuid", False, None),
    ("deal_activities", "store_id contact_id user_id", "uuid", True, None),
    ("deal_activities", "activity_type", "text", False, None),
    ("deal_activities", "title description", "text", True, None),
    ("deal_activities", "metadata", "jsonb", True, "'{}'::jsonb"),
    ("deal_activities", "is_pinned", "boolean", True, "false"),
    ("deal_activities", "due_at completed_at", "timestamp with time zone", True, None),
    ("deal_activities", "created_at updated_at", "timestamp with time zone", True, "now()"),
    ("events", "id", "uuid", False, "gen_random_uuid()"),
    ("events", "store_id", "uuid", True, None),
    ("pipeline_stage_transitions", "id", "uuid", False, "uuid_generate_v4()"),
    ("pipeline_stage_transitions", "organization_id pipeline_id to_stage_id", "uuid", False,
     None),
    ("pipeline_stage_transitions", "store_id from_stage_id", "uuid", True, None),
    ("pipeline_stage_transitions", "source_type trigger_event", "text", False, None),
    ("pipeline_stage_transitions", "name description", "text", True, None),
    ("pipeline_stage_transitions", "filters", "jsonb", True, "'{}'::jsonb"),
    ("pipeline_stage_transitions", "is_enabled", "boolean", True, "true"),
    ("pipeline_stage_transitions", "mark_as_won mark_as_lost", "boolean", True, "false"),
    ("pipeline_stage_transitions", "position transitions_count", "integer", True, "0"),
    ("pipeline_stage_transitions", "last_triggered_at", "timestamp with time zone", True,
     None),
    ("pipeline_stage_transitions", "created_at updated_at", "timestamp with time zone", True,
     "now()"),
    ("email_clicks", "id", "uuid", False, "gen_random_uuid()"),
    ("email_clicks", "email_send_id", "uuid", False, None),
    ("email_clicks", "url", "text", False, None),
    ("email_clicks", "clicked_at", "timestamp with time zone", True, "now()"),
    ("email_clicks", "user_agent ip_address", "text", True, None),
    ("automation_executions", "id", "character varying(100)", False, None),
    ("automation_executions", "automation_id", "uuid", False, None),
    ("automation_executions", "organization_id contact_id deal_id", "uuid", True, None),
    ("automation_executions", "status", "character varying(20)", False,
     "'running'::character varying"),
    ("automation_executions", "trigger_type error_node_id", "character varying(100)", True,
     None),
    ("automation_executions", "retry_of", "character varying(100)", True, None),
    ("automation_executions", "trigger_data final_context resume_data", "jsonb", True, None),
    ("automation_executions", "node_results", "jsonb", True, "'{}'::jsonb"),
    ("automation_executions", "error_message", "text", True, None),
    ("automation_executions", "duration_ms", "integer", True, None),
    ("automation_executions", "retry_count", "integer", True, "0"),
    ("automation_executions", "started_at", "timestamp with time zone", False, "now()"),
    ("automation_executions", "completed_at wait_till", "timestamp with time zone", True, None),
    ("automation_executions", "created_at", "timestamp with time zone", True, "now()"),
    ("automation_versions", "id", "uuid", False, "gen_random_uuid()"),
    ("automation_versions", "automation_id", "uuid", False, None),
    ("automation_versions", "version", "integer", False, None),
    ("automation_versions", "nodes edges", "jsonb", False, None),
    ("automation_versions", "settings", "jsonb", True, None),
    ("automation_versions", "change_note", "text", True, None),
    ("automation_versions", "created_by", "uuid", True, None),
    ("automation_versions", "created_at", "timestamp with time zone", True, "now()"),
    ("automation_run_steps", "id", "uuid", False, "gen_random_uuid()"),
    ("automation_run_steps", "run_id", "uuid", False, None),
    ("automation_run_steps", "node_id node_type", "text", False, None),
    ("automation_run_steps", "node_label", "text", True, None),
    ("automation_run_steps", "status", "text", False, "'pending'::text"),
    ("automation_run_steps", "input_data output_data config_used variables_resolved", "jsonb",
     True, "'{}'::jsonb"),
    ("automation_run_steps", "error_details", "jsonb", True, None),
    ("automation_run_steps", "error_message", "text", True, None),
    ("automation_run_steps", "duration_ms", "integer", True, None),
    ("automation_run_steps", "step_order", "integer", False, "0"),
    ("automation_run_steps", "started_at completed_at", "timestamp with time zone", True, None),
    ("automation_run_steps", "created_at", "timestamp with time zone", True, "now()"),
    ("automation_pending_steps", "id", "uuid", False, "uuid_generate_v4()"),
    ("automation_pending_steps", "run_id", "uuid", False, None),
    ("automation_pending_steps", "node_id", "text", False, None),
    ("automation_pending_steps", "scheduled_for", "timestamp with time zone", False, None),
    ("automation_pending_steps", "context", "jsonb", True, "'{}'::jsonb"),
    ("automation_pending_steps", "status", "text", True, "'pending'::text"),
    ("automation_pending_steps", "qstash_message_id locked_by", "text", True, None),
    ("automation_pending_steps", "lock_token", "uuid", True, None),
    ("automation_pending_steps", "locked_at", "timestamp with time zone", True, None),
    ("automation_pending_steps", "created_at", "timestamp with time zone", True, "now()"),
    ("whatsapp_campaign_recipients", "id", "uuid", False, "gen_random_uuid()"),
    ("whatsapp_campaign_recipients", "contact_id message_id", "uuid", True, None),
    ("whatsapp_campaign_recipients", "phone_number", "character varying(20)", False, None),
    ("whatsapp_campaign_recipients", "contact_name meta_message_id conversion_order_id",
     "character varying(255)", True, None),
    ("whatsapp_campaign_recipients", "error_code", "character varying(50)", True, None),
    ("whatsapp_campaign_recipients", "error_message", "text", True, None),
    ("whatsapp_campaign_recipients", "status", "character varying(20)", True,
     "'pending'::character varying"),
    ("whatsapp_campaign_recipients", "retry_count", "integer", True, "0"),
    ("whatsapp_campaign_recipients", "resolved_variables", "jsonb", True, "'{}'::jsonb"),
    ("whatsapp_campaign_recipients", "conversion_value", "numeric(12,2)", True, None),
    ("whatsapp_campaign_recipients", "queued_at sending_at sent_at delivered_at read_at "
     "clicked_at replied_at failed_at opted_out_at", "timestamp with time zone", True, None),
    ("whatsapp_campaign_recipients", "created_at", "timestamp with time zone", True, "now()"),
    ("whatsapp_campaign_recipients", "converted_at", "timestamp with time zone", True, None),
)

REPLAY_DEPENDENCY_FOREIGN_KEYS = (
    ("shopify_products", "store_id", "shopify_stores", "CASCADE"),
    ("shopify_products", "organization_id", "organizations", "CASCADE"),
    ("api_keys", "organization_id", "organizations", "CASCADE"),
    ("api_keys", "created_by", "profiles", "SET NULL"),
    ("deals", "organization_id", "organizations", "CASCADE"),
    ("deals", "pipeline_id", "pipelines", "CASCADE"),
    ("deals", "stage_id", "pipeline_stages", "SET NULL"),
    ("deals", "contact_id", "contacts", "SET NULL"),
    ("deals", "assigned_to", "profiles", "SET NULL"),
    ("deal_activities", "deal_id", "deals", "CASCADE"),
    ("pipeline_stage_transitions", "organization_id", "organizations", "CASCADE"),
    ("pipeline_stage_transitions", "pipeline_id", "pipelines", "CASCADE"),
    ("pipeline_stage_transitions", "from_stage_id", "pipeline_stages", "CASCADE"),
    ("pipeline_stage_transitions", "to_stage_id", "pipeline_stages", "CASCADE"),
    ("email_clicks", "email_send_id", "email_sends", "CASCADE"),
    ("automation_executions", "automation_id", "automations", "CASCADE"),
    ("automation_executions", "organization_id", "organizations", "CASCADE"),
    ("automation_executions", "contact_id", "contacts", "SET NULL"),
    ("automation_executions", "deal_id", "deals", "SET NULL"),
    ("automation_versions", "automation_id", "automations", "CASCADE"),
    ("automation_versions", "created_by", "auth.users", None),
    ("automation_run_steps", "run_id", "automation_runs", "CASCADE"),
    ("automation_pending_steps", "run_id", "automation_runs", "CASCADE"),
)

REPLAY_DEPENDENCY_INDEXES = {
    "shopify_products": {
        "idx_shopify_products_store": "(store_id)",
        "idx_shopify_products_sku": "(sku)",
        "idx_shopify_products_org": "(organization_id)",
        "idx_shopify_products_feed_visible": "(store_id) WHERE (hidden_from_feeds = false)",
    },
    "api_keys": {"api_keys_prefix_idx": "(key_prefix) WHERE is_active"},
    "email_templates": {
        "idx_email_templates_org": "(organization_id)",
        "idx_email_templates_store": "(store_id) WHERE (store_id IS NOT NULL)",
        "email_templates_editor_type_idx": "(organization_id, editor_type)",
    },
    "deals": {
        "idx_deals_org": "(organization_id)",
        "idx_deals_store": "(store_id)",
        "idx_deals_pipeline": "(pipeline_id)",
        "idx_deals_stage": "(stage_id)",
        "idx_deals_contact": "(contact_id)",
        "idx_deals_status": "(status)",
    },
    "deal_activities": {
        "deal_activities_deal_idx": "(deal_id, created_at DESC)",
        "deal_activities_org_idx": "(organization_id, created_at DESC)",
        "deal_activities_contact_idx": "(contact_id) WHERE (contact_id IS NOT NULL)",
    },
    "pipeline_stage_transitions": {
        "idx_stage_transitions_org": "(organization_id)",
        "idx_stage_transitions_pipeline": "(pipeline_id)",
        "idx_stage_transitions_source": "(source_type, trigger_event)",
        "idx_stage_transitions_enabled": (
            "(organization_id, source_type, trigger_event) WHERE (is_enabled = true)"
        ),
    },
    "email_clicks": {
        "idx_email_clicks_send": "(email_send_id)",
        "idx_email_clicks_at": "(clicked_at)",
    },
    "automation_executions": {
        "idx_automation_executions_automation": "(automation_id)",
        "idx_automation_executions_org": "(organization_id)",
        "idx_automation_executions_status": "(status)",
        "idx_automation_executions_started": "(started_at DESC)",
        "idx_automation_executions_contact": "(contact_id)",
        "idx_automation_executions_waiting": (
            "(wait_till) WHERE ((status)::text = 'waiting'::text)"
        ),
    },
    "automation_versions": {
        "idx_automation_versions_automation": "(automation_id)",
    },
    "automation_run_steps": {
        "idx_run_steps_run": "(run_id)",
        "idx_run_steps_status": "(status)",
    },
    "automation_pending_steps": {
        "idx_pending_steps_scheduled": "(scheduled_for)",
        "idx_pending_steps_status": "(status)",
        "idx_pending_steps_run": "(run_id)",
        "automation_pending_steps_locked_idx": "(locked_at) WHERE (lock_token IS NOT NULL)",
    },
    "whatsapp_campaign_recipients": {
        "idx_recipients_campaign": "(campaign_id)",
        "idx_recipients_status": "(status)",
        "idx_recipients_meta_msg": "(meta_message_id)",
        "idx_wcr_stuck_sending": "(sending_at) WHERE ((status)::text = 'sending'::text)",
    },
}

REPLAY_DEPENDENCY_CONSTRAINTS = {
    "shopify_products": {"UNIQUE (store_id, shopify_product_id)"},
    "email_templates": {
        "CHECK (editor_type = ANY (ARRAY['visual'::text, 'text'::text]))",
    },
    "deals": {
        "CHECK (probability >= 0 AND probability <= 100)",
        "CHECK (status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text]))",
    },
    "deal_activities": {
        "CHECK (activity_type = ANY (ARRAY['note'::text, 'call'::text, 'email'::text, "
        "'meeting'::text, 'task'::text, 'stage_change'::text, 'value_change'::text, "
        "'custom'::text]))",
    },
    "automation_executions": {
        "CHECK (status::text = ANY (ARRAY['running'::character varying, "
        "'success'::character varying, 'error'::character varying, 'waiting'::character "
        "varying, 'cancelled'::character varying]::text[]))",
    },
    "automation_versions": {"UNIQUE (automation_id, version)"},
    "automation_run_steps": {
        "CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'success'::text, "
        "'error'::text, 'skipped'::text]))",
    },
    "automation_pending_steps": {
        "CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, "
        "'cancelled'::text]))",
    },
    "whatsapp_campaign_recipients": {
        "CHECK (status::text = ANY (ARRAY['pending'::character varying, "
        "'queued'::character varying, 'sending'::character varying, 'sent'::character varying, "
        "'delivered'::character varying, 'read'::character varying, 'clicked'::character "
        "varying, 'replied'::character varying, 'failed'::character varying, "
        "'skipped'::character varying]::text[]))",
    },
}


@pytest.mark.parametrize("table,columns,pg_type,nullable,default",
                         REPLAY_DEPENDENCY_COLUMN_GROUPS)
def test_replay_dependency_columns(admin, table, columns, pg_type, nullable, default):
    with admin.transaction():
        admin.execute("set local search_path = public, extensions")
        for column in columns.split():
            assert admin.execute(
                """select format_type(a.atttypid, a.atttypmod), not a.attnotnull,
                          pg_get_expr(d.adbin, d.adrelid)
                     from pg_attribute a
                     left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
                    where a.attrelid=to_regclass(%s) and a.attname=%s and not a.attisdropped""",
                (f"public.{table}", column),
            ).fetchone() == (pg_type, nullable, default), (table, column)


@pytest.mark.parametrize("table", REPLAY_DEPENDENCY_RELATIONS)
def test_replay_dependencies_exist_with_pk_and_rls(admin, table):
    assert admin.execute("select to_regclass(%s)", (f"public.{table}",)).fetchone()[0] == table
    assert "PRIMARY KEY (id)" in constraint_definitions(admin, table).values()
    assert admin.execute(
        "select relrowsecurity, relforcerowsecurity from pg_class where oid=to_regclass(%s)",
        (f"public.{table}",),
    ).fetchone() == (True, False)


def test_replay_dependency_table_privileges_are_least_privilege(admin):
    operations = ("SELECT", "INSERT", "UPDATE", "DELETE")
    expected = {
        ("shopify_products", "service_role"): frozenset(operations),
        ("shopify_products", "authenticated"): frozenset(),
        ("api_keys", "service_role"): frozenset(operations),
        ("api_keys", "authenticated"): frozenset(),
        ("email_templates", "service_role"): frozenset(operations),
        ("email_templates", "authenticated"): frozenset(("SELECT", "INSERT", "UPDATE")),
        ("deals", "service_role"): frozenset(operations),
        ("deals", "authenticated"): frozenset(operations),
        ("deal_activities", "service_role"): frozenset(operations),
        ("deal_activities", "authenticated"): frozenset(("SELECT",)),
        ("events", "service_role"): frozenset(),
        ("events", "authenticated"): frozenset(),
        ("pipeline_stage_transitions", "service_role"): frozenset(("SELECT",)),
        ("pipeline_stage_transitions", "authenticated"): frozenset(operations),
        ("email_clicks", "service_role"): frozenset(),
        ("email_clicks", "authenticated"): frozenset(),
        ("automation_executions", "service_role"): frozenset(("SELECT", "INSERT")),
        ("automation_executions", "authenticated"): frozenset(("SELECT", "DELETE")),
        ("automation_versions", "service_role"): frozenset(),
        ("automation_versions", "authenticated"): frozenset(),
        ("automation_run_steps", "service_role"): frozenset(("SELECT", "INSERT", "UPDATE")),
        ("automation_run_steps", "authenticated"): frozenset(("SELECT",)),
        ("automation_pending_steps", "service_role"): frozenset(),
        ("automation_pending_steps", "authenticated"): frozenset(),
        ("whatsapp_campaign_recipients", "service_role"):
            frozenset(("SELECT", "INSERT", "UPDATE")),
        ("whatsapp_campaign_recipients", "authenticated"): frozenset(),
    }
    expected.update(
        ((table, "anon"), frozenset()) for table in REPLAY_DEPENDENCY_RELATIONS
    )
    actual = {
        key: frozenset(
            operation for operation in operations
            if admin.execute(
                "select has_table_privilege(%s, %s, %s)",
                (key[1], f"public.{key[0]}", operation),
            ).fetchone()[0]
        )
        for key in expected
    }
    assert actual == expected


def test_shopify_store_and_api_key_secrets_have_no_authenticated_acl(admin):
    metadata = {
        "id", "organization_id", "shop_name", "shop_domain", "is_active", "created_at",
        "default_pipeline_id", "default_stage_id", "status", "connection_status",
        "status_message", "health_checked_at", "consecutive_failures", "last_sync_at",
        "contact_type", "sync_orders", "sync_customers", "sync_checkouts", "sync_refunds",
        "auto_tags", "stage_mapping", "is_configured", "total_orders", "total_revenue",
    }
    authenticated_columns = {
        row[0] for row in admin.execute(
            """select a.attname
                 from pg_attribute a
                where a.attrelid='public.shopify_stores'::regclass
                  and a.attnum > 0 and not a.attisdropped
                  and has_column_privilege('authenticated', a.attrelid, a.attnum, 'select')"""
        )
    }
    worker_columns = {
        row[0] for row in admin.execute(
            """select a.attname
                 from pg_attribute a
                where a.attrelid='public.shopify_stores'::regclass
                  and a.attnum > 0 and not a.attisdropped
                  and has_column_privilege('worker_role', a.attrelid, a.attnum, 'select')"""
        )
    }
    assert authenticated_columns == metadata
    assert worker_columns == {"id", "organization_id"}
    assert admin.execute(
        """select has_table_privilege('authenticated', 'public.shopify_stores', 'select'),
                  has_table_privilege('authenticated', 'public.shopify_stores', 'update'),
                  has_table_privilege('worker_role', 'public.shopify_stores', 'select'),
                  has_column_privilege('authenticated', 'public.api_keys', 'key', 'select'),
                  has_column_privilege('authenticated', 'public.api_keys', 'key_hash', 'select'),
                  has_table_privilege('service_role', 'public.api_keys', 'select')"""
    ).fetchone() == (False, False, False, False, False, True)


@pytest.mark.parametrize("table,column,target,delete", REPLAY_DEPENDENCY_FOREIGN_KEYS)
def test_replay_dependency_foreign_keys(admin, table, column, target, delete):
    definition = f"FOREIGN KEY ({column}) REFERENCES {target}(id)"
    if delete:
        definition += f" ON DELETE {delete}"
    assert definition in constraint_definitions(admin, table).values()


def test_api_keys_user_id_remains_a_compatibility_link_without_fk(admin):
    assert not any(
        definition.startswith("FOREIGN KEY (user_id)")
        for definition in constraint_definitions(admin, "api_keys").values()
    )


@pytest.mark.parametrize("table,definitions", REPLAY_DEPENDENCY_INDEXES.items())
def test_replay_dependency_indexes(admin, table, definitions):
    names = tuple(definitions)
    actual = dict(admin.execute(
        """select indexname, indexdef from pg_indexes
            where schemaname='public' and tablename=%s and indexname=any(%s)""",
        (table, list(names)),
    ).fetchall())
    expected = {
        name: f"CREATE INDEX {name} ON public.{table} USING btree {suffix}"
        for name, suffix in definitions.items()
    }
    assert actual == expected


@pytest.mark.parametrize("table,expected", REPLAY_DEPENDENCY_CONSTRAINTS.items())
def test_replay_dependency_checks_and_uniques(admin, table, expected):
    assert expected <= set(constraint_definitions(admin, table).values())


def test_recipient_key_preserves_both_reviewed_lanes(admin):
    key_type, nullable, default = admin.execute(
        """select format_type(a.atttypid, a.atttypmod), not a.attnotnull,
                  pg_get_expr(d.adbin, d.adrelid)
             from pg_attribute a
             left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
            where a.attrelid='public.whatsapp_campaign_recipients'::regclass
              and a.attname='campaign_id'"""
    ).fetchone()
    assert (key_type, nullable, default) in (("uuid", False, None), ("text", False, None))
    campaign_fk = "FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE"
    definitions = constraint_definitions(admin, "whatsapp_campaign_recipients").values()
    assert (campaign_fk in definitions) is (key_type == "uuid")


def _normalized_policy_rows(admin, table):
    return tuple(admin.execute(
        """select policyname, cmd, roles, permissive,
                  regexp_replace(qual, '\\s+', '', 'g'),
                  regexp_replace(with_check, '\\s+', '', 'g')
             from pg_policies
            where schemaname='public' and tablename=%s
            order by policyname""",
        (table,),
    ).fetchall())


@pytest.mark.parametrize("table", ("shopify_products", "api_keys", "email_templates"))
def test_org_replay_dependencies_have_only_the_org_policy(admin, table):
    predicate = "(organization_id=get_user_organization_id())"
    assert _normalized_policy_rows(admin, table) == (
        ("org_isolation_rls", "ALL", ["authenticated"], "PERMISSIVE", predicate, predicate),
    )


@pytest.mark.parametrize("table,has_org_policy", (
    ("deals", True),
    ("deal_activities", True),
    ("events", False),
    ("pipeline_stage_transitions", True),
))
def test_crm_replay_dependencies_have_the_exact_store_policy(admin, table, has_org_policy):
    store = ("(store_idIN(SELECTs.idFROMshopify_storessWHERE"
             "(s.organization_id=get_user_organization_id())))")
    rows = [("org_via_loja", "ALL", ["authenticated"], "PERMISSIVE", store, store)]
    if has_org_policy:
        org = "(organization_id=get_user_organization_id())"
        rows.insert(0, ("org_isolation_rls", "ALL", ["authenticated"], "PERMISSIVE", org, org))
    assert _normalized_policy_rows(admin, table) == tuple(rows)


@pytest.mark.parametrize("table,key,parent,has_org_policy", (
    ("email_clicks", "email_send_id", "email_sends", False),
    ("automation_executions", "automation_id", "automations", True),
    ("automation_versions", "automation_id", "automations", False),
    ("automation_run_steps", "run_id", "automation_runs", False),
    ("automation_pending_steps", "run_id", "automation_runs", False),
    ("whatsapp_campaign_recipients", "campaign_id", "whatsapp_campaigns", False),
))
def test_child_replay_dependencies_have_the_exact_parent_policy(
        admin, table, key, parent, has_org_policy):
    key_type = column_contract(admin, table, key)[0]
    assert key_type in ("uuid", "text")
    child_key = f"({table}.{key})::text" if key_type == "uuid" else f"{table}.{key}"
    parent_predicate = (f"(EXISTS(SELECT1FROM{parent}pWHERE"
                        f"((p.id)::text={child_key})))")
    rows = [("org_via_pai", "ALL", ["authenticated"], "PERMISSIVE",
             parent_predicate, parent_predicate)]
    if has_org_policy:
        org = "(organization_id=get_user_organization_id())"
        rows.insert(0, ("org_isolation_rls", "ALL", ["authenticated"], "PERMISSIVE", org, org))
    assert _normalized_policy_rows(admin, table) == tuple(rows)


@pytest.mark.parametrize(("table", "can_select", "can_update"), (
    ("deals", True, True),
    ("deal_activities", True, False),
    ("events", False, False),
    ("pipeline_stage_transitions", True, True),
))
@pytest.mark.rls
def test_crm_replay_dependencies_enforce_store_scope(
        dsn, admin, two_tenants, table, can_select, can_update):
    rows = []
    stores = []
    parent_deals = []
    try:
        for tenant in (two_tenants.a, two_tenants.b):
            store = admin.execute(
                """insert into public.shopify_stores
                     (organization_id, shop_domain, access_token)
                   values (%s, %s, 'scope-fixture-not-a-secret') returning id""",
                (tenant.id, f"scope-{tenant.user_id}.myshopify.test"),
            ).fetchone()[0]
            stores.append(store)
            pipeline, stage = admin.execute(
                """select p.id, s.id
                     from public.pipelines p
                     join public.pipeline_stages s on s.pipeline_id=p.id
                    where p.organization_id=%s
                    order by p.is_default desc, s.position
                    limit 1""",
                (tenant.id,),
            ).fetchone()
            if table == "deals":
                row = admin.execute(
                    """insert into public.deals
                         (organization_id, store_id, pipeline_id, stage_id, title)
                       values (%s, %s, %s, %s, 'Scoped deal') returning id""",
                    (tenant.id, store, pipeline, stage),
                ).fetchone()[0]
            elif table == "deal_activities":
                deal = admin.execute(
                    """insert into public.deals
                         (organization_id, store_id, pipeline_id, stage_id, title)
                       values (%s, %s, %s, %s, 'Activity parent') returning id""",
                    (tenant.id, store, pipeline, stage),
                ).fetchone()[0]
                parent_deals.append(deal)
                row = admin.execute(
                    """insert into public.deal_activities
                         (organization_id, store_id, deal_id, activity_type)
                       values (%s, %s, %s, 'note') returning id""",
                    (tenant.id, store, deal),
                ).fetchone()[0]
            elif table == "events":
                row = admin.execute(
                    "insert into public.events (store_id) values (%s) returning id",
                    (store,),
                ).fetchone()[0]
            else:
                row = admin.execute(
                    """insert into public.pipeline_stage_transitions
                         (organization_id, store_id, pipeline_id, to_stage_id,
                          source_type, trigger_event)
                       values (%s, %s, %s, %s, 'fixture', 'scope') returning id""",
                    (tenant.id, store, pipeline, stage),
                ).fetchone()[0]
            rows.append(row)

        with as_authenticated_user(dsn, two_tenants.a.user_id) as authenticated:
            if can_select:
                assert authenticated.execute(
                    f"select id::text from public.{table} where id=%s", (rows[0],),
                ).fetchone() == (str(rows[0]),)
                assert authenticated.execute(
                    f"select id from public.{table} where id=%s", (rows[1],),
                ).fetchone() is None
            else:
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    with authenticated.transaction():
                        authenticated.execute(
                            f"select id from public.{table} where id=%s", (rows[0],),
                        )
                return

            assignment = "store_id=%s"
            values = (stores[1], rows[0])
            if table != "events":
                assignment = "organization_id=%s, store_id=%s"
                values = (two_tenants.b.id, stores[1], rows[0])
            if can_update:
                own_assignment = "store_id=%s"
                own_values = (stores[0], rows[0])
                if table != "events":
                    own_assignment = "organization_id=%s, store_id=%s"
                    own_values = (two_tenants.a.id, stores[0], rows[0])
                assert authenticated.execute(
                    f"update public.{table} set {own_assignment} where id=%s returning id::text",
                    own_values,
                ).fetchone() == (str(rows[0]),)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with authenticated.transaction():
                    authenticated.execute(
                        f"update public.{table} set {assignment} where id=%s", values,
                    )
    finally:
        for row in rows:
            admin.execute(f"delete from public.{table} where id=%s", (row,))
        for deal in parent_deals:
            admin.execute("delete from public.deals where id=%s", (deal,))
        if stores:
            admin.execute("delete from public.shopify_stores where id=any(%s)", (stores,))


@pytest.mark.parametrize(("table", "parent_key"), (
    ("email_clicks", "email_send_id"),
    ("automation_executions", "automation_id"),
    ("automation_versions", "automation_id"),
    ("automation_run_steps", "run_id"),
    ("automation_pending_steps", "run_id"),
    ("whatsapp_campaign_recipients", "campaign_id"),
))
@pytest.mark.rls
def test_child_replay_dependencies_enforce_parent_scope(
        dsn, admin, two_tenants, table, parent_key):
    parents = []
    rows = []
    key_type = None
    try:
        for tenant in (two_tenants.a, two_tenants.b):
            if table == "email_clicks":
                parent = admin.execute(
                    """insert into public.email_sends (organization_id, email)
                       values (%s, 'scope@example.test') returning id""",
                    (tenant.id,),
                ).fetchone()[0]
            elif table in ("automation_executions", "automation_versions"):
                parent = admin.execute(
                    """insert into public.automations (organization_id, name, trigger_type)
                       values (%s, 'Scoped automation', 'manual') returning id""",
                    (tenant.id,),
                ).fetchone()[0]
            elif table in ("automation_run_steps", "automation_pending_steps"):
                automation = admin.execute(
                    """insert into public.automations (organization_id, name, trigger_type)
                       values (%s, 'Scoped automation', 'manual') returning id""",
                    (tenant.id,),
                ).fetchone()[0]
                parent = admin.execute(
                    """insert into public.automation_runs (automation_id, organization_id)
                       values (%s, %s) returning id""",
                    (automation, tenant.id),
                ).fetchone()[0]
            else:
                parent = admin.execute(
                    """with generated(id) as (select gen_random_uuid())
                       insert into public.whatsapp_campaigns
                         (id, organization_id, campaign_id)
                       select id, %s, id::text from generated returning id""",
                    (tenant.id,),
                ).fetchone()[0]
            parents.append(parent)

            if table == "email_clicks":
                row = admin.execute(
                    """insert into public.email_clicks (email_send_id, url)
                       values (%s, %s) returning id""",
                    (parent, "https" + "://example.test/scope"),
                ).fetchone()[0]
            elif table == "automation_executions":
                row = admin.execute(
                    """insert into public.automation_executions
                         (id, automation_id, organization_id)
                       values (%s, %s, %s) returning id""",
                    (f"scope-{parent}", parent, tenant.id),
                ).fetchone()[0]
            elif table == "automation_versions":
                row = admin.execute(
                    """insert into public.automation_versions
                         (automation_id, version, nodes, edges)
                       values (%s, 1, '[]', '[]') returning id""",
                    (parent,),
                ).fetchone()[0]
            elif table == "automation_run_steps":
                row = admin.execute(
                    """insert into public.automation_run_steps (run_id, node_id, node_type)
                       values (%s, 'scope', 'fixture') returning id""",
                    (parent,),
                ).fetchone()[0]
            elif table == "automation_pending_steps":
                row = admin.execute(
                    """insert into public.automation_pending_steps
                         (run_id, node_id, scheduled_for)
                       values (%s, 'scope', now()) returning id""",
                    (parent,),
                ).fetchone()[0]
            else:
                if key_type is None:
                    key_type = admin.execute(
                        """select format_type(atttypid, atttypmod)
                             from pg_attribute
                            where attrelid='public.whatsapp_campaign_recipients'::regclass
                              and attname='campaign_id'"""
                    ).fetchone()[0]
                    assert key_type in ("uuid", "text")
                row = admin.execute(
                    f"""insert into public.whatsapp_campaign_recipients
                          (campaign_id, phone_number)
                        values (%s::{key_type}, '+15550000001') returning id""",
                    (str(parent),),
                ).fetchone()[0]
            rows.append(row)

        with as_authenticated_user(dsn, two_tenants.a.user_id) as authenticated:
            if table in ("automation_executions", "automation_run_steps"):
                assert authenticated.execute(
                    f"select id::text from public.{table} where id=%s", (rows[0],),
                ).fetchone() == (str(rows[0]),)
                assert authenticated.execute(
                    f"select id from public.{table} where id=%s", (rows[1],),
                ).fetchone() is None
            else:
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    with authenticated.transaction():
                        authenticated.execute(
                            f"select id from public.{table} where id=%s", (rows[0],),
                        )
                return

            if table == "automation_executions":
                assert authenticated.execute(
                    f"delete from public.{table} where id=%s returning id", (rows[1],),
                ).fetchone() is None
            assignment = f"{parent_key}=%s"
            values = (parents[1], rows[0])
            if table == "automation_executions":
                assignment = "automation_id=%s, organization_id=%s"
                values = (parents[1], two_tenants.b.id, rows[0])
            elif table == "whatsapp_campaign_recipients":
                assignment = f"campaign_id=%s::{key_type}"
                values = (str(parents[1]), rows[0])
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with authenticated.transaction():
                    authenticated.execute(
                        f"update public.{table} set {assignment} where id=%s", values,
                    )
    finally:
        for row in rows:
            admin.execute(f"delete from public.{table} where id=%s", (row,))


def test_email_universal_usage_final_contract(admin):
    assert admin.execute("select to_regclass('public.email_universal_usage')").fetchone()[0] == (
        "email_universal_usage"
    )
    assert admin.execute(
        """select option_value::boolean
             from pg_class c,
                  lateral pg_options_to_table(c.reloptions)
            where c.oid='public.email_universal_usage'::regclass
              and option_name='security_invoker'"""
    ).fetchone() == (True,)
    assert admin.execute(
        """select column_name, data_type
             from information_schema.columns
            where table_schema='public' and table_name='email_universal_usage'
            order by ordinal_position"""
    ).fetchall() == [
        ("organization_id", "uuid"),
        ("template_id", "uuid"),
        ("template_name", "text"),
        ("template_updated_at", "timestamp with time zone"),
        ("saved_block_id", "uuid"),
        ("kind", "text"),
    ]
    assert admin.execute(
        "select has_table_privilege('anon', 'public.email_universal_usage', 'select'), "
        "has_table_privilege('authenticated', 'public.email_universal_usage', 'select'), "
        "has_table_privilege('service_role', 'public.email_universal_usage', 'select')"
    ).fetchone() == (False, False, True)


def test_email_universal_usage_reads_current_and_legacy_design(admin):
    current_id = "10000000-0000-4000-8000-000000000001"
    legacy_id = "10000000-0000-4000-8000-000000000002"
    current_saved = "10000000-0000-4000-8000-000000000003"
    legacy_saved = "10000000-0000-4000-8000-000000000004"
    with admin.transaction(force_rollback=True):
        admin.execute(
            """insert into public.email_templates
                 (id, organization_id, name, design_json, design)
               values (%s, %s, 'Current design', %s::jsonb, null),
                      (%s, %s, 'Legacy design', null, %s::jsonb)""",
            (current_id, current_id,
             f'{{"sections":[{{"columns":[{{"blocks":[{{"_savedBlockId":"{current_saved}"}}]}}]}}]}}',
             legacy_id, legacy_id,
             f'{{"sections":[{{"_savedSectionId":"{legacy_saved}"}}]}}'),
        )
        assert admin.execute(
            """select template_id::text, saved_block_id::text, kind
                 from public.email_universal_usage
                where template_id in (%s::uuid, %s::uuid)
                order by template_id""",
            (current_id, legacy_id),
        ).fetchall() == [
            (current_id, current_saved, "block"),
            (legacy_id, legacy_saved, "section"),
        ]


def test_saved_block_usage_counts_contract_and_acl(admin):
    contract = admin.execute(
        """select p.provolatile, p.prosecdef, p.proconfig,
                  pg_get_function_result(p.oid)
             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='saved_block_usage_counts'
              and oidvectortypes(p.proargtypes)='uuid'"""
    ).fetchone()
    assert contract == (
        "s", True, ["search_path=public"],
        "TABLE(saved_block_id uuid, email_count integer)",
    )
    assert admin.execute(
        """select has_function_privilege('service_role',
                                          'public.saved_block_usage_counts(uuid)', 'execute'),
                  has_function_privilege('anon',
                                          'public.saved_block_usage_counts(uuid)', 'execute'),
                  has_function_privilege('authenticated',
                                          'public.saved_block_usage_counts(uuid)', 'execute')"""
    ).fetchone() == (True, False, False)
    org_id = "30000000-0000-4000-8000-000000000001"
    saved_id = "30000000-0000-4000-8000-000000000002"
    design = (
        f'{{"sections":[{{"_savedSectionId":"{saved_id}","columns":['
        f'{{"blocks":[{{"_savedBlockId":"{saved_id}"}}]}}]}}]}}'
    )
    with admin.transaction(force_rollback=True):
        admin.execute(
            """insert into public.email_templates
                 (organization_id, name, design_json)
               values (%s, 'Duplicate usage fixture', %s::jsonb)""",
            (org_id, design),
        )
        assert admin.execute(
            "select saved_block_id::text, email_count "
            "from public.saved_block_usage_counts(%s) where saved_block_id=%s",
            (org_id, saved_id),
        ).fetchone() == (saved_id, 1)


def test_api_keys_accept_hash_only_rows(admin):
    org_id = "20000000-0000-4000-8000-000000000001"
    with admin.transaction(force_rollback=True):
        admin.execute(
            "insert into public.organizations (id, name, slug) values (%s, 'Hash only', %s)",
            (org_id, f"hash-only-{org_id}"),
        )
        key_id = admin.execute(
            """insert into public.api_keys
                 (organization_id, name, key_hash, key_prefix, permissions)
               values (%s, 'Modern hash-only fixture', repeat('a', 64), 'wrd_test_',
                       array['events:write'])
               returning id""",
            (org_id,),
        ).fetchone()[0]
        assert admin.execute(
            "select key, key_hash, key_prefix, permissions from public.api_keys where id=%s",
            (key_id,),
        ).fetchone() == (None, "a" * 64, "wrd_test_", ["events:write"])


@pytest.mark.rls
def test_api_keys_org_policy_hides_and_protects_other_tenant(dsn, admin, two_tenants):
    own_id = "40000000-0000-4000-8000-000000000001"
    other_id = "40000000-0000-4000-8000-000000000002"
    admin.execute(
        """insert into public.api_keys (id, organization_id, name, key_hash)
           values (%s, %s, 'Own key', repeat('a', 64)),
                  (%s, %s, 'Other key', repeat('b', 64))""",
        (own_id, two_tenants.a.id, other_id, two_tenants.b.id),
    )
    with as_authenticated_user(dsn, two_tenants.a.user_id) as authenticated:
        for column in ("id", "key", "key_hash"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with authenticated.transaction():
                    authenticated.execute(
                        f"select {column} from public.api_keys where id=%s", (own_id,),
                    )
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with authenticated.transaction():
                authenticated.execute(
                    "update public.api_keys set name='blocked' where id=%s", (own_id,),
                )
