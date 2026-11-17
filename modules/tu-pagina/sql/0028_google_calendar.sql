-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0028 · Conectar el Google Calendar del negocio (tipo Calendly)
--
-- Pedido de Alvaro (16-nov-2026): que lo que se agenda desde la página caiga en su
-- Google Calendar y que las horas en que ya está ocupado allí no se ofrezcan.
--
--   · google_calendar: una fila por negocio con la cuenta conectada y su token de
--     renovación CIFRADO (AES-GCM en el servidor web; aquí nunca está en claro).
--   · El panel (dueño o admin, tu_pagina_autorizar) ve el estado, enciende el
--     enlace de Meet y desconecta. Nunca ve el token.
--   · El servidor web (clave anon + x-fideliza-key, loyalty_srv_check) guarda el
--     token al volver de Google, lo lee para consultar «ocupado» y crear la cita
--     en el calendario, y apunta el último error.
--
-- Idempotente: se puede correr dos veces.
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

create table if not exists public.google_calendar (
    company_id    text primary key references public.companies(id) on delete cascade,
    cuenta        text not null check (char_length(cuenta) <= 200),
    token_cifrado text not null check (char_length(token_cifrado) <= 2000),
    calendario    text not null default 'primary' check (char_length(calendario) <= 200),
    con_meet      boolean not null default false,
    conectado_por uuid,
    conectado_at  timestamptz not null default now(),
    error         text check (error is null or char_length(error) <= 300),
    error_at      timestamptz
);

-- Solo se toca por las funciones de abajo.
alter table public.google_calendar enable row level security;
revoke all on table public.google_calendar from public, anon, authenticated;

-- ── Panel ────────────────────────────────────────────────────────────────────

create or replace function public.gcal_panel(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    g public.google_calendar;
begin
    perform public.tu_pagina_autorizar(p_company);
    select * into g from public.google_calendar where company_id = p_company;
    if not found then return jsonb_build_object('conectado', false); end if;
    return jsonb_build_object('conectado', true, 'cuenta', g.cuenta, 'con_meet', g.con_meet,
                              'conectado_at', g.conectado_at, 'error', g.error, 'error_at', g.error_at);
end $$;

create or replace function public.gcal_meet(p_company text, p_si boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.tu_pagina_autorizar(p_company);
    update public.google_calendar set con_meet = coalesce(p_si, false) where company_id = p_company;
end $$;

-- ── Servidor web ─────────────────────────────────────────────────────────────

create or replace function public.gcal_srv_guardar(p_company text, p_usuario uuid, p_cuenta text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    if not exists (select 1 from public.companies where id = p_company) then
        return jsonb_build_object('status', 'not_found');
    end if;
    insert into public.google_calendar (company_id, cuenta, token_cifrado, conectado_por)
    values (p_company, left(coalesce(p_cuenta, ''), 200), p_token, p_usuario)
    on conflict (company_id) do update
       set cuenta = excluded.cuenta, token_cifrado = excluded.token_cifrado,
           conectado_por = excluded.conectado_por, conectado_at = now(), error = null, error_at = null;
    return jsonb_build_object('status', 'ok');
end $$;

-- Por el slug de la página publicada: lo usan la página (horas ocupadas) y la reserva (crear la cita).
create or replace function public.gcal_srv_de(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_company text;
    g public.google_calendar;
begin
    perform public.loyalty_srv_check();
    select company_id into v_company from public.tu_pagina where slug = lower(p_slug) and publicada;
    if v_company is null then return jsonb_build_object('status', 'no'); end if;
    select * into g from public.google_calendar where company_id = v_company;
    if not found then return jsonb_build_object('status', 'no'); end if;
    return jsonb_build_object('status', 'ok', 'company_id', g.company_id, 'token', g.token_cifrado,
                              'calendario', g.calendario, 'con_meet', g.con_meet);
end $$;

-- Para desconectar: el servidor revoca el token en Google y luego borra la fila.
create or replace function public.gcal_srv_token(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_token text;
begin
    perform public.loyalty_srv_check();
    select token_cifrado into v_token from public.google_calendar where company_id = p_company;
    return case when v_token is null then jsonb_build_object('status', 'no')
                else jsonb_build_object('status', 'ok', 'token', v_token) end;
end $$;

create or replace function public.gcal_srv_borrar(p_company text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    delete from public.google_calendar where company_id = p_company;
end $$;

-- El último fallo (token revocado, calendario borrado…): el panel lo enseña. null = todo bien.
create or replace function public.gcal_srv_error(p_company text, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    update public.google_calendar
       set error = left(p_error, 300), error_at = case when p_error is null then null else now() end
     where company_id = p_company and error is distinct from left(p_error, 300);
end $$;

revoke execute on function public.gcal_panel(text) from public, anon;
revoke execute on function public.gcal_meet(text, boolean) from public, anon;
grant execute on function public.gcal_panel(text) to authenticated;
grant execute on function public.gcal_meet(text, boolean) to authenticated;

revoke execute on function public.gcal_srv_guardar(text, uuid, text, text) from public, authenticated;
revoke execute on function public.gcal_srv_de(text) from public, authenticated;
revoke execute on function public.gcal_srv_token(text) from public, authenticated;
revoke execute on function public.gcal_srv_borrar(text) from public, authenticated;
revoke execute on function public.gcal_srv_error(text, text) from public, authenticated;
grant execute on function public.gcal_srv_guardar(text, uuid, text, text) to anon;
grant execute on function public.gcal_srv_de(text) to anon;
grant execute on function public.gcal_srv_token(text) to anon;
grant execute on function public.gcal_srv_borrar(text) to anon;
grant execute on function public.gcal_srv_error(text, text) to anon;

commit;
