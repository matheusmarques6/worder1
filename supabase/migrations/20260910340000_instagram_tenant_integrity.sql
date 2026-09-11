-- Instagram: relações entre tabelas precisam pertencer à mesma organização.
-- Este delta posterior também alcança bancos onde 20260910330000 já foi aplicada.

create schema if not exists internal;

do $$
begin
  lock table public.instagram_accounts, public.instagram_contacts,
    public.instagram_conversations, public.instagram_messages
    in share row exclusive mode;

  if exists (
    select 1 from public.instagram_accounts a
     where not exists (select 1 from public.organizations o where o.id = a.organization_id)
        or (a.store_id is not null and not exists (
          select 1 from public.shopify_stores s
           where s.id = a.store_id and s.organization_id = a.organization_id
        ))
  ) then
    raise exception 'instagram preflight: account tenant reference incompatible';
  end if;

  if exists (
    select 1 from public.instagram_contacts c
     where (c.store_id is not null and not exists (
            select 1 from public.shopify_stores s
             where s.id = c.store_id and s.organization_id = c.organization_id
          ))
        or (c.crm_contact_id is not null and not exists (
            select 1 from public.contacts x
             where x.id = c.crm_contact_id and x.organization_id = c.organization_id
          ))
  ) then
    raise exception 'instagram preflight: contact tenant reference incompatible';
  end if;

  if exists (
    select 1 from public.instagram_conversations c
     where not exists (
            select 1 from public.instagram_accounts a
             where a.id = c.account_id and a.organization_id = c.organization_id
          )
        or (c.contact_id is not null and not exists (
            select 1 from public.instagram_contacts x
             where x.id = c.contact_id and x.organization_id = c.organization_id
          ))
        or (c.assigned_to is not null and not exists (
            select 1 from public.profiles p
             where p.id = c.assigned_to and p.organization_id = c.organization_id
          ))
        or (c.store_id is not null and not exists (
            select 1 from public.shopify_stores s
             where s.id = c.store_id and s.organization_id = c.organization_id
          ))
  ) then
    raise exception 'instagram preflight: conversation tenant reference incompatible';
  end if;

  if exists (
    select 1 from public.instagram_messages m
     where not exists (
            select 1 from public.instagram_conversations c
             where c.id = m.conversation_id
               and c.account_id = m.account_id
               and c.organization_id = m.organization_id
          )
        or (m.store_id is not null and not exists (
            select 1 from public.shopify_stores s
             where s.id = m.store_id and s.organization_id = m.organization_id
          ))
  ) then
    raise exception 'instagram preflight: message tenant reference incompatible';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('instagram_accounts', 'instagram_contacts',
                         'instagram_conversations', 'instagram_messages')
       and policyname <> 'org_isolation_rls'
  ) then
    raise exception 'instagram preflight: unexpected RLS policy';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'whatsapp_campaign_logs'
       and policyname not in (
         'org_isolation_rls',
         'Users can delete own org campaign_logs',
         'Users can insert own org campaign_logs',
         'Users can update own org campaign_logs',
         'Users can view own org campaign_logs'
       )
  ) then
    raise exception 'whatsapp campaign logs preflight: unexpected RLS policy';
  end if;

  if exists (
    select 1
      from pg_attribute a
      cross join lateral aclexplode(a.attacl) acl
     where a.attrelid in (
             'public.instagram_accounts'::regclass,
             'public.instagram_contacts'::regclass,
             'public.instagram_conversations'::regclass,
             'public.instagram_messages'::regclass,
             'public.whatsapp_campaign_logs'::regclass
           )
       and a.attnum > 0 and not a.attisdropped
       and acl.grantee in (0, 'anon'::regrole::oid)
  ) then
    raise exception 'tenant table preflight: unexpected browser column grant';
  end if;
end $$;

create index if not exists idx_instagram_accounts_store
  on public.instagram_accounts(store_id);
create index if not exists idx_instagram_contacts_store
  on public.instagram_contacts(store_id);
create index if not exists idx_instagram_conversations_account
  on public.instagram_conversations(account_id);
create index if not exists idx_instagram_conversations_contact
  on public.instagram_conversations(contact_id);
create index if not exists idx_instagram_conversations_assigned
  on public.instagram_conversations(assigned_to);
create index if not exists idx_instagram_conversations_store
  on public.instagram_conversations(store_id);
create index if not exists idx_instagram_messages_store
  on public.instagram_messages(store_id);

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.instagram_accounts'::regclass
       and conname = 'instagram_accounts_store_id_fkey'
       and pg_get_constraintdef(oid) <>
           'FOREIGN KEY (store_id) REFERENCES shopify_stores(id) ON DELETE SET NULL'
  ) then
    raise exception 'instagram preflight: account store foreign key incompatible';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.instagram_accounts'::regclass
       and conname = 'instagram_accounts_store_id_fkey'
  ) then
    alter table public.instagram_accounts
      add constraint instagram_accounts_store_id_fkey
      foreign key (store_id) references public.shopify_stores(id) on delete set null;
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.instagram_conversations'::regclass
       and conname = 'instagram_conversations_store_id_fkey'
       and pg_get_constraintdef(oid) <>
           'FOREIGN KEY (store_id) REFERENCES shopify_stores(id) ON DELETE SET NULL'
  ) then
    raise exception 'instagram preflight: conversation store foreign key incompatible';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.instagram_conversations'::regclass
       and conname = 'instagram_conversations_store_id_fkey'
  ) then
    alter table public.instagram_conversations
      add constraint instagram_conversations_store_id_fkey
      foreign key (store_id) references public.shopify_stores(id) on delete set null;
  end if;
end $$;

create or replace function internal.instagram_reference_same_org()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_table_name = 'instagram_accounts' then
    if tg_op = 'UPDATE'
       and (old.id is distinct from new.id
            or old.organization_id is distinct from new.organization_id)
       and exists (
         select 1 from public.instagram_conversations c where c.account_id = old.id
       ) then
      raise exception 'instagram account tenant identity is referenced';
    end if;
    perform 1 from public.organizations o
     where o.id = new.organization_id for update;
    if not found then
      raise exception 'instagram account organization does not exist';
    end if;
    if new.store_id is not null then
      perform 1 from public.shopify_stores s
       where s.id = new.store_id and s.organization_id = new.organization_id
       for update;
      if not found then
        raise exception 'instagram account store belongs to another organization';
      end if;
    end if;
  elsif tg_table_name = 'instagram_contacts' then
    if tg_op = 'UPDATE'
       and old.organization_id is distinct from new.organization_id
       and exists (
         select 1 from public.instagram_conversations c where c.contact_id = old.id
       ) then
      raise exception 'instagram contact tenant identity is referenced';
    end if;
    if new.store_id is not null then
      perform 1 from public.shopify_stores s
       where s.id = new.store_id and s.organization_id = new.organization_id
       for update;
      if not found then
        raise exception 'instagram contact store belongs to another organization';
      end if;
    end if;
    if new.crm_contact_id is not null then
      perform 1 from public.contacts c
       where c.id = new.crm_contact_id and c.organization_id = new.organization_id
       for update;
      if not found then
        raise exception 'instagram contact CRM link belongs to another organization';
      end if;
    end if;
  elsif tg_table_name = 'instagram_conversations' then
    if tg_op = 'UPDATE'
       and (old.id is distinct from new.id
            or old.organization_id is distinct from new.organization_id
            or old.account_id is distinct from new.account_id)
       and exists (
         select 1 from public.instagram_messages m where m.conversation_id = old.id
       ) then
      raise exception 'instagram conversation identity is referenced';
    end if;
    perform 1 from public.instagram_accounts a
     where a.id = new.account_id and a.organization_id = new.organization_id
     for update;
    if not found then
      raise exception 'instagram conversation account belongs to another organization';
    end if;
    if new.contact_id is not null then
      perform 1 from public.instagram_contacts c
       where c.id = new.contact_id and c.organization_id = new.organization_id
       for update;
      if not found then
        raise exception 'instagram conversation contact belongs to another organization';
      end if;
    end if;
    if new.assigned_to is not null then
      perform 1 from public.profiles p
       where p.id = new.assigned_to and p.organization_id = new.organization_id
       for update;
      if not found then
        raise exception 'instagram conversation assignee belongs to another organization';
      end if;
    end if;
    if new.store_id is not null then
      perform 1 from public.shopify_stores s
       where s.id = new.store_id and s.organization_id = new.organization_id
       for update;
      if not found then
        raise exception 'instagram conversation store belongs to another organization';
      end if;
    end if;
  elsif tg_table_name = 'instagram_messages' then
    perform 1 from public.instagram_conversations c
     where c.id = new.conversation_id
       and c.account_id = new.account_id
       and c.organization_id = new.organization_id
     for update;
    if not found then
      raise exception 'instagram message conversation belongs to another account or organization';
    end if;
    if new.store_id is not null then
      perform 1 from public.shopify_stores s
       where s.id = new.store_id and s.organization_id = new.organization_id
       for update;
      if not found then
        raise exception 'instagram message store belongs to another organization';
      end if;
    end if;
  end if;
  return new;
end
$$;

revoke all on function internal.instagram_reference_same_org()
  from public, anon, authenticated;

create or replace function internal.instagram_external_parent_tenant_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.organization_id is not distinct from new.organization_id then
    return new;
  end if;

  if tg_table_name = 'profiles' and exists (
    select 1 from public.instagram_conversations c
     where c.assigned_to = old.id
       and c.organization_id is distinct from new.organization_id
  ) then
    raise exception 'instagram external parent tenant link is referenced';
  elsif tg_table_name = 'contacts' and exists (
    select 1 from public.instagram_contacts c
     where c.crm_contact_id = old.id
       and c.organization_id is distinct from new.organization_id
  ) then
    raise exception 'instagram external parent tenant link is referenced';
  elsif tg_table_name = 'shopify_stores' and (
    exists (
      select 1 from public.instagram_accounts a
       where a.store_id = old.id
         and a.organization_id is distinct from new.organization_id
    )
    or exists (
      select 1 from public.instagram_contacts c
       where c.store_id = old.id
         and c.organization_id is distinct from new.organization_id
    )
    or exists (
      select 1 from public.instagram_conversations c
       where c.store_id = old.id
         and c.organization_id is distinct from new.organization_id
    )
    or exists (
      select 1 from public.instagram_messages m
       where m.store_id = old.id
         and m.organization_id is distinct from new.organization_id
    )
  ) then
    raise exception 'instagram external parent tenant link is referenced';
  end if;

  return new;
end
$$;

revoke all on function internal.instagram_external_parent_tenant_guard()
  from public, anon, authenticated;

drop trigger if exists instagram_external_parent_tenant_guard on public.profiles;
create trigger instagram_external_parent_tenant_guard
  before update of organization_id on public.profiles
  for each row execute function internal.instagram_external_parent_tenant_guard();

drop trigger if exists instagram_external_parent_tenant_guard on public.contacts;
create trigger instagram_external_parent_tenant_guard
  before update of organization_id on public.contacts
  for each row execute function internal.instagram_external_parent_tenant_guard();

drop trigger if exists instagram_external_parent_tenant_guard on public.shopify_stores;
create trigger instagram_external_parent_tenant_guard
  before update of organization_id on public.shopify_stores
  for each row execute function internal.instagram_external_parent_tenant_guard();

do $$
declare
  t text;
begin
  foreach t in array array[
    'instagram_accounts', 'instagram_contacts',
    'instagram_conversations', 'instagram_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists org_isolation_rls on public.%I', t);
    execute format(
      'create policy org_isolation_rls on public.%I
         for all to authenticated
         using (organization_id = get_user_organization_id())
         with check (organization_id = get_user_organization_id())', t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
    execute format('drop trigger if exists instagram_reference_same_org on public.%I', t);
    execute format(
      'create trigger instagram_reference_same_org
         before insert or update on public.%I
         for each row execute function internal.instagram_reference_same_org()', t
    );
  end loop;
end $$;

alter table public.whatsapp_campaign_logs enable row level security;
drop policy if exists "Users can delete own org campaign_logs"
  on public.whatsapp_campaign_logs;
drop policy if exists "Users can insert own org campaign_logs"
  on public.whatsapp_campaign_logs;
drop policy if exists "Users can update own org campaign_logs"
  on public.whatsapp_campaign_logs;
drop policy if exists "Users can view own org campaign_logs"
  on public.whatsapp_campaign_logs;
drop policy if exists org_isolation_rls on public.whatsapp_campaign_logs;
create policy org_isolation_rls on public.whatsapp_campaign_logs
  for all to authenticated
  using (organization_id = get_user_organization_id())
  with check (organization_id = get_user_organization_id());
revoke all on public.whatsapp_campaign_logs from public, anon;
grant select, insert, update, delete on public.whatsapp_campaign_logs to authenticated, service_role;

revoke all on function public.increment_campaign_sent(uuid) from public, anon, authenticated;
revoke all on function public.increment_campaign_delivered(uuid) from public, anon, authenticated;
revoke all on function public.increment_campaign_read(uuid) from public, anon, authenticated;
revoke all on function public.increment_campaign_failed(uuid) from public, anon, authenticated;
grant execute on function public.increment_campaign_sent(uuid) to service_role;
grant execute on function public.increment_campaign_delivered(uuid) to service_role;
grant execute on function public.increment_campaign_read(uuid) to service_role;
grant execute on function public.increment_campaign_failed(uuid) to service_role;
