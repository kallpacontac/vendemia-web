-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0019: tablero de pedidos (Nuevo · Preparando · Listo · Entregado)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Alvaro, 11-nov-2026: ver los pedidos como tablero en restaurantes, delivery y tiendas.
--
-- 1. LA ENTREGA Y EL COBRO SON DOS COSAS. orders.status mezcla las dos (pending → paid →
--    delivered, y 'delivered' cuenta como cobrado en la Caja). Por eso el paso del tablero
--    va en su propia columna, `etapa`, y NO toca status: un pedido puede estar entregado
--    y sin cobrar sin que la Caja cuente dinero que no entró. Cobrar y dar por entregado
--    siguen siendo marcar_pagado y marcar_cumplido, por el bot o por la nube.
--
-- 2. etapa '' es «Nuevo». «Confirmar» lo pasa a 'preparando' en un solo toque: el
--    restaurante que comanda en su POS no hace un paso de más. 'listo' (para recoger o
--    en camino) se puede saltar.
--
-- 3. Columna con default '', como la 0014: el espejo del bot sube solo las suyas, así que
--    el bot no la ve ni la pisa.
--
-- 4. pedidos_web (el carrito de la página sin agenda en la nube) ya tenía su estado:
--    'confirmado' es «Preparando». Solo le falta 'listo'.
--
-- Quién: el dueño y el administrador (tu_pagina_autorizar), los mismos que ven Pedidos.
-- Requiere 0001, 0002 y 0014. Idempotente. Se corre entera en el editor SQL de Supabase.
-- Se puede subir la web antes: sin esta migración el tablero se ve, pero no mueve tarjetas.
-- Deshacer: scripts/tablero-pedidos-0019-deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.orders
    add column if not exists etapa    text not null default '',
    add column if not exists etapa_at timestamptz;
alter table public.orders drop constraint if exists orders_etapa_check;
alter table public.orders add constraint orders_etapa_check check (etapa in ('', 'preparando', 'listo', 'entregado'));

alter table public.pedidos_web drop constraint if exists pedidos_web_estado_check;
alter table public.pedidos_web add constraint pedidos_web_estado_check
    check (estado in ('nuevo', 'confirmado', 'listo', 'entregado', 'cancelado'));

-- Mover una tarjeta. Devuelve la etapa de antes para poder deshacer.
create or replace function public.pedido_etapa(p_company text, p_id text, p_etapa text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_antes  text;
    v_estado text;
begin
    perform public.tu_pagina_autorizar(p_company);
    if p_etapa is null or p_etapa not in ('', 'preparando', 'listo', 'entregado') then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    select etapa, coalesce(status, '') into v_antes, v_estado
      from public.orders where company_id = p_company and id = p_id
       for update;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if v_estado = 'cancelled' then return jsonb_build_object('status', 'cancelado'); end if;
    -- Lo que ya consta entregado (status) no vuelve atrás: la Caja ya lo cuenta.
    if v_estado = 'delivered' and p_etapa <> 'entregado' then
        return jsonb_build_object('status', 'ya_entregado');
    end if;
    update public.orders set etapa = p_etapa, etapa_at = now()
     where company_id = p_company and id = p_id;
    return jsonb_build_object('status', 'ok', 'antes', v_antes);
end $$;

revoke execute on function public.pedido_etapa(text, text, text) from public, anon;
grant execute on function public.pedido_etapa(text, text, text) to authenticated;

commit;
