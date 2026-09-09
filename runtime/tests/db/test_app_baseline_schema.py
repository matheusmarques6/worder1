"""App prerequisites: protects replay RED 42P01 at public.email_sends.

The first failure was recorded before this migration by the disposable replay
guardian. Collection is offline; executing these assertions requires real PG.
"""

import hashlib

import pytest

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
    ("pipeline_stages", ("pipeline_id", "position"), False, None),
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

# Reviewed active definitions, with only whitespace collapsed before SHA-256.
# The literals include the pg_get_functiondef header: signature, defaults,
# return shape, volatility, security and search_path as well as the entire body.
# No expected value reads a migration, invokes the reader or writes a golden.
FUNCTIONS = (
    ("attribution_candidates", "uuid, uuid, timestamp with time zone, uuid, integer, integer, "
     "integer, boolean, boolean, text",
     "44651fd02eacc7868faee9c56acf4c9ed73f6fc9a7882169d1fe2ce459968592"),
    ("attribute_order", "uuid, text, uuid, timestamp with time zone, numeric, numeric, text, uuid, "
     "integer, integer, integer, boolean, boolean, text",
     "95abb1542efa4fc815e64a11e9afebf8af5ddf8fbec8e70b94665079c873021e"),
    ("refund_order_attribution", "uuid, text, numeric",
     "abc18a57a7c245f97089f4ffa7118d013d0668e4423bd5bafdd50490b8773426"),
    ("revoke_order_attribution", "uuid, text",
     "76b6bd534d17f0ce69356d5d86c97178e92930cfcf4d545f2e50d9ca9acad53a"),
    ("refresh_attribution_totals", "uuid",
     "3871b4585c80f310311abe856b0606a7b41be61266f2c5be5a26eedd3338517e"),
    ("automation_email_stats", "uuid, uuid, timestamp with time zone",
     "dccdc96174c5ac1223062d3b3b22d67ae4970f6c65387a9e3af6c18fcd0dec3c"),
    ("campaign_email_stats", "uuid, uuid",
     "b97c08c35f185e2acccf97720af802f17d33c1fbe0945deaf9b70b581d363785"),
    ("bump_email_send_open", "uuid, boolean",
     "7da559f03b628871c5781d3cb20fd2f5c5409b44603e53e8265514809b9c6662"),
    ("bump_email_send_click", "uuid",
     "17cf6ade6f7dfa28e20af706530f80bf13f6f9ff8c66995af12e756d5cb11458"),
    ("get_user_organization_id", "",
     "04552f61da10d78eae28137aaf58a8650df3313f1b8abd00823e42643f4cd19d"),
    ("handle_new_user", "",
     "f5819d2597172b52d1e52fec3c1b6e95a41ecd94a8558161ad1cffa30c5fa1d1"),
)


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
            """select 'enum', t.typname, e.enumsortorder::integer, e.enumlabel
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
            digest = hashlib.sha256(" ".join(definition.split()).encode()).hexdigest()
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
    rows.extend(("enum", "user_role", order, role) for order, role in
                ((1, "owner"), (2, "admin"), (3, "member"), (4, "agent")))
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
