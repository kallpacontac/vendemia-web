-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · 0028: «Trae a un amigo» y guardar la tarjeta con Google
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 26-nov-2026 (Alvaro, maqueta https://claude.ai/artifact/9BeiJ5K8c5zzGZwqgnNhh5):
--
-- TRAE A UN AMIGO
--   · loyalty_settings.amigos (jsonb): { activo, cada (1–5), premio, catalogo_id, regalo }.
--     `premio` es el texto que se entrega (del catálogo o escrito a mano); `catalogo_id` solo
--     recuerda de qué ítem salió. `regalo`: el amigo nuevo empieza con 1 sello.
--   · loyalty_amigo_codigos: el código de invitación de cada persona (6 letras). NO es el enlace
--     secreto de su tarjeta ni su código de caja: solo dice «me invitó Diego».
--   · loyalty_amigos: quién invitó a quién. `espera` al sacar la tarjeta; `contado` cuando el
--     amigo recibe su PRIMER sello (cualquier línea). Si en la caja se le quita (devolución o
--     «Restar sello») y se queda en cero, vuelve a `espera` y, si eso deshacía un premio aún sin
--     canjear, el premio se anula.
--   · Cada `cada` amigos contados, un premio (loyalty_rewards.origen = 'amigos'), sin tocar el
--     libro: no salen de sellos. Máximo 2 premios de amigos por persona al mes (hora de Lima).
--   · No cuenta: invitarse a sí mismo, el mismo celular que quien invita, un celular que ya tiene
--     otra tarjeta en el negocio, ni quien ya tenía la tarjeta antes.
--   · El conteo lo hace un trigger en loyalty_ledger: vale para la caja, el bono y lo que venga.
--
-- GUARDAR CON GOOGLE
--   · loyalty_member_google: la HUELLA (sha256 que calcula el servidor) del identificador de
--     Google, nada más: ni nombre, ni correo, ni foto. Una cuenta de Google, una tarjeta por
--     negocio. Recuperar = enlace nuevo para la tarjeta (el viejo deja de servir), como el
--     «Nuevo enlace de tarjeta» del panel.
--   · loyalty_srv_celular_en_uso: el alta avisa «ya hay una tarjeta con este celular» antes de
--     crear otra.
--
-- Necesita 0001–0019 (loyalty_persona). Idempotente.
-- Deshacer: scripts/fideliza-0028-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.loyalty_settings add column if not exists amigos jsonb not null default '{}'::jsonb;

alter table public.loyalty_rewards add column if not exists origen text;
alter table public.loyalty_rewards drop constraint if exists loyalty_rewards_origen_ck;
alter table public.loyalty_rewards add constraint loyalty_rewards_origen_ck check (origen is null or origen in ('amigos'));

create table if not exists public.loyalty_amigo_codigos (
    member_id   uuid primary key,
    company_id  text not null,
    codigo      text not null unique check (codigo ~ '^[A-HJKMNP-Z2-9]{6}$'),
    created_at  timestamptz not null default now(),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id) on delete cascade
);

create table if not exists public.loyalty_amigos (
    invitado_id   uuid primary key,
    company_id    text not null,
    invitador_id  uuid not null,
    estado        text not null default 'espera' check (estado in ('espera', 'contado')),
    created_at    timestamptz not null default now(),
    contado_at    timestamptz,
    reward_id     uuid,
    aviso         text check (aviso in ('vino', 'premio')),
    foreign key (company_id, invitado_id) references public.loyalty_members (company_id, id) on delete cascade,
    foreign key (company_id, invitador_id) references public.loyalty_members (company_id, id) on delete cascade
);
create index if not exists ix_loyalty_amigos_invitador on public.loyalty_amigos (invitador_id, estado);
create index if not exists ix_loyalty_amigos_company on public.loyalty_amigos (company_id, created_at desc);

create table if not exists public.loyalty_member_google (
    member_id   uuid primary key,
    company_id  text not null,
    huella      text not null check (huella ~ '^[0-9a-f]{64}$'),
    created_at  timestamptz not null default now(),
    unique (company_id, huella),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id) on delete cascade
);

alter table public.loyalty_amigo_codigos enable row level security;
alter table public.loyalty_amigos enable row level security;
alter table public.loyalty_member_google enable row level security;
revoke all on public.loyalty_amigo_codigos from public, anon, authenticated;
revoke all on public.loyalty_amigos from public, anon, authenticated;
revoke all on public.loyalty_member_google from public, anon, authenticated;

-- ── Configuración ─────────────────────────────────────────────────────────────
create or replace function public.loyalty_amigos_cfg(p_company text)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'activo', coalesce((a ->> 'activo')::boolean, false),
        'cada', least(greatest(coalesce((a ->> 'cada')::int, 2), 1), 5),
        'premio', coalesce(a ->> 'premio', ''),
        'catalogo_id', a ->> 'catalogo_id',
        'regalo', coalesce((a ->> 'regalo')::boolean, false))
      from (select coalesce((select s.amigos from public.loyalty_settings s where s.company_id = p_company), '{}'::jsonb) as a) x;
$$;

-- Prendido, con premio y con el club publicado.
create or replace function public.loyalty_amigos_vivo(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select (c ->> 'activo')::boolean and char_length(c ->> 'premio') >= 2
           and exists (select 1 from public.loyalty_programs p
                        where p.company_id = p_company and p.status = 'active' and p.parent_program_id is null)
      from (select public.loyalty_amigos_cfg(p_company) as c) x;
$$;

create or replace function public.loyalty_amigos_guardar(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_activo boolean;
    v_cada int;
    v_regalo boolean;
    v_premio text := btrim(coalesce(p_datos ->> 'premio', ''));
    v_cat text := nullif(btrim(coalesce(p_datos ->> 'catalogo_id', '')), '');
    v_cfg jsonb;
begin
    perform public.loyalty_require(p_company, 'program.edit');
    begin
        v_activo := coalesce((p_datos ->> 'activo')::boolean, false);
        v_regalo := coalesce((p_datos ->> 'regalo')::boolean, false);
        v_cada := coalesce((p_datos ->> 'cada')::int, 2);
    exception when others then
        perform public.loyalty_err('invalid_settings');
    end;
    if v_cada not between 1 and 5 or char_length(v_premio) > 80 or char_length(coalesce(v_cat, '')) > 64
       or (v_activo and char_length(v_premio) < 2) then
        perform public.loyalty_err('invalid_settings');
    end if;
    v_cfg := jsonb_build_object('activo', v_activo, 'cada', v_cada, 'premio', v_premio, 'catalogo_id', v_cat, 'regalo', v_regalo);
    update public.loyalty_settings set amigos = v_cfg, updated_at = now() where company_id = p_company;
    if not found then perform public.loyalty_err('not_found'); end if;
    perform public.loyalty_audit(p_company, 'amigos.guardar', 'loyalty_settings', p_company, v_cfg);
    return v_cfg;
end $$;

create or replace function public.loyalty_amigos_leer(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'program.read');
    return public.loyalty_amigos_cfg(p_company);
end $$;

-- Para Números: amigos que vinieron, invitaciones y premios ganados en el periodo.
create or replace function public.loyalty_amigos_resumen(p_company text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'metrics.read');
    return jsonb_build_object(
        'activo', (public.loyalty_amigos_cfg(p_company) ->> 'activo')::boolean,
        'traidos', (select count(*) from public.loyalty_amigos a
                     where a.company_id = p_company and a.estado = 'contado' and a.contado_at >= p_from and a.contado_at < p_to),
        'invitados', (select count(*) from public.loyalty_amigos a
                       where a.company_id = p_company and a.created_at >= p_from and a.created_at < p_to),
        'premios', (select count(*) from public.loyalty_rewards r
                     where r.company_id = p_company and r.origen = 'amigos' and r.status <> 'revoked'
                       and r.issued_at >= p_from and r.issued_at < p_to));
end $$;

-- ── El premio de quien invita ─────────────────────────────────────────────────
create or replace function public.loyalty_amigos_premiar(p_invitador uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    v public.loyalty_program_versions;
    c jsonb;
    v_cada int;
    v_mes int;
    v_libres int;
    v_rew uuid;
    n int := 0;
begin
    select * into m from public.loyalty_members where id = p_invitador for update;
    if not found or m.status <> 'active' or not public.loyalty_amigos_vivo(m.company_id) then return 0; end if;
    c := public.loyalty_amigos_cfg(m.company_id);
    v_cada := (c ->> 'cada')::int;
    v := public.loyalty_current_version(m.program_id);
    if v.id is null then return 0; end if;
    loop
        select count(*) into v_mes from public.loyalty_rewards r
         where r.member_id = m.id and r.origen = 'amigos' and r.status <> 'revoked'
           and r.issued_at >= (date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima');
        exit when v_mes >= 2;
        select count(*) into v_libres from public.loyalty_amigos a
         where a.invitador_id = m.id and a.estado = 'contado' and a.reward_id is null;
        exit when v_libres < v_cada;
        insert into public.loyalty_rewards (company_id, member_id, program_id, version_id, description, threshold, expires_at, origen)
        values (m.company_id, m.id, m.program_id, v.id, c ->> 'premio', v_cada,
                case when v.reward_valid_days is not null then now() + make_interval(days => v.reward_valid_days) end,
                'amigos')
        returning id into v_rew;
        update public.loyalty_amigos set reward_id = v_rew, aviso = 'premio'
         where invitado_id in (select a.invitado_id from public.loyalty_amigos a
                                where a.invitador_id = m.id and a.estado = 'contado' and a.reward_id is null
                                order by a.contado_at, a.invitado_id limit v_cada);
        update public.loyalty_members set rewards_available = rewards_available + 1, updated_at = now() where id = m.id;
        n := n + 1;
    end loop;
    if n > 0 then perform public.loyalty_enqueue_wallet(m.id); end if;
    return n;
end $$;

-- ── El trigger: el amigo cuenta con su primer sello y deja de contar si se queda en cero ──
create or replace function public.loyalty_amigos_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_persona uuid;
    a public.loyalty_amigos;
    rw public.loyalty_rewards;
    v_neto int;
begin
    if new.kind not in ('earn', 'reverse', 'adjust') or new.units = 0 then return null; end if;
    -- El sello de regalo del amigo no es una visita.
    if new.kind = 'adjust' and new.created_by = 'amigos' then return null; end if;
    select coalesce(m.parent_member_id, m.id) into v_persona from public.loyalty_members m where m.id = new.member_id;
    select * into a from public.loyalty_amigos where invitado_id = v_persona for update;
    if not found then return null; end if;

    if new.kind = 'earn' and new.units > 0 and a.estado = 'espera' then
        update public.loyalty_amigos set estado = 'contado', contado_at = now(), aviso = 'vino' where invitado_id = v_persona;
        perform public.loyalty_amigos_premiar(a.invitador_id);
    elsif new.units < 0 and a.estado = 'contado' then
        select coalesce(sum(l.units), 0) into v_neto
          from public.loyalty_ledger l join public.loyalty_members x on x.id = l.member_id
         where coalesce(x.parent_member_id, x.id) = v_persona
           and (l.kind in ('earn', 'reverse') or (l.kind = 'adjust' and l.created_by is distinct from 'amigos'));
        if v_neto > 0 then return null; end if;
        update public.loyalty_amigos set estado = 'espera', contado_at = null, aviso = null where invitado_id = v_persona;
        if a.reward_id is not null then
            select * into rw from public.loyalty_rewards where id = a.reward_id for update;
            -- Ya canjeado: no se puede deshacer, y este amigo no vuelve a contar para otro premio.
            if rw.status = 'available' then
                update public.loyalty_rewards set status = 'revoked', revoked_at = now() where id = rw.id;
                update public.loyalty_members set rewards_available = greatest(rewards_available - 1, 0), updated_at = now()
                 where id = rw.member_id;
                update public.loyalty_amigos set reward_id = null where reward_id = rw.id;
                perform public.loyalty_enqueue_wallet(rw.member_id);
                perform public.loyalty_audit(rw.company_id, 'amigos.premio_anulado', 'loyalty_rewards', rw.id::text, null, 'server');
            end if;
        end if;
    end if;
    return null;
end $$;

drop trigger if exists tr_loyalty_amigos_ledger on public.loyalty_ledger;
create trigger tr_loyalty_amigos_ledger after insert on public.loyalty_ledger
    for each row execute function public.loyalty_amigos_ledger();

-- ── La tarjeta del cliente ────────────────────────────────────────────────────
-- Lo que la tarjeta enseña aparte: si está guardada con Google y su «Trae a un amigo».
create or replace function public.loyalty_srv_tarjeta_extras(p_card_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    v_persona uuid;
    v_cod text;
    c jsonb;
    r jsonb := null;
begin
    perform public.loyalty_srv_check();
    select * into m from public.loyalty_members
     where card_token_hash = public.loyalty_hash(p_card_token) and status = 'active';
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    v_persona := coalesce(m.parent_member_id, m.id);
    if public.loyalty_amigos_vivo(m.company_id) then
        c := public.loyalty_amigos_cfg(m.company_id);
        select codigo into v_cod from public.loyalty_amigo_codigos where member_id = v_persona;
        for intento in 1 .. 6 loop
            exit when v_cod is not null;
            begin
                v_cod := public.loyalty_code_chars(6);
                insert into public.loyalty_amigo_codigos (member_id, company_id, codigo) values (v_persona, m.company_id, v_cod);
            exception when unique_violation then
                v_cod := null;
                select codigo into v_cod from public.loyalty_amigo_codigos where member_id = v_persona;
            end;
        end loop;
        r := jsonb_build_object(
            'codigo', v_cod, 'cada', c -> 'cada', 'premio', c ->> 'premio', 'regalo', c -> 'regalo',
            'invitados', (select count(*) from public.loyalty_amigos a where a.invitador_id = v_persona),
            'vinieron', (select count(*) from public.loyalty_amigos a where a.invitador_id = v_persona and a.estado = 'contado'),
            'avance', (select count(*) from public.loyalty_amigos a
                        where a.invitador_id = v_persona and a.estado = 'contado' and a.reward_id is null),
            'ganados', (select count(*) from public.loyalty_rewards x
                         where x.member_id = v_persona and x.origen = 'amigos' and x.status <> 'revoked'));
    end if;
    return jsonb_build_object(
        'status', 'ok',
        'slug', (select s.slug from public.loyalty_settings s where s.company_id = m.company_id),
        'google', exists (select 1 from public.loyalty_member_google g where g.member_id = v_persona),
        'amigos', r);
end $$;

-- ── El alta del amigo ─────────────────────────────────────────────────────────
-- Quién invita, para «Diego te invitó». Solo el nombre de pila.
create or replace function public.loyalty_srv_amigos_invita(p_slug text, p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    s public.loyalty_settings;
    v_alias text;
begin
    perform public.loyalty_srv_check();
    select * into s from public.loyalty_settings where slug = lower(p_slug);
    if not found or not public.loyalty_amigos_vivo(s.company_id) then return jsonb_build_object('status', 'apagado'); end if;
    select coalesce(nullif(split_part(btrim(coalesce(m.alias, '')), ' ', 1), ''), 'Un cliente') into v_alias
      from public.loyalty_amigo_codigos k join public.loyalty_members m on m.id = k.member_id and m.status = 'active'
     where k.company_id = s.company_id and k.codigo = upper(btrim(coalesce(p_codigo, '')));
    if v_alias is null then return jsonb_build_object('status', 'invalido'); end if;
    return jsonb_build_object('status', 'ok', 'invita', v_alias,
                              'regalo', (public.loyalty_amigos_cfg(s.company_id) -> 'regalo'));
end $$;

-- Recién creada la tarjeta (y con su celular ya puesto): se anota quién la invitó.
create or replace function public.loyalty_srv_amigo_anotar(p_card_token text, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    v public.loyalty_program_versions;
    v_inv uuid;
    v_tel text;
    v_bal int;
    v_regalo boolean := false;
begin
    perform public.loyalty_srv_check();
    select * into m from public.loyalty_members
     where card_token_hash = public.loyalty_hash(p_card_token) and status = 'active' and parent_member_id is null
     for update;
    if not found then return jsonb_build_object('status', 'invalido'); end if;
    if not public.loyalty_amigos_vivo(m.company_id) then return jsonb_build_object('status', 'apagado'); end if;
    select k.member_id into v_inv
      from public.loyalty_amigo_codigos k join public.loyalty_members x on x.id = k.member_id and x.status = 'active'
     where k.company_id = m.company_id and k.codigo = upper(btrim(coalesce(p_codigo, '')));
    if v_inv is null then return jsonb_build_object('status', 'invalido'); end if;
    if v_inv = m.id then return jsonb_build_object('status', 'mismo'); end if;
    -- Solo una tarjeta recién sacada, sin compras y sin otra invitación.
    if m.created_at < now() - interval '1 hour'
       or exists (select 1 from public.loyalty_amigos a where a.invitado_id = m.id)
       or exists (select 1 from public.loyalty_ledger l join public.loyalty_members x on x.id = l.member_id
                   where coalesce(x.parent_member_id, x.id) = m.id and l.kind = 'earn') then
        return jsonb_build_object('status', 'ya_cliente');
    end if;
    select value into v_tel from public.loyalty_contacts where member_id = m.id and kind = 'phone';
    if v_tel is not null then
        if exists (select 1 from public.loyalty_contacts c where c.member_id = v_inv and c.kind = 'phone' and c.value = v_tel) then
            return jsonb_build_object('status', 'mismo');
        end if;
        if exists (select 1 from public.loyalty_contacts c join public.loyalty_members x on x.id = c.member_id
                    where c.company_id = m.company_id and c.kind = 'phone' and c.value = v_tel
                      and c.member_id <> m.id and x.status <> 'deleted') then
            return jsonb_build_object('status', 'ya_cliente');
        end if;
    end if;
    insert into public.loyalty_amigos (invitado_id, company_id, invitador_id) values (m.id, m.company_id, v_inv);
    -- El sello de regalo: solo en tarjetas de sellos o visitas sin niveles del mes.
    if (public.loyalty_amigos_cfg(m.company_id) ->> 'regalo')::boolean then
        v := public.loyalty_current_version(m.program_id);
        if v.id is not null and v.rule_type in ('stamps', 'visits') and coalesce(v.period, 'none') = 'none' then
            update public.loyalty_members set balance = balance + 1, updated_at = now() where id = m.id
             returning balance into v_bal;
            insert into public.loyalty_ledger (company_id, member_id, program_id, kind, units, balance_after, created_by)
            values (m.company_id, m.id, m.program_id, 'adjust', 1, v_bal, 'amigos');
            perform public.loyalty_enqueue_wallet(m.id);
            v_regalo := true;
        end if;
    end if;
    perform public.loyalty_audit(m.company_id, 'amigos.anotar', 'loyalty_members', m.id::text,
                                 jsonb_build_object('invitador', v_inv, 'regalo', v_regalo), 'public');
    return jsonb_build_object('status', 'anotado', 'regalo', v_regalo);
end $$;

-- Tras cada sello en la caja: los avisos pendientes para quien invitó (y se marcan como dados).
create or replace function public.loyalty_srv_amigo_avisos(p_company text, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_persona uuid;
    v_cada int;
    r jsonb;
begin
    perform public.loyalty_srv_check();
    v_persona := public.loyalty_persona(p_company, p_member);
    if v_persona is null then return '[]'::jsonb; end if;
    v_cada := (public.loyalty_amigos_cfg(p_company) ->> 'cada')::int;
    -- RETURNING da el valor NUEVO (null): el aviso pendiente se lee antes, bloqueado.
    with o as (
        select a.invitado_id, a.aviso from public.loyalty_amigos a
         where a.invitado_id = v_persona and a.company_id = p_company and a.aviso is not null
         for update),
    x as (
        update public.loyalty_amigos a set aviso = null from o
         where a.invitado_id = o.invitado_id
        returning a.invitador_id, o.aviso, a.reward_id)
    select coalesce(jsonb_agg(jsonb_build_object(
               'invitador_id', x.invitador_id,
               'aviso', x.aviso,
               'invitado', (select coalesce(nullif(split_part(btrim(coalesce(i.alias, '')), ' ', 1), ''), 'Tu amigo')
                             from public.loyalty_members i where i.id = v_persona),
               'premio', case when x.aviso = 'premio' then (select w.description from public.loyalty_rewards w where w.id = x.reward_id) end,
               'premio_siguiente', public.loyalty_amigos_cfg(p_company) ->> 'premio',
               'faltan', greatest(v_cada - (select count(*) from public.loyalty_amigos b
                                             where b.invitador_id = x.invitador_id and b.estado = 'contado' and b.reward_id is null), 0))),
           '[]'::jsonb) into r
      from x;
    return r;
end $$;

-- ── Guardar con Google ────────────────────────────────────────────────────────
create or replace function public.loyalty_srv_google_vincular(p_card_token text, p_huella text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    v_persona uuid;
begin
    perform public.loyalty_srv_check();
    if coalesce(p_huella, '') !~ '^[0-9a-f]{64}$' then perform public.loyalty_err('invalid_input'); end if;
    select * into m from public.loyalty_members where card_token_hash = public.loyalty_hash(p_card_token) and status = 'active';
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    v_persona := coalesce(m.parent_member_id, m.id);
    -- La misma cuenta de Google en otra tarjeta del negocio se mueve a esta.
    delete from public.loyalty_member_google where company_id = m.company_id and huella = p_huella and member_id <> v_persona;
    insert into public.loyalty_member_google (member_id, company_id, huella) values (v_persona, m.company_id, p_huella)
    on conflict (member_id) do update set huella = excluded.huella, created_at = now();
    perform public.loyalty_audit(m.company_id, 'member.google', 'loyalty_members', v_persona::text, null, 'public');
    return jsonb_build_object('status', 'ok');
end $$;

create or replace function public.loyalty_srv_google_recuperar(p_slug text, p_huella text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    s public.loyalty_settings;
    v_member uuid;
    v_token text := public.loyalty_b64url(public.loyalty_random_bytes(24));
begin
    perform public.loyalty_srv_check();
    if coalesce(p_huella, '') !~ '^[0-9a-f]{64}$' then perform public.loyalty_err('invalid_input'); end if;
    select * into s from public.loyalty_settings where slug = lower(p_slug);
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    select g.member_id into v_member
      from public.loyalty_member_google g join public.loyalty_members x on x.id = g.member_id and x.status = 'active'
     where g.company_id = s.company_id and g.huella = p_huella;
    if v_member is null then return jsonb_build_object('status', 'sin_tarjeta'); end if;
    update public.loyalty_members set card_token_hash = public.loyalty_hash(v_token), updated_at = now() where id = v_member;
    perform public.loyalty_audit(s.company_id, 'member.recover_google', 'loyalty_members', v_member::text, null, 'public');
    return jsonb_build_object('status', 'ok', 'card_token', v_token);
end $$;

-- El alta pregunta antes de crear una segunda tarjeta con el mismo celular.
create or replace function public.loyalty_srv_celular_en_uso(p_slug text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    s public.loyalty_settings;
    v_tel text;
    v_member uuid;
begin
    perform public.loyalty_srv_check();
    select * into s from public.loyalty_settings where slug = lower(p_slug);
    if not found then return jsonb_build_object('existe', false); end if;
    begin
        v_tel := public.loyalty_norm_phone(p_phone);
    exception when others then
        return jsonb_build_object('existe', false);
    end;
    select c.member_id into v_member
      from public.loyalty_contacts c join public.loyalty_members x on x.id = c.member_id
     where c.company_id = s.company_id and c.kind = 'phone' and c.value = v_tel
       and x.status = 'active' and x.parent_member_id is null
     order by x.created_at limit 1;
    return jsonb_build_object('existe', v_member is not null,
                              'google', v_member is not null and exists (select 1 from public.loyalty_member_google g where g.member_id = v_member));
end $$;

-- ── Permisos ──────────────────────────────────────────────────────────────────
revoke execute on function public.loyalty_amigos_cfg(text) from public, anon, authenticated;
revoke execute on function public.loyalty_amigos_vivo(text) from public, anon, authenticated;
revoke execute on function public.loyalty_amigos_premiar(uuid) from public, anon, authenticated;
revoke execute on function public.loyalty_amigos_ledger() from public, anon, authenticated;
revoke execute on function public.loyalty_amigos_guardar(text, jsonb) from public, anon;
grant execute on function public.loyalty_amigos_guardar(text, jsonb) to authenticated;
revoke execute on function public.loyalty_amigos_leer(text) from public, anon;
grant execute on function public.loyalty_amigos_leer(text) to authenticated;
revoke execute on function public.loyalty_amigos_resumen(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.loyalty_amigos_resumen(text, timestamptz, timestamptz) to authenticated;
-- El servidor de Fideliza llama con la clave anon + x-fideliza-key (loyalty_srv_check).
revoke execute on function public.loyalty_srv_tarjeta_extras(text) from public, authenticated;
grant execute on function public.loyalty_srv_tarjeta_extras(text) to anon;
revoke execute on function public.loyalty_srv_amigos_invita(text, text) from public, authenticated;
grant execute on function public.loyalty_srv_amigos_invita(text, text) to anon;
revoke execute on function public.loyalty_srv_amigo_anotar(text, text) from public, authenticated;
grant execute on function public.loyalty_srv_amigo_anotar(text, text) to anon;
revoke execute on function public.loyalty_srv_amigo_avisos(text, uuid) from public, authenticated;
grant execute on function public.loyalty_srv_amigo_avisos(text, uuid) to anon;
revoke execute on function public.loyalty_srv_google_vincular(text, text) from public, authenticated;
grant execute on function public.loyalty_srv_google_vincular(text, text) to anon;
revoke execute on function public.loyalty_srv_google_recuperar(text, text) from public, authenticated;
grant execute on function public.loyalty_srv_google_recuperar(text, text) to anon;
revoke execute on function public.loyalty_srv_celular_en_uso(text, text) from public, authenticated;
grant execute on function public.loyalty_srv_celular_en_uso(text, text) to anon;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí, sí, sí».
select to_regprocedure('public.loyalty_amigos_guardar(text,jsonb)') is not null as amigos,
       to_regprocedure('public.loyalty_srv_tarjeta_extras(text)') is not null as tarjeta,
       to_regprocedure('public.loyalty_srv_google_recuperar(text,text)') is not null as google;
