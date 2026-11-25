-- Deshace avisos 0006: sin avisos de cobro, y el ticket vuelve a avisar como «Nueva cita».
begin;
drop trigger if exists avisos_abono on public.pending_payments;
drop trigger if exists avisos_cobro_cita on public.appointments;
drop function if exists public.avisos_tg_abono();
drop function if exists public.avisos_tg_cobro_cita();
drop function if exists public.avisos_cuenta_cita(text);
-- La de la 0001, tal cual.
create or replace function public.avisos_tg_cita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.status in ('confirmed', 'pending_payment') then
        perform public.avisos_apuntar(new.company_id, 'reserva', 'cita:' || new.id,
            jsonb_build_object('clase', 'cita', 'lead_id', new.lead_id, 'servicio', new.service,
                               'slot', new.slot_start, 'estado', new.status),
            coalesce(to_timestamp(new.created_at), now()));
    end if;
    return null;
end $$;
commit;
notify pgrst, 'reload schema';
