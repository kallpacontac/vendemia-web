-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0039: «Generar ticket» con hasta DOS fotos y su ajuste (sin foto / opcional / obligatoria)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 26-nov-2026 (The 24/7): «el adjuntar foto no me aparece al generar ticket, debería ser un solo
-- botón para adjuntar solo dos fotos, y la configuración tampoco».
--
--   · ticket_fotos sigue siendo UNA fila por cita (la 0037); la segunda foto va en url_2/hash_2.
--     Así lector 0002 (lector_esperando, el trigger lector_foto) sigue viendo un ticket por cita.
--   · mi_agenda_ticket_foto(…, p_orden): 1 = la primera (como la 0037), 2 = la segunda. La de
--     4 argumentos sigue (orden 1) para el servidor de antes de este cambio.
--   · cobro_ajustes.ticket_foto: 'apagada' | 'opcional' (de serie: como hasta hoy) | 'obligatoria'.
--     ticket_foto_modo lo lee cualquiera del negocio (Mi agenda); ticket_foto_guardar, dueño o admin.
--     «Obligatoria» la exige el formulario: la foto se sube DESPUÉS de crear el ticket.
--
-- Necesita tu-pagina 0037 (ticket_fotos) y datos 0010 (cobro_ajustes, rol_en). Idempotente.
-- Deshacer: 0039_ticket_dos_fotos_deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · La segunda foto ─────────────────────────────────────────────────────────
alter table public.ticket_fotos add column if not exists url_2  text;
alter table public.ticket_fotos add column if not exists hash_2 text not null default '';
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'ticket_fotos_url_2_chk') then
        alter table public.ticket_fotos add constraint ticket_fotos_url_2_chk
            check (url_2 is null or (url_2 ~ '^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/' and length(url_2) <= 500));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ticket_fotos_hash_2_chk') then
        alter table public.ticket_fotos add constraint ticket_fotos_hash_2_chk check (hash_2 ~ '^[0-9a-f]{0,64}$');
    end if;
end $$;

create or replace function public.mi_agenda_ticket_foto(p_company text, p_cita text, p_url text, p_hash text, p_orden integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol  text;
    v_cita public.appointments;
    v_hash text := lower(coalesce(p_hash, ''));
begin
    v_rol := public.v2_autorizar_agenda(p_company, true);
    select * into v_cita from public.appointments where company_id = p_company and id = p_cita;
    if not found then raise exception 'Esa cita no es de este negocio.' using errcode = '42501'; end if;
    if v_rol = 'empleado' and coalesce(v_cita.employee_id, '') is distinct from coalesce(public.mi_empleado(p_company), '-') then
        raise exception 'Solo puedes adjuntar la foto a tus propios tickets.' using errcode = '42501';
    end if;
    if coalesce(p_url, '') !~ '^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/' or length(p_url) > 500 then
        raise exception 'La foto no se guardó bien. Vuelve a subirla.' using errcode = '22023';
    end if;
    if p_orden is null or p_orden not in (1, 2) then
        raise exception 'Son dos fotos como mucho.' using errcode = '22023';
    end if;
    -- La segunda, si ya hay primera; si la primera no llegó, esta ocupa su sitio.
    if p_orden = 2 and exists (select 1 from public.ticket_fotos where appointment_id = v_cita.id) then
        update public.ticket_fotos set url_2 = p_url, hash_2 = v_hash where appointment_id = v_cita.id;
        return jsonb_build_object('status', 'ok', 'url', p_url, 'orden', 2);
    end if;
    insert into public.ticket_fotos (appointment_id, company_id, url, hash, subida_por)
    values (v_cita.id, p_company, p_url, v_hash, coalesce((select auth.uid())::text, ''))
    on conflict (appointment_id) do update
        set url = excluded.url, hash = excluded.hash, subida_por = excluded.subida_por, created_at = now();
    return jsonb_build_object('status', 'ok', 'url', p_url, 'orden', 1);
end $$;
revoke all on function public.mi_agenda_ticket_foto(text, text, text, text, integer) from public, anon;
grant execute on function public.mi_agenda_ticket_foto(text, text, text, text, integer) to authenticated;

-- La de la 0037 (4 argumentos) = la primera foto.
create or replace function public.mi_agenda_ticket_foto(p_company text, p_cita text, p_url text, p_hash text default '')
returns jsonb language sql security definer set search_path = public as $$
    select public.mi_agenda_ticket_foto(p_company, p_cita, p_url, p_hash, 1);
$$;
revoke all on function public.mi_agenda_ticket_foto(text, text, text, text) from public, anon;
grant execute on function public.mi_agenda_ticket_foto(text, text, text, text) to authenticated;

-- ── 2 · El ajuste ───────────────────────────────────────────────────────────────
alter table public.cobro_ajustes add column if not exists ticket_foto text not null default 'opcional';
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'cobro_ajustes_ticket_foto_chk') then
        alter table public.cobro_ajustes add constraint cobro_ajustes_ticket_foto_chk
            check (ticket_foto in ('apagada', 'opcional', 'obligatoria'));
    end if;
end $$;

create or replace function public.ticket_foto_modo(p_company text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
    if public.rol_en(p_company) is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    return coalesce((select ticket_foto from public.cobro_ajustes where company_id = p_company), 'opcional');
end $$;
revoke all on function public.ticket_foto_modo(text) from public, anon;
grant execute on function public.ticket_foto_modo(text) to authenticated;

create or replace function public.ticket_foto_guardar(p_company text, p_modo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.rol_en(p_company);
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('dueno', 'admin') then
        raise exception 'Esto lo cambia el dueño o el administrador del negocio.' using errcode = '42501';
    end if;
    if p_modo is null or p_modo not in ('apagada', 'opcional', 'obligatoria') then
        raise exception 'Elige: sin foto, opcional u obligatoria.' using errcode = '22023';
    end if;
    insert into public.cobro_ajustes (company_id, ticket_foto, actualizado_por, actualizado_at)
    values (p_company, p_modo, (select auth.uid()), now())
    on conflict (company_id) do update
       set ticket_foto = excluded.ticket_foto, actualizado_por = excluded.actualizado_por, actualizado_at = now();
    return jsonb_build_object('status', 'ok', 'modo', p_modo);
end $$;
revoke all on function public.ticket_foto_guardar(text, text) from public, anon;
grant execute on function public.ticket_foto_guardar(text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: debe decir true, true, true.
select to_regprocedure('public.mi_agenda_ticket_foto(text, text, text, text, integer)') is not null as dos_fotos,
       to_regprocedure('public.ticket_foto_modo(text)') is not null as ajuste,
       exists (select 1 from information_schema.columns where table_name = 'ticket_fotos' and column_name = 'url_2') as columna;
