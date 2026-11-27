-- Deshace tu-pagina 0039: vuelve a una foto por ticket y sin ajuste (las segundas fotos se pierden
-- de la tabla; los archivos siguen en Cloudinary). La función de 4 argumentos vuelve a la de la 0037.
begin;
drop function if exists public.ticket_foto_guardar(text, text);
drop function if exists public.ticket_foto_modo(text);
alter table public.cobro_ajustes drop constraint if exists cobro_ajustes_ticket_foto_chk;
alter table public.cobro_ajustes drop column if exists ticket_foto;

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
drop function if exists public.mi_agenda_ticket_foto(text, text, text, text, integer);

alter table public.ticket_fotos drop constraint if exists ticket_fotos_hash_2_chk;
alter table public.ticket_fotos drop constraint if exists ticket_fotos_url_2_chk;
alter table public.ticket_fotos drop column if exists hash_2;
alter table public.ticket_fotos drop column if exists url_2;
commit;
notify pgrst, 'reload schema';
