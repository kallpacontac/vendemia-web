-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA AVISOS · 0003 · Avisos de stock (a pedido) y mensajes por aprobar (21-oct-2026)
--
-- Dos tipos nuevos en panel_push_events:
--
--   · 'stock' — «avísame cuando queden 5 del Polo negro». Solo existe si alguien lo pidió
--     (tabla avisos_stock, modules/datos/sql/0008) y le llega SOLO a esa persona: el evento
--     lleva `datos.para` y el despachador lo manda únicamente a sus suscripciones. Salta
--     cuando el stock CRUZA el mínimo hacia abajo; no vuelve a saltar hasta que reponen por
--     encima y vuelve a bajar (avisos_stock.vuelta).
--
--   · 'por_aprobar' — Mia propuso sola un mensaje a un cliente (borradores.creado_por null).
--     Lo que pidió una persona no avisa: lo está viendo en ese momento. Los del mismo minuto
--     se agrupan en uno («Mia preparó 3 mensajes para aprobar», dominio/redactar.ts).
--
-- Los dos respetan lo de siempre: preferencias por celular (encendidos por defecto), silencio,
-- solo dueño y administrador (avisos_recibe, 0002).
--
-- APLICAR después de la 0002 de este módulo y de modules/datos/sql/0008.
-- Prueba: pruebas_0003.sql (BEGIN … ROLLBACK).
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
    if to_regprocedure('public.avisos_recibe(uuid, text)') is null then
        raise exception 'Falta avisos_recibe: aplica antes modules/avisos/sql/0002_avisos_por_rol.sql.';
    end if;
    if to_regclass('public.avisos_stock') is null or to_regclass('public.borradores') is null then
        raise exception 'Faltan avisos_stock / borradores: aplica antes modules/datos/sql/0008_mia_gerente.sql.';
    end if;
end $$;

-- ── 1 · Los tipos ─────────────────────────────────────────────────────────────
-- El check de la 0001 no tiene nombre propio: se busca el que mira `tipo` y se cambia.
do $$
declare c text;
begin
    for c in select con.conname from pg_constraint con
              where con.conrelid = 'public.panel_push_events'::regclass and con.contype = 'c'
                and pg_get_constraintdef(con.oid) like '%tipo%' loop
        execute format('alter table public.panel_push_events drop constraint %I', c);
    end loop;
end $$;
alter table public.panel_push_events add constraint panel_push_events_tipo_chk
    check (tipo in ('pago', 'reserva', 'whatsapp', 'plan', 'persona', 'stock', 'por_aprobar'));

-- ── 2 · Stock: el producto entero ─────────────────────────────────────────────
-- Lo dispara cualquier cambio de stock: el bot al vender (ajustar_stock), el panel al editar,
-- el espejo. Nunca tumba el cambio del catálogo: si algo falla, se pierde el aviso.
create or replace function public.avisos_tg_stock_producto() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record;
begin
    if new.stock is null or new.stock is not distinct from old.stock then return null; end if;
    begin
        for a in select * from public.avisos_stock
                  where company_id = new.company_id and catalog_id = new.id and variante_id is null and activo
                  for update loop
            if not a.avisado and new.stock <= a.minimo then
                perform public.avisos_apuntar(new.company_id, 'stock', 'stock:' || a.id || ':' || a.vuelta,
                    jsonb_build_object('para', a.auth_user_id, 'catalog_id', new.id, 'producto', new.name,
                                       'quedan', new.stock, 'minimo', a.minimo));
                update public.avisos_stock set avisado = true, updated_at = now() where id = a.id;
            elsif a.avisado and new.stock > a.minimo then
                update public.avisos_stock set avisado = false, vuelta = vuelta + 1, updated_at = now() where id = a.id;
            end if;
        end loop;
    exception when others then
        raise warning 'avisos_tg_stock_producto: %', sqlerrm;
    end;
    return null;
end $$;
drop trigger if exists avisos_stock_producto on public.catalog;
create trigger avisos_stock_producto after update of stock on public.catalog
    for each row execute function public.avisos_tg_stock_producto();

-- ── 3 · Stock: una talla o color ──────────────────────────────────────────────
create or replace function public.avisos_tg_stock_variante() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    a record;
    v_nombre text;
begin
    if new.stock is not distinct from old.stock then return null; end if;
    begin
        for a in select * from public.avisos_stock
                  where company_id = new.company_id and variante_id = new.id and activo
                  for update loop
            if not a.avisado and new.stock <= a.minimo then
                select name into v_nombre from public.catalog where id = new.catalog_id and company_id = new.company_id;
                perform public.avisos_apuntar(new.company_id, 'stock', 'stock:' || a.id || ':' || a.vuelta,
                    jsonb_build_object('para', a.auth_user_id, 'catalog_id', new.catalog_id,
                                       'producto', coalesce(v_nombre, ''), 'opcion', new.etiqueta,
                                       'quedan', new.stock, 'minimo', a.minimo));
                update public.avisos_stock set avisado = true, updated_at = now() where id = a.id;
            elsif a.avisado and new.stock > a.minimo then
                update public.avisos_stock set avisado = false, vuelta = vuelta + 1, updated_at = now() where id = a.id;
            end if;
        end loop;
    exception when others then
        raise warning 'avisos_tg_stock_variante: %', sqlerrm;
    end;
    return null;
end $$;
drop trigger if exists avisos_stock_variante on public.catalog_variantes;
create trigger avisos_stock_variante after update of stock on public.catalog_variantes
    for each row execute function public.avisos_tg_stock_variante();

-- ── 4 · Mensajes que Mia propuso sola ─────────────────────────────────────────
create or replace function public.avisos_tg_por_aprobar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.creado_por is null and new.estado = 'por_aprobar' then
        perform public.avisos_apuntar(new.company_id, 'por_aprobar', 'borrador:' || new.id,
            jsonb_build_object('lead_id', new.lead_id, 'objetivo', new.objetivo));
    end if;
    return null;
end $$;
drop trigger if exists avisos_por_aprobar on public.borradores;
create trigger avisos_por_aprobar after insert on public.borradores
    for each row execute function public.avisos_tg_por_aprobar();

-- ── 5 · El despachador: igual que en la 0002, más `datos.para` ────────────────
-- Un evento con `para` va solo a las suscripciones de esa persona, y solo cuenta en SU resumen.
create or replace function public.panel_push_srv_pendientes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_eventos jsonb;
    v_resumenes jsonb;
begin
    perform public.loyalty_srv_check();

    with vencidos as (
        update public.panel_push_events e set estado = 'enviado', enviado_at = now()
         where e.id in (select id from public.panel_push_events
                         where estado = 'pendiente' and not_before <= now()
                         order by id limit 300 for update skip locked)
        returning e.*
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'company_id', v.company_id, 'tipo', v.tipo, 'datos', v.datos, 'creado', v.creado,
        'negocio', c.name, 'modo', c.business_mode,
        'cliente', coalesce(nullif(l.name, ''), l.phone),
        'destinos', coalesce((
            select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
              from public.panel_push_subscriptions s
             where s.company_id = v.company_id and s.revoked_at is null
               and public.avisos_recibe(s.auth_user_id, s.company_id)
               and (v.datos ->> 'para' is null or s.auth_user_id::text = v.datos ->> 'para')
               and coalesce((s.prefs ->> v.tipo)::boolean, v.tipo <> 'persona')
               and not public.avisos_en_silencio(s.silencio_desde, s.silencio_hasta)
        ), '[]'::jsonb)
    ) order by v.id), '[]'::jsonb)
      into v_eventos
      from vencidos v
      join public.companies c on c.id = v.company_id
      left join public.leads l on l.id = v.datos ->> 'lead_id';

    with listas as (
        select s.*,
               ((now() at time zone 'America/Lima')::date + s.silencio_hasta) at time zone 'America/Lima' as fin
          from public.panel_push_subscriptions s
         where s.revoked_at is null and s.silencio_desde is not null and s.silencio_hasta is not null
           and s.silencio_desde <> s.silencio_hasta
           and (s.ultimo_resumen is null or s.ultimo_resumen < (now() at time zone 'America/Lima')::date)
           and public.avisos_recibe(s.auth_user_id, s.company_id)
    ), tocan as (
        select l.*,
               (case when l.silencio_desde > l.silencio_hasta
                     then ((now() at time zone 'America/Lima')::date - 1 + l.silencio_desde)
                     else ((now() at time zone 'America/Lima')::date + l.silencio_desde) end) at time zone 'America/Lima' as inicio
          from listas l
         where now() >= l.fin and now() < l.fin + interval '15 minutes'
    ), marcadas as (
        update public.panel_push_subscriptions s set ultimo_resumen = (now() at time zone 'America/Lima')::date
          from tocan t where s.id = t.id
        returning s.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth,
        'negocio', c.name, 'modo', c.business_mode,
        'conteos', (select coalesce(jsonb_object_agg(x.tipo, x.n), '{}'::jsonb) from (
            select e.tipo, count(*) as n from public.panel_push_events e
             where e.company_id = t.company_id and e.estado in ('enviado', 'pendiente')
               and e.creado >= t.inicio and e.creado < t.fin
               and (e.datos ->> 'para' is null or t.auth_user_id::text = e.datos ->> 'para')
               and coalesce((t.prefs ->> e.tipo)::boolean, e.tipo <> 'persona')
             group by e.tipo) x)
    )), '[]'::jsonb)
      into v_resumenes
      from tocan t join public.companies c on c.id = t.company_id
     where t.id in (select id from marcadas);

    return jsonb_build_object('eventos', v_eventos, 'resumenes', v_resumenes);
end $$;
revoke execute on function public.panel_push_srv_pendientes() from public, anon, authenticated;
grant execute on function public.panel_push_srv_pendientes() to anon;

revoke execute on function public.avisos_tg_stock_producto() from public, anon, authenticated;
revoke execute on function public.avisos_tg_stock_variante() from public, anon, authenticated;
revoke execute on function public.avisos_tg_por_aprobar()    from public, anon, authenticated;

commit;
