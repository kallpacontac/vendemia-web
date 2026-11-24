-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · 0026: pedir la reseña de Google y la nota del cliente
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 24-nov-2026 (Alvaro): «por correo y por notificación si tiene la tarjeta de Fideliza, un aviso
-- configurable y con un link para dejar reseña en Google directo, nomás». Y en Clientes, editar
-- los datos del cliente con lo clave (cumpleaños, correo) y otros opcionales.
--
--   · loyalty_settings.resena (jsonb): { activo, visita (1|2), titulo, texto, url, en_tarjeta, desde }.
--     `en_tarjeta`: el botón «Déjanos tu reseña» en la tarjeta del cliente, si el dueño lo quiere.
--     `desde` es cuándo se prendió: solo se pide a quien hizo esa visita DESPUÉS, para que
--     prenderlo no le escriba de golpe a todos los clientes antiguos.
--   · loyalty_resena_pedidos: a quién ya se le pidió. UNA sola vez por cliente, para siempre.
--   · loyalty_resena_guardar / _leer (panel, campaigns.manage / program.read).
--   · loyalty_srv_resenas_hoy (cron, 9:00 Lima): quienes hicieron su 1.ª (o 2.ª) visita antes de
--     hoy y en los últimos 7 días, y tienen por dónde recibirlo (avisos aceptados o correo). Los
--     marca y los devuelve; el aviso y el correo los manda servidor/avisos.ts. Sin premio por
--     reseñar y a todos por igual: lo que pide la política de Google.
--   · loyalty_srv_resena_tarjeta (tarjeta del cliente): el enlace si `en_tarjeta`.
--   · loyalty_member_notas + loyalty_member_nota_get / _set: una nota libre por persona
--     («degradado bajo, con barba»), aparte de loyalty_members como el cumpleaños (0019).
--
-- Necesita la 0017 (líneas: loyalty_persona viene de la 0019) y la 0019. Idempotente.
-- Deshacer: scripts/fideliza-0026-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.loyalty_settings add column if not exists resena jsonb not null default '{}'::jsonb;

create table if not exists public.loyalty_resena_pedidos (
    member_id   uuid primary key,
    company_id  text not null,
    enviado_at  timestamptz not null default now()
);
create index if not exists ix_loyalty_resena_pedidos_company on public.loyalty_resena_pedidos (company_id, enviado_at desc);
alter table public.loyalty_resena_pedidos enable row level security;
revoke all on public.loyalty_resena_pedidos from anon, authenticated;

create table if not exists public.loyalty_member_notas (
    member_id   uuid primary key,
    company_id  text not null,
    nota        text not null check (char_length(nota) between 1 and 280),
    set_by      text,
    updated_at  timestamptz not null default now(),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id) on delete cascade
);
alter table public.loyalty_member_notas enable row level security;
revoke all on public.loyalty_member_notas from anon, authenticated;

-- ── Reseña: guardar y leer (panel) ─────────────────────────────────────────

-- Solo enlaces de Google: el aviso abre esto directo en el celular del cliente.
create or replace function public.loyalty_resena_url_ok(p_url text)
returns boolean language sql immutable as $$
    select p_url ~ '^https://((search|www|maps)\.)?(google\.(com|[a-z]{2})(\.[a-z]{2})?|g\.page|maps\.app\.goo\.gl|g\.co)/[^\s<>"'']*$'
       and char_length(p_url) <= 500;
$$;

create or replace function public.loyalty_resena_guardar(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_antes  jsonb;
    v_activo boolean := coalesce((p_datos ->> 'activo')::boolean, false);
    v_visita integer := coalesce((p_datos ->> 'visita')::integer, 1);
    v_titulo text := btrim(coalesce(p_datos ->> 'titulo', ''));
    v_texto  text := btrim(coalesce(p_datos ->> 'texto', ''));
    v_url    text := btrim(coalesce(p_datos ->> 'url', ''));
    v_tarjeta boolean := coalesce((p_datos ->> 'en_tarjeta')::boolean, false);
    v_desde  text;
    v_nuevo  jsonb;
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    if v_visita not in (1, 2) then perform public.loyalty_err('invalid_settings'); end if;
    if char_length(v_titulo) not between 1 and 60 or char_length(v_texto) not between 1 and 160 then
        perform public.loyalty_err('invalid_settings');
    end if;
    if v_url <> '' and not public.loyalty_resena_url_ok(v_url) then perform public.loyalty_err('invalid_url'); end if;
    if (v_activo or v_tarjeta) and v_url = '' then perform public.loyalty_err('invalid_url'); end if;
    select resena into v_antes from public.loyalty_settings where company_id = p_company for update;
    if not found then perform public.loyalty_err('not_found'); end if;
    -- Al prenderlo empieza a contar desde ahora; si ya estaba prendido, conserva su fecha.
    v_desde := case when coalesce((v_antes ->> 'activo')::boolean, false) and v_antes ->> 'desde' is not null
                    then v_antes ->> 'desde' else now()::text end;
    v_nuevo := jsonb_build_object(
        'activo', v_activo, 'visita', v_visita, 'titulo', v_titulo, 'texto', v_texto, 'url', v_url,
        'en_tarjeta', v_tarjeta, 'desde', v_desde);
    update public.loyalty_settings set resena = v_nuevo where company_id = p_company;
    perform public.loyalty_audit(p_company, 'settings.resena', 'loyalty_settings', p_company, v_nuevo);
    return v_nuevo;
end $$;

create or replace function public.loyalty_resena_leer(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'program.read');
    return jsonb_build_object(
        'config', (select resena from public.loyalty_settings where company_id = p_company),
        'enviados_30', (select count(*) from public.loyalty_resena_pedidos
                         where company_id = p_company and enviado_at > now() - interval '30 days'),
        'enviados', (select count(*) from public.loyalty_resena_pedidos where company_id = p_company));
end $$;

-- ── Reseña: el cron ─────────────────────────────────────────────────────────
create or replace function public.loyalty_srv_resenas_hoy()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_hoy   timestamptz := (date_trunc('day', now() at time zone 'America/Lima')) at time zone 'America/Lima';
    v_lista jsonb;
begin
    perform public.loyalty_srv_check();
    with negocios as (
        select s.company_id, s.display_name, s.resena,
               (s.resena ->> 'visita')::int as visita, (s.resena ->> 'desde')::timestamptz as desde
          from public.loyalty_settings s
         where coalesce((s.resena ->> 'activo')::boolean, false)
           and coalesce(s.resena ->> 'url', '') <> ''
    ), candidatos as (
        -- Solo la persona (una línea de la 0017 apunta a ella) y solo quien vino hace poco.
        select m.id, m.company_id, n.visita, n.desde, n.display_name, n.resena
          from negocios n
          join public.loyalty_members m on m.company_id = n.company_id
         where m.status = 'active' and m.parent_member_id is null
           and m.last_op_at > now() - interval '8 days'
           and not exists (select 1 from public.loyalty_resena_pedidos p where p.member_id = m.id)
    ), con_visita as (
        select c.*,
               (select t.created_at from public.loyalty_transactions t
                 where t.company_id = c.company_id
                   and t.kind in ('purchase', 'visit')
                   and (t.member_id = c.id or t.member_id in (select x.id from public.loyalty_members x where x.parent_member_id = c.id))
                 order by t.created_at offset c.visita - 1 limit 1) as la_visita,
               (select ct.value from public.loyalty_contacts ct where ct.member_id = c.id and ct.kind = 'email') as email,
               (public.loyalty_consents_now(c.id, 'push')
                 and exists (select 1 from public.loyalty_push_subscriptions ps where ps.member_id = c.id and ps.revoked_at is null)) as con_push
          from candidatos c
    ), hoy as (
        select * from con_visita
         where la_visita is not null and la_visita >= desde and la_visita < v_hoy
           and la_visita > now() - interval '7 days'
           and (con_push or email is not null)
         limit 500
    ), marcados as (
        insert into public.loyalty_resena_pedidos (member_id, company_id)
        select id, company_id from hoy
        on conflict do nothing
        returning member_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
               'company_id', h.company_id, 'member_id', h.id, 'negocio', h.display_name,
               'titulo', h.resena ->> 'titulo', 'texto', h.resena ->> 'texto', 'url', h.resena ->> 'url',
               'email', h.email, 'push', h.con_push)), '[]'::jsonb)
      into v_lista
      from hoy h join marcados k on k.member_id = h.id;
    return v_lista;
end $$;

-- El botón «Dejar mi reseña» de la tarjeta del cliente: el enlace si el dueño lo quiere ahí.
-- Aparte de loyalty_srv_card (que reescribe la 0024) para no tocarla.
create or replace function public.loyalty_srv_resena_tarjeta(p_slug text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    return (select s.resena ->> 'url' from public.loyalty_settings s
             where s.slug = p_slug
               and coalesce((s.resena ->> 'en_tarjeta')::boolean, false)
               and public.loyalty_resena_url_ok(s.resena ->> 'url'));
end $$;

-- ── La nota del cliente ─────────────────────────────────────────────────────
create or replace function public.loyalty_member_nota_get(p_company text, p_member uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_persona uuid;
begin
    perform public.loyalty_require(p_company, 'members.read');
    v_persona := public.loyalty_persona(p_company, p_member);
    if v_persona is null then perform public.loyalty_err('not_found'); end if;
    return (select nota from public.loyalty_member_notas where member_id = v_persona);
end $$;

-- '' o null la borra.
create or replace function public.loyalty_member_nota_set(p_company text, p_member uuid, p_nota text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_persona uuid;
    v_nota    text := btrim(coalesce(p_nota, ''));
begin
    perform public.loyalty_require(p_company, 'members.manage');
    v_persona := public.loyalty_persona(p_company, p_member);
    if v_persona is null then perform public.loyalty_err('not_found'); end if;
    if char_length(v_nota) > 280 then perform public.loyalty_err('invalid_settings'); end if;
    if v_nota = '' then
        delete from public.loyalty_member_notas where member_id = v_persona;
    else
        insert into public.loyalty_member_notas (member_id, company_id, nota, set_by)
        values (v_persona, p_company, v_nota, (select auth.uid())::text)
        on conflict (member_id) do update set nota = excluded.nota, set_by = excluded.set_by, updated_at = now();
    end if;
    perform public.loyalty_audit(p_company, 'member.nota', 'loyalty_members', v_persona::text, null);
    return jsonb_build_object('status', 'ok', 'nota', nullif(v_nota, ''));
end $$;

revoke execute on function public.loyalty_resena_url_ok(text) from public, anon;
grant execute on function public.loyalty_resena_url_ok(text) to authenticated;
revoke execute on function public.loyalty_resena_guardar(text, jsonb) from public, anon;
grant execute on function public.loyalty_resena_guardar(text, jsonb) to authenticated;
revoke execute on function public.loyalty_resena_leer(text) from public, anon;
grant execute on function public.loyalty_resena_leer(text) to authenticated;
revoke execute on function public.loyalty_srv_resenas_hoy() from public, authenticated;
-- El servidor de Fideliza llama con la clave anon + x-fideliza-key (loyalty_srv_check), como el cumpleaños.
grant execute on function public.loyalty_srv_resenas_hoy() to anon;
revoke execute on function public.loyalty_srv_resena_tarjeta(text) from public, authenticated;
grant execute on function public.loyalty_srv_resena_tarjeta(text) to anon;
revoke execute on function public.loyalty_member_nota_get(text, uuid) from public, anon;
grant execute on function public.loyalty_member_nota_get(text, uuid) to authenticated;
revoke execute on function public.loyalty_member_nota_set(text, uuid, text) from public, anon;
grant execute on function public.loyalty_member_nota_set(text, uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí, sí, sí».
select to_regprocedure('public.loyalty_resena_guardar(text,jsonb)') is not null as resena,
       to_regprocedure('public.loyalty_srv_resenas_hoy()') is not null as resena_cron,
       to_regprocedure('public.loyalty_member_nota_set(text,uuid,text)') is not null as nota;
