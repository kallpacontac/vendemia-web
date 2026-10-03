-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0002 · Quién puede qué, y RLS
--
-- La frontera es esta, no el panel. Mismo principio que 0006_rls.sql del bot:
-- el panel lee con la clave anon + la sesión, y aquí se decide qué filas ve.
--
-- ROLES (sobre la membresía existente, sin cambiar su contrato owner|member):
--
--   platform_admin  fila en platform_admins. Todo, en todas las compañías. Sus
--                   escrituras quedan auditadas como 'platform_admin'.
--   owner           memberships.role = 'owner'. Todo en su compañía.
--   manager         member + loyalty_staff 'manager'. Programa y operación de
--                   sus sucursales. Sin exportar ni gestionar equipo.
--   cashier         member sin fila en loyalty_staff, o 'cashier'. Buscar,
--                   registrar y canjear. Ni contactos, ni exportar, ni reglas.
--   analyst         member + 'analyst'. Métricas. Ningún cambio operativo.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Los ayudantes ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER por lo mismo que is_member: leen memberships/platform_admins,
-- que tienen RLS propio. search_path fijado, que es lo que impide secuestrarlas.

create or replace function public.loyalty_uid()
returns text
language sql stable
set search_path = public
as $$ select (select auth.uid())::text $$;

create or replace function public.loyalty_es_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (select 1 from public.platform_admins a where a.auth_user_id = (select auth.uid())::text);
$$;

-- El rol EFECTIVO del usuario actual en una compañía, o null si no tiene acceso.
create or replace function public.loyalty_role(p_company text)
returns text
language sql stable security definer
set search_path = public
as $$
    select case
        when p_company is null then null
        when (select auth.uid()) is null then null
        else coalesce(
            (select case when m.role = 'owner' then 'owner' else coalesce(s.role, 'cashier') end
               from public.memberships m
               left join public.loyalty_staff s
                      on s.company_id = m.company_id and s.auth_user_id = m.auth_user_id
              where m.company_id = p_company
                and m.auth_user_id = (select auth.uid())::text
              limit 1),
            case when public.loyalty_es_admin() then 'platform_admin' end)
    end;
$$;

-- La matriz de permisos, en un solo sitio. Si cambia, cambia aquí.
create or replace function public.loyalty_role_can(p_role text, p_perm text)
returns boolean
language sql immutable
as $$
    select case p_role
        when 'platform_admin' then true
        when 'owner' then true
        when 'manager' then p_perm = any (array[
            'program.read', 'program.edit', 'members.read', 'members.create', 'members.manage',
            'contacts.read', 'ops.record', 'ops.redeem', 'ops.refund', 'devices.manage',
            'links.manage', 'campaigns.manage', 'metrics.read', 'wallet.manage'])
        when 'cashier' then p_perm = any (array[
            'program.read', 'members.read', 'members.create', 'ops.record', 'ops.redeem'])
        when 'analyst' then p_perm = any (array['program.read', 'metrics.read'])
        else false
    end;
$$;

create or replace function public.loyalty_can(p_company text, p_perm text)
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(public.loyalty_role_can(public.loyalty_role(p_company), p_perm), false) $$;

-- ¿Puede actuar en ESTA sucursal? Propietario y admin, en todas. Gerente y
-- cajero, en las de su lista (null = todas). Una operación sin sucursal solo la
-- puede hacer quien no está acotado.
create or replace function public.loyalty_can_at(p_company text, p_location uuid, p_perm text)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select public.loyalty_can(p_company, p_perm) and (
        public.loyalty_role(p_company) in ('owner', 'platform_admin')
        or coalesce((
            select s.location_ids is null or (p_location is not null and p_location = any (s.location_ids))
              from public.loyalty_staff s
             where s.company_id = p_company and s.auth_user_id = (select auth.uid())::text), true)
    );
$$;

-- Lanza 42501 si no. Toda RPC de escritura empieza por aquí.
create or replace function public.loyalty_require(p_company text, p_perm text, p_location uuid default null)
returns text
language plpgsql stable security definer
set search_path = public
as $$
declare
    v_role text := public.loyalty_role(p_company);
begin
    if v_role is null or not public.loyalty_role_can(v_role, p_perm) then
        raise exception 'loyalty:forbidden' using errcode = '42501', detail = p_perm;
    end if;
    if p_location is not null and not public.loyalty_can_at(p_company, p_location, p_perm) then
        raise exception 'loyalty:forbidden_location' using errcode = '42501', detail = p_perm;
    end if;
    return v_role;
end $$;

-- Auditoría. actor_kind distingue al admin de plataforma de un usuario normal.
create or replace function public.loyalty_audit(
    p_company text, p_action text, p_entity text, p_entity_id text, p_context jsonb default null,
    p_actor_kind text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
    v_uid text := (select auth.uid())::text;
    v_kind text := coalesce(p_actor_kind,
        case when v_uid is null then 'server'
             when public.loyalty_role(p_company) = 'platform_admin' then 'platform_admin'
             else 'user' end);
begin
    insert into public.loyalty_audit_log (company_id, actor, actor_kind, action, entity, entity_id, context)
    values (p_company, v_uid, v_kind, p_action, p_entity, p_entity_id, p_context);
end $$;

-- ── Clave del servidor ────────────────────────────────────────────────────────
-- Las RPC loyalty_srv_* las llama SOLO el servidor de Next (rutas públicas,
-- worker). Llevan la clave en la cabecera `x-fideliza-key`, que PostgREST deja
-- en request.headers. Aquí se compara su SHA-256 con loyalty_server_keys.
--
-- Por qué así y no con la service_role: la service_role abre TODO el esquema a
-- quien la tenga. Esta clave solo abre estas funciones, que validan sus
-- argumentos una a una. Una fuga es grave, pero acotada y rotable.
create or replace function public.loyalty_srv_check()
returns void
language plpgsql stable security definer
set search_path = public
as $$
declare
    v_key text;
begin
    begin
        v_key := nullif(current_setting('request.headers', true), '')::json ->> 'x-fideliza-key';
    exception when others then
        v_key := null;
    end;
    if v_key is null or char_length(v_key) < 32 or not exists (
        select 1 from public.loyalty_server_keys k
         where k.active and k.key_hash = sha256(convert_to(v_key, 'UTF8'))) then
        raise exception 'loyalty:server_key' using errcode = '42501';
    end if;
end $$;

-- ── Grants: de cero ───────────────────────────────────────────────────────────
-- ⚠️ Supabase da por defecto ALL a anon y authenticated sobre toda tabla nueva
-- de public. Sin estos revoke, `authenticated` podría hacer UPDATE en el ledger
-- (el RLS lo pararía, pero sería una sola capa). Se quita todo y se da SELECT.
do $$
declare t text;
begin
    foreach t in array array[
        'loyalty_server_keys', 'loyalty_settings', 'loyalty_locations', 'loyalty_staff',
        'loyalty_programs', 'loyalty_program_versions', 'loyalty_members', 'loyalty_contacts',
        'loyalty_consents', 'loyalty_transactions', 'loyalty_rewards', 'loyalty_redemptions',
        'loyalty_ledger', 'loyalty_wallet_classes', 'loyalty_wallet_passes', 'loyalty_link_profiles',
        'loyalty_links', 'loyalty_published_link_versions', 'loyalty_devices', 'loyalty_device_claims',
        'loyalty_public_events', 'loyalty_campaigns', 'loyalty_campaign_events',
        'loyalty_push_subscriptions', 'loyalty_outbox', 'loyalty_webhook_receipts',
        'loyalty_audit_log', 'loyalty_rate_limits']
    loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on public.%I from public, anon, authenticated', t);
    end loop;
end $$;

-- Lo que el panel lee. Ni las claves, ni los límites, ni los recibos, ni las
-- suscripciones push (llevan secretos del navegador del cliente).
grant select on
    public.loyalty_settings, public.loyalty_locations, public.loyalty_staff,
    public.loyalty_programs, public.loyalty_program_versions, public.loyalty_members,
    public.loyalty_contacts, public.loyalty_consents, public.loyalty_transactions,
    public.loyalty_rewards, public.loyalty_redemptions, public.loyalty_ledger,
    public.loyalty_wallet_classes, public.loyalty_wallet_passes, public.loyalty_link_profiles,
    public.loyalty_links, public.loyalty_published_link_versions, public.loyalty_devices,
    public.loyalty_device_claims, public.loyalty_public_events, public.loyalty_campaigns,
    public.loyalty_campaign_events, public.loyalty_outbox, public.loyalty_audit_log
to authenticated;

-- ── Políticas de lectura ──────────────────────────────────────────────────────
do $$
declare
    r record;
begin
    for r in select * from (values
        ('loyalty_settings',                'program.read'),
        ('loyalty_locations',               'program.read'),
        ('loyalty_programs',                'program.read'),
        ('loyalty_program_versions',        'program.read'),
        ('loyalty_members',                 'members.read'),
        ('loyalty_contacts',                'contacts.read'),
        ('loyalty_consents',                'members.read'),
        ('loyalty_rewards',                 'members.read'),
        ('loyalty_ledger',                  'members.read'),
        ('loyalty_wallet_classes',          'program.read'),
        ('loyalty_wallet_passes',           'members.read'),
        ('loyalty_link_profiles',           'program.read'),
        ('loyalty_links',                   'program.read'),
        ('loyalty_published_link_versions', 'program.read'),
        ('loyalty_device_claims',           'devices.manage'),
        ('loyalty_public_events',           'metrics.read'),
        ('loyalty_campaigns',               'program.read'),
        ('loyalty_campaign_events',         'metrics.read'),
        ('loyalty_outbox',                  'wallet.manage'),
        ('loyalty_audit_log',               'team.manage')
    ) as v(tabla, permiso)
    loop
        execute format('drop policy if exists p_%s_read on public.%I', r.tabla, r.tabla);
        execute format(
            'create policy p_%s_read on public.%I for select to authenticated using (public.loyalty_can(company_id, %L))',
            r.tabla, r.tabla, r.permiso);
    end loop;
end $$;

-- Transacciones y canjes: además, acotados a las sucursales del gerente/cajero.
drop policy if exists p_loyalty_transactions_read on public.loyalty_transactions;
create policy p_loyalty_transactions_read on public.loyalty_transactions
    for select to authenticated
    using (public.loyalty_can(company_id, 'metrics.read')
           or public.loyalty_can_at(company_id, location_id, 'members.read')
           or (location_id is null and public.loyalty_can(company_id, 'members.read')));

drop policy if exists p_loyalty_redemptions_read on public.loyalty_redemptions;
create policy p_loyalty_redemptions_read on public.loyalty_redemptions
    for select to authenticated
    using (public.loyalty_can(company_id, 'metrics.read')
           or public.loyalty_can_at(company_id, location_id, 'members.read')
           or (location_id is null and public.loyalty_can(company_id, 'members.read')));

-- Placas: las de la compañía. El inventario sin dueño solo lo ve el admin.
drop policy if exists p_loyalty_devices_read on public.loyalty_devices;
create policy p_loyalty_devices_read on public.loyalty_devices
    for select to authenticated
    using ((company_id is not null and public.loyalty_can(company_id, 'program.read'))
           or public.loyalty_es_admin());

-- El equipo: cada uno ve su propia fila; el propietario, las de su compañía.
drop policy if exists p_loyalty_staff_read on public.loyalty_staff;
create policy p_loyalty_staff_read on public.loyalty_staff
    for select to authenticated
    using (auth_user_id = (select auth.uid())::text or public.loyalty_can(company_id, 'team.manage'));

-- Sin políticas para server_keys, rate_limits, webhook_receipts ni
-- push_subscriptions: con RLS activo y sin política, nadie las lee desde la API.

-- ── Ejecutar funciones ────────────────────────────────────────────────────────
revoke execute on function public.loyalty_uid() from public, anon;
revoke execute on function public.loyalty_es_admin() from public, anon;
revoke execute on function public.loyalty_role(text) from public, anon;
revoke execute on function public.loyalty_role_can(text, text) from public, anon;
revoke execute on function public.loyalty_can(text, text) from public, anon;
revoke execute on function public.loyalty_can_at(text, uuid, text) from public, anon;
revoke execute on function public.loyalty_require(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.loyalty_audit(text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.loyalty_srv_check() from public, anon, authenticated;
revoke execute on function public.loyalty_ledger_inmutable() from public, anon, authenticated;
grant execute on function public.loyalty_role(text) to authenticated;
grant execute on function public.loyalty_can(text, text) to authenticated;
grant execute on function public.loyalty_can_at(text, uuid, text) to authenticated;
grant execute on function public.loyalty_role_can(text, text) to authenticated;
grant execute on function public.loyalty_es_admin() to authenticated;
grant execute on function public.loyalty_uid() to authenticated;
