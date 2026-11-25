-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0037: «Generar ticket» del barbero con foto opcional
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 25-nov-2026 (The 24/7): el botón «Llegó sin cita» de Mi agenda pasa a llamarse «Generar ticket»
-- y su formulario admite, opcional, la foto del voucher (el Yape que le enseñó el cliente) o del
-- ticket de papel. La foto NO es un cobro: no registra pago ni toca la caja. Queda pegada a la
-- cita para que quien cobra la vea en «Listos para cobrar» y compare.
--
--   · ticket_fotos: una foto por cita (la última manda). La URL es de Cloudinary (la sube
--     /api/agenda/foto-ticket con la sesión del panel; la clave no sale del servidor).
--   · mi_agenda_ticket_foto: la guarda. El barbero, solo en SUS citas; dueño y admin, en cualquiera
--     de su negocio. Misma puerta que «Llegó sin cita» (v2_autorizar_agenda con empleado).
--   · Leer: cualquiera del negocio (RLS por rol_en), que es quien ve la Caja.
--
-- Necesita datos 0004 (v2_autorizar_agenda, rol_en) y tu-pagina 0026 (mi_empleado). Idempotente.
-- Deshacer: 0037_foto_del_ticket_deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.ticket_fotos (
    appointment_id text primary key,
    company_id     text not null,
    url            text not null check (url ~ '^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/' and length(url) <= 500),
    hash           text not null default '' check (hash ~ '^[0-9a-f]{0,64}$'),
    subida_por     text not null default '',
    created_at     timestamptz not null default now()
);
create index if not exists ticket_fotos_company on public.ticket_fotos (company_id, created_at desc);

alter table public.ticket_fotos enable row level security;
drop policy if exists ticket_fotos_leer on public.ticket_fotos;
create policy ticket_fotos_leer on public.ticket_fotos
    for select to authenticated using ((select public.rol_en(company_id)) is not null);
revoke all on public.ticket_fotos from anon;
grant select on public.ticket_fotos to authenticated;

create or replace function public.mi_agenda_ticket_foto(p_company text, p_cita text, p_url text, p_hash text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol  text;
    v_cita public.appointments;
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
    insert into public.ticket_fotos (appointment_id, company_id, url, hash, subida_por)
    values (v_cita.id, p_company, p_url, lower(coalesce(p_hash, '')), coalesce((select auth.uid())::text, ''))
    on conflict (appointment_id) do update
        set url = excluded.url, hash = excluded.hash, subida_por = excluded.subida_por, created_at = now();
    return jsonb_build_object('status', 'ok', 'url', p_url);
end $$;

revoke all on function public.mi_agenda_ticket_foto(text, text, text, text) from public, anon;
grant execute on function public.mi_agenda_ticket_foto(text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
