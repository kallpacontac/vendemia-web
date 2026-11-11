-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0020: cómo cobra los pedidos cada negocio
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Alvaro, 11-nov-2026: «cualquier tienda podría decir quiero pago contraentrega o pago
-- anticipado o una seña o adelanto de tanto». Tres modos, en secciones.cobroPedidos:
--
--   · contra_entrega  Lo de siempre: se cobra al entregar.
--   · anticipado      Se paga todo antes de preparar.
--   · adelanto        Se paga una parte antes: un monto fijo o un porcentaje del total.
--
-- 1. CADA PEDIDO GUARDA AL NACER CUÁNTO HABÍA QUE PAGAR ANTES (orders.pagar_antes), con un
--    trigger: así entra igual por la página, por Mia o por quien sea, y cambiar la regla no
--    mueve los pedidos que ya entraron. Columna con default 0, como la 0014: el espejo del
--    bot sube solo las suyas. El trigger nunca tumba un pedido: si falla, deja 0.
--
-- 2. COBRAR CON IMPORTE (pedido_cobrar): el adelanto es un pago de verdad en pending_payments,
--    como la seña de una cita. Cuando lo pagado cubre el total, el pedido pasa a 'paid' (o a
--    'delivered' si ya estaba en Entregados del tablero). Solo con la agenda en la nube: si
--    no, los pagos son del bot.
--
-- 3. EL RESTO NO SE PIERDE EN LA CAJA. Un pedido con algún pago con importe ya no suma su
--    total en la Caja: su dinero entra por sus pagos (lib/panel/dinero.ts). Si después alguien
--    lo da por cobrado sin importe («Cobrado», «Entregado» de la tabla), el resto no entraba
--    nunca. Un trigger apunta ese resto como un pago más, el día en que se cobra: «cobrado»
--    quiere decir «cobré lo que faltaba», igual que en las citas puntuales. Solo en la nube.
--
-- 4. La página le dice al cliente cuánto pagar y a dónde (pedido_srv_cobro), con el monto
--    guardado en el pedido, no con una cuenta aparte.
--
-- Quién: la regla y los cobros, el dueño y el administrador (los mismos que ven Pedidos).
-- Requiere 0001, 0014, 0017 y 0019, y datos 0004. Idempotente. Se corre entera en el editor
-- SQL de Supabase. Se puede subir la web antes: sin esto el tablero cobra como siempre y no
-- deja cambiar el modo. Deshacer: scripts/cobro-pedidos-0020-deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Lo que había que pagar antes, en cada pedido ──────────────────────────

alter table public.orders add column if not exists pagar_antes numeric(12,2) not null default 0;

-- La misma cuenta que modules/tu-pagina/dominio/cobroPedidos.ts (aPagarAntes).
create or replace function public.v2_pedido_a_pagar(p_company text, p_total numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
    c jsonb;
    t numeric := greatest(coalesce(p_total, 0), 0);
    v numeric;
begin
    select secciones->'cobroPedidos' into c from public.tu_pagina where company_id = p_company;
    if c is null or jsonb_typeof(c) <> 'object' then return 0; end if;
    if c->>'modo' = 'anticipado' then return round(t, 2); end if;
    if c->>'modo' is distinct from 'adelanto' then return 0; end if;
    begin
        v := round((c->>'valor')::numeric, 2);
    exception when others then
        return 0;
    end;
    if v is null or v <= 0 then return 0; end if;
    if c->>'tipo' = 'porcentaje' then
        if v < 1 or v >= 100 then return 0; end if;
        return round(least(t, t * v / 100), 2);
    end if;
    if v > 100000 then return 0; end if;
    return round(least(t, v), 2);
end $$;

create or replace function public.v2_orders_pagar_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if coalesce(new.pagar_antes, 0) = 0 then
        new.pagar_antes := public.v2_pedido_a_pagar(new.company_id, new.total::numeric);
    end if;
    return new;
exception when others then
    -- Un pedido (también uno del bot) entra siempre, aunque esto falle.
    raise warning 'v2_orders_pagar_antes %: %', new.id, sqlerrm;
    return new;
end $$;

drop trigger if exists orders_pagar_antes on public.orders;
create trigger orders_pagar_antes before insert on public.orders
    for each row execute function public.v2_orders_pagar_antes();

-- ── 2 · Elegir el modo ────────────────────────────────────────────────────────

create or replace function public.pedido_cobro_guardar(p_company text, p_cobro jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_modo  text := p_cobro->>'modo';
    v_tipo  text := coalesce(nullif(p_cobro->>'tipo', ''), 'monto');
    v_valor numeric;
    v_regla jsonb;
begin
    perform public.tu_pagina_autorizar(p_company);
    if v_modo in ('contra_entrega', 'anticipado') then
        v_regla := jsonb_build_object('modo', v_modo);
    elsif v_modo = 'adelanto' then
        if v_tipo not in ('monto', 'porcentaje') then return jsonb_build_object('status', 'datos_invalidos'); end if;
        begin
            v_valor := round((p_cobro->>'valor')::numeric, 2);
        exception when others then
            return jsonb_build_object('status', 'datos_invalidos');
        end;
        if v_valor is null or v_valor <= 0
           or (v_tipo = 'porcentaje' and (v_valor < 1 or v_valor >= 100))
           or (v_tipo = 'monto' and v_valor > 100000) then
            return jsonb_build_object('status', 'datos_invalidos');
        end if;
        v_regla := jsonb_build_object('modo', 'adelanto', 'tipo', v_tipo, 'valor', v_valor);
    else
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    update public.tu_pagina set secciones = secciones || jsonb_build_object('cobroPedidos', v_regla)
     where company_id = p_company;
    if not found then return jsonb_build_object('status', 'sin_pagina'); end if;
    return jsonb_build_object('status', 'ok', 'cobro', v_regla);
end $$;

-- ── 3 · Cobrar con importe: el adelanto, o lo que falta ───────────────────────

create or replace function public.pedido_cobrar(p_company text, p_id text, p_monto numeric, p_metodo text, p_op text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ord    public.orders;
    v_op     text := 'panel:' || coalesce(nullif(btrim(p_op), ''), gen_random_uuid()::text);
    v_metodo text := btrim(coalesce(p_metodo, ''));
    v_monto  numeric := round(coalesce(p_monto, 0), 2);
    v_total  numeric;
    v_pagado numeric;
    v_dup    boolean := false;
begin
    perform public.v2_autorizar_agenda(p_company);
    if not public.agenda_en_nube(p_company) then return jsonb_build_object('status', 'no_es_nube'); end if;
    if v_metodo not in ('yape', 'plin', 'bank_transfer', 'cash') or v_monto <= 0 then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    select * into v_ord from public.orders where company_id = p_company and id = p_id for update;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    v_total := round(coalesce(v_ord.total::numeric, 0), 2);

    -- El mismo toque dos veces (doble clic, red que reintenta): una sola vez.
    v_dup := exists (select 1 from public.pending_payments where operation_id = v_op);
    if not v_dup then
        if v_ord.status = 'cancelled' then return jsonb_build_object('status', 'cancelado'); end if;
        if v_ord.status <> 'pending' then return jsonb_build_object('status', 'ya_cobrado'); end if;
        select coalesce(sum(amount), 0) into v_pagado from public.pending_payments
         where company_id = p_company and order_id = p_id;
        if v_monto > v_total - v_pagado + 0.005 then
            return jsonb_build_object('status', 'excede', 'falta', greatest(v_total - v_pagado, 0));
        end if;
        insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, order_id, appointment_id)
        values (gen_random_uuid()::text, coalesce(v_ord.lead_id, ''), p_company, v_monto, v_op, 1, p_id, '');
        update public.orders set payment_method = v_metodo where id = p_id;
    end if;

    select coalesce(sum(amount), 0) into v_pagado from public.pending_payments
     where company_id = p_company and order_id = p_id;
    if not v_dup and v_pagado >= v_total - 0.005 then
        -- Cubierto: cobrado. Si ya estaba en Entregados del tablero, también entregado.
        update public.orders
           set status = case when coalesce(etapa, '') = 'entregado' then 'delivered' else 'paid' end,
               pagado_por = 'panel',
               cumplido_por = case when coalesce(etapa, '') = 'entregado' then 'panel' else cumplido_por end
         where id = p_id;
    end if;
    return jsonb_build_object('status', 'ok', 'duplicado', v_dup, 'pagado', v_pagado, 'total', v_total,
                              'falta', greatest(v_total - v_pagado, 0), 'cubierto', v_pagado >= v_total - 0.005);
end $$;

-- ── 4 · El resto, cuando se da por cobrado sin importe ────────────────────────

create or replace function public.v2_orders_resto()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_pagado numeric;
    v_total  numeric;
begin
    if not public.agenda_en_nube(new.company_id) then return null; end if;
    v_total := round(coalesce(new.total::numeric, 0), 2);
    select coalesce(sum(amount), 0) into v_pagado from public.pending_payments
     where company_id = new.company_id and order_id = new.id;
    if v_pagado > 0 and v_pagado < v_total - 0.005 then
        insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, order_id, appointment_id)
        values (gen_random_uuid()::text, coalesce(new.lead_id, ''), new.company_id, v_total - v_pagado,
                'resto:' || new.id, 1, new.id, '');
    end if;
    return null;
exception when others then
    -- Nunca bloquear un cobro por esto: a lo sumo, el resto falta en la Caja como antes.
    raise warning 'v2_orders_resto %: %', new.id, sqlerrm;
    return null;
end $$;

drop trigger if exists orders_resto_al_cobrar on public.orders;
create trigger orders_resto_al_cobrar after update of status on public.orders
    for each row when (old.status = 'pending' and new.status in ('paid', 'delivered', 'completed'))
    execute function public.v2_orders_resto();

-- ── 5 · Lo que la página le dice al cliente tras pedir ────────────────────────

create or replace function public.pedido_srv_cobro(p_slug text, p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_company text;
    v_ref     text;
    v_pagar   numeric;
    v_total   numeric;
begin
    perform public.loyalty_srv_check();
    select company_id into v_company from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    select ref_id into v_ref from public.pagina_idem
     where company_id = v_company and codigo = p_codigo order by creado_at desc limit 1;
    select pagar_antes, round(coalesce(total::numeric, 0), 2) into v_pagar, v_total
      from public.orders where company_id = v_company and id = v_ref;
    if not found or coalesce(v_pagar, 0) <= 0 then
        return jsonb_build_object('status', 'ok', 'pagar', 0);
    end if;
    return jsonb_build_object('status', 'ok', 'pagar', v_pagar, 'total', v_total,
                              'metodos', coalesce(public.tu_pagina_srv_pago(p_slug)->'metodos', '[]'::jsonb));
end $$;

-- ── Permisos ──────────────────────────────────────────────────────────────────

revoke execute on function public.v2_pedido_a_pagar(text, numeric) from public, anon, authenticated;
revoke execute on function public.v2_orders_pagar_antes() from public, anon, authenticated;
revoke execute on function public.v2_orders_resto() from public, anon, authenticated;
revoke execute on function public.pedido_cobro_guardar(text, jsonb) from public, anon;
grant execute on function public.pedido_cobro_guardar(text, jsonb) to authenticated;
revoke execute on function public.pedido_cobrar(text, text, numeric, text, text) from public, anon;
grant execute on function public.pedido_cobrar(text, text, numeric, text, text) to authenticated;
revoke execute on function public.pedido_srv_cobro(text, text) from public;
grant execute on function public.pedido_srv_cobro(text, text) to anon;

commit;
