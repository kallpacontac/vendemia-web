-- ══════════════════════════════════════════════════════════════════════════
-- 0010 · Aviso al celular del dueño cuando piden un envío desde la página
-- ══════════════════════════════════════════════════════════════════════════
--
-- Los pedidos y reservas de la página ya avisaban (0002, avisos_tg_web); los
-- envíos no. Mismo camino: tipo 'reserva' —la preferencia «pedidos y reservas
-- nuevas» del dueño— con `clase` = 'web_envio' para que modules/avisos lo
-- redacte como envío y lo abra en /panel/pedidos?envio=CODIGO.
--
-- Solo los que llegan por la página (origen 'web'): uno creado desde el panel
-- lo acaba de escribir el propio dueño.
--
-- Idempotente. Deshacer:
--   drop trigger if exists avisos_envio on public.envios;
--   drop function if exists public.avisos_tg_envio();

create or replace function public.avisos_tg_envio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.origen = 'web' then
        perform public.avisos_apuntar(new.company_id, 'reserva', 'envio:' || new.codigo,
            jsonb_build_object('clase', 'web_envio', 'nombre', new.remitente_nombre, 'codigo', new.codigo,
                               'distrito', new.distrito, 'recojo', new.recojo_fecha, 'franja', new.recojo_franja,
                               'bultos', new.bultos),
            new.creado_at);
    end if;
    return null;
exception when others then
    -- Un aviso nunca tumba el envío: si falla, se pierde el aviso.
    raise warning 'avisos_tg_envio: %', sqlerrm;
    return null;
end $$;

drop trigger if exists avisos_envio on public.envios;
create trigger avisos_envio after insert on public.envios
    for each row execute function public.avisos_tg_envio();

revoke execute on function public.avisos_tg_envio() from public, anon, authenticated;
