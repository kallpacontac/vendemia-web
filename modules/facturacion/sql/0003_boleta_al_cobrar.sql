-- Boletas y facturas · 0003: la boleta al cobrar en Caja, y un enlace para compartirla.
--
-- 1 · factura_ajustes.al_cobrar: qué pasa al cobrar en Caja («Cobrar ticket», «Listos para cobrar»).
--       'no'         → nada; la boleta se hace a mano en Boletas y facturas.
--       'preguntar'  → sale un botón «Emitir boleta» con el detalle ya puesto (por defecto).
--       'automatico' → la boleta sin documento sale sola (hasta S/700; más, pide DNI con el botón).
--     Lo guarda factura_al_cobrar_guardar (solo el dueño); factura_ajustes_leer ya lo devuelve
--     porque lee la fila entera.
-- 2 · factura_publica(id): el comprobante para el enlace que se manda por WhatsApp
--     (/comprobante/<id>). Sin sesión: el id es un uuid al azar, como el enlace al PDF de un
--     proveedor. Solo los que llegaron a SUNAT (pendiente, aceptado, anulando, anulado).
--
-- Requiere la 0001. Se puede correr dos veces. Deshacer: scripts/facturacion-0003-deshacer.sql.

begin;

alter table public.factura_ajustes add column if not exists al_cobrar text not null default 'preguntar';
alter table public.factura_ajustes drop constraint if exists factura_ajustes_al_cobrar_check;
alter table public.factura_ajustes add constraint factura_ajustes_al_cobrar_check
    check (al_cobrar in ('no', 'preguntar', 'automatico'));

create or replace function public.factura_al_cobrar_guardar(p_company text, p_modo text)
returns void language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.factura_rol(p_company, true);
begin
    if p_modo not in ('no', 'preguntar', 'automatico') then
        raise exception 'Elige qué pasa al cobrar: no emitir, preguntar o emitir sola.' using errcode = '22023';
    end if;
    update public.factura_ajustes set al_cobrar = p_modo, actualizado_por = auth.uid(), actualizado_at = now()
     where company_id = p_company;
    if not found then
        raise exception 'Guarda primero los datos del negocio.' using errcode = '22023';
    end if;
end $$;

create or replace function public.factura_publica(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    select (to_jsonb(c) - 'clave' - 'emitido_por' - 'baja_por' - 'company_id' - 'xml_url' - 'cdr_url'
                        - 'mensaje' - 'observaciones' - 'ticket_baja' - 'ref_tipo' - 'ref_id')
           || jsonb_build_object('ticket_ancho', coalesce(a.ticket_ancho, 80))
      from public.comprobantes_electronicos c
      left join public.factura_ajustes a on a.company_id = c.company_id
     where c.id = p_id
       and c.estado in ('pendiente', 'aceptado', 'anulando', 'anulado');
$$;

revoke execute on function public.factura_al_cobrar_guardar(text, text) from public, anon;
grant execute on function public.factura_al_cobrar_guardar(text, text) to authenticated;
revoke execute on function public.factura_publica(uuid) from public;
grant execute on function public.factura_publica(uuid) to anon, authenticated;

commit;
notify pgrst, 'reload schema';
