-- ═══════════════════════════════════════════════════════════════════════════════
-- 0011 · LA COMISIÓN Y EL COSTO SE CONGELAN AL VENDER
--
-- Hasta hoy, lib/panel/comisiones.ts aplicaba a TODAS las citas, también a las de meses
-- atrás, el % que tenía HOY el servicio o el profesional: subirle el % a un barbero
-- cambiaba lo que «ganó» en octubre. Y `catalogo_costos` guarda un costo por producto, sin
-- fecha: el margen de ventas pasadas salía con el costo de hoy. Alvaro, 12-nov-2026:
-- «eso no es posible, corrijamos».
--
-- Regla: la tarifa de comisión y el costo se copian en el momento de la venta y no se
-- vuelven a mirar.
--   · Cita: al pasar a `completed` (es cuando devenga comisión, decisión del 18-sep).
--     Una línea que se añade a una cita ya completada se congela al entrar.
--   · Pedido: el costo de cada producto al crearse el pedido (o al añadirse el producto).
--
-- Se guarda la REGLA (fija / % del servicio / % del profesional / sin) y su valor, no el
-- importe: si luego se corrige el precio de una línea, la comisión sigue cuadrando con él.
--
-- Va en tablas APARTE, no en columnas de appointment_services: esas filas las reimprime
-- el espejo del bot y las baja a su SQLite; aquí no las toca nadie más que estos triggers.
--
-- Lo que ya estaba completado se congela al aplicar esta migración con la tarifa y el costo
-- de hoy, que es justo lo que las pantallas enseñan hoy: nada cambia el día que entra.
--
-- Cambiar de profesional una cita YA completada vuelve a congelar su comisión con la tarifa
-- del nuevo: es una corrección de a quién se le paga.
--
-- Quién lee:
--   · comisiones_congeladas: quien puede ver la cita (el RLS de appointments decide). El
--     empleado, solo las suyas; así «Mi comisión» hace la misma cuenta que el dueño.
--   · costos_congelados y pedido_costos: solo el dueño, como catalogo_costos (0009).
-- Nadie escribe desde fuera: solo los triggers (security definer).
--
-- Deshacer: scripts/venta-congelada-0011-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Las tablas ────────────────────────────────────────────────────────────

create table if not exists public.comisiones_congeladas (
    linea_id        text primary key,            -- appointment_services.id
    appointment_id  text not null,
    company_id      text not null,
    employee_id     text,                        -- a quién se le congeló
    regla           text not null check (regla in ('fija', 'servicio', 'profesional', 'sin')),
    valor           numeric(12, 2),              -- 'fija': importe · 'servicio'/'profesional': % · 'sin': null
    congelado_at    timestamptz not null default now()
);
create index if not exists ix_comisiones_congeladas_cita on public.comisiones_congeladas (appointment_id);
create index if not exists ix_comisiones_congeladas_company on public.comisiones_congeladas (company_id);

create table if not exists public.costos_congelados (
    linea_id        text primary key,            -- appointment_services.id
    appointment_id  text not null,
    company_id      text not null,
    catalog_id      text not null,
    costo           numeric(12, 2) not null,
    congelado_at    timestamptz not null default now()
);
create index if not exists ix_costos_congelados_cita on public.costos_congelados (appointment_id);
create index if not exists ix_costos_congelados_company on public.costos_congelados (company_id);

create table if not exists public.pedido_costos (
    order_id        text not null,
    catalog_id      text not null,
    company_id      text not null,
    costo           numeric(12, 2) not null,
    congelado_at    timestamptz not null default now(),
    primary key (order_id, catalog_id)
);
create index if not exists ix_pedido_costos_company on public.pedido_costos (company_id);

alter table public.comisiones_congeladas enable row level security;
alter table public.costos_congelados     enable row level security;
alter table public.pedido_costos         enable row level security;
revoke all on public.comisiones_congeladas, public.costos_congelados, public.pedido_costos from anon, authenticated;
grant select on public.comisiones_congeladas, public.costos_congelados, public.pedido_costos to authenticated;

-- Quien ve la cita ve su comisión congelada: el subselect pasa por el RLS de appointments.
drop policy if exists p_comisiones_congeladas_leer on public.comisiones_congeladas;
create policy p_comisiones_congeladas_leer on public.comisiones_congeladas
    for select to authenticated
    using (exists (select 1 from public.appointments a where a.id = comisiones_congeladas.appointment_id));

drop policy if exists p_costos_congelados_leer on public.costos_congelados;
create policy p_costos_congelados_leer on public.costos_congelados
    for select to authenticated using ((select public.rol_en(company_id)) = 'dueno');

drop policy if exists p_pedido_costos_leer on public.pedido_costos;
create policy p_pedido_costos_leer on public.pedido_costos
    for select to authenticated using ((select public.rol_en(company_id)) = 'dueno');

-- ── 2 · Congelar una cita ─────────────────────────────────────────────────────
-- Misma regla que comisionDeLinea (lib/panel/comisiones.ts), en el mismo orden:
--   1. monto fijo del servicio · 2. % del servicio · 3. % del profesional (> 0) · 4. sin.
-- Solo rellena las líneas que aún no tienen fila: llamarla dos veces no cambia nada.

create or replace function public.v2_congelar_cita(p_cita text)
returns void language plpgsql security definer set search_path = public as $$
declare
    a public.appointments;
begin
    select * into a from public.appointments where id = p_cita;
    if a.id is null or a.status is distinct from 'completed' then return; end if;

    insert into public.comisiones_congeladas (linea_id, appointment_id, company_id, employee_id, regla, valor)
    select s.id, a.id, a.company_id, a.employee_id,
           case when c.comision_monto is not null then 'fija'
                when c.comision_pct   is not null then 'servicio'
                when coalesce(e.comision_pct, 0) > 0 then 'profesional'
                else 'sin' end,
           case when c.comision_monto is not null then c.comision_monto
                when c.comision_pct   is not null then c.comision_pct
                when coalesce(e.comision_pct, 0) > 0 then e.comision_pct
                else null end
      from public.appointment_services s
      left join public.catalog   c on c.id = s.catalog_item_id and c.company_id = a.company_id
      left join public.employees e on e.id = a.employee_id     and e.company_id = a.company_id
     where s.appointment_id = a.id
    on conflict (linea_id) do nothing;

    insert into public.costos_congelados (linea_id, appointment_id, company_id, catalog_id, costo)
    select s.id, a.id, a.company_id, k.catalog_id, k.costo
      from public.appointment_services s
      join public.catalogo_costos k on k.catalog_id = s.catalog_item_id and k.company_id = a.company_id
     where s.appointment_id = a.id
    on conflict (linea_id) do nothing;
end $$;
revoke execute on function public.v2_congelar_cita(text) from public, anon, authenticated;

-- La cita se completa, o se le cambia el profesional estando completada.
create or replace function public.v2_tg_congelar_cita()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.status is distinct from 'completed' then return null; end if;
    if tg_op = 'UPDATE' and old.status = 'completed'
       and old.employee_id is distinct from new.employee_id then
        delete from public.comisiones_congeladas where appointment_id = new.id;
    end if;
    perform public.v2_congelar_cita(new.id);
    return null;
end $$;

drop trigger if exists v2_congelar_cita on public.appointments;
create trigger v2_congelar_cita after insert or update of status, employee_id on public.appointments
    for each row execute function public.v2_tg_congelar_cita();

-- Una línea nueva (un consumo, o el espejo que reimprime) en una cita ya completada.
create or replace function public.v2_tg_congelar_linea()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    perform public.v2_congelar_cita(new.appointment_id);
    return null;
end $$;

drop trigger if exists v2_congelar_linea on public.appointment_services;
create trigger v2_congelar_linea after insert on public.appointment_services
    for each row execute function public.v2_tg_congelar_linea();

-- ── 3 · Congelar el costo de un pedido ────────────────────────────────────────
-- `orders.items` es JSON en texto: [{ name, price, quantity, catalog_item_id }]. Si viene
-- roto, el pedido se guarda igual: congelar no puede tumbar una venta.

create or replace function public.v2_congelar_pedido(p_order text)
returns void language plpgsql security definer set search_path = public as $$
declare
    o public.orders;
    v_items jsonb;
begin
    select * into o from public.orders where id = p_order;
    if o.id is null or coalesce(btrim(o.items), '') = '' then return; end if;
    begin
        v_items := o.items::jsonb;
    exception when others then
        return;
    end;
    if jsonb_typeof(v_items) <> 'array' then return; end if;

    insert into public.pedido_costos (order_id, catalog_id, company_id, costo)
    select distinct on (k.catalog_id) o.id, k.catalog_id, o.company_id, k.costo
      from jsonb_array_elements(v_items) i
      join public.catalogo_costos k on k.catalog_id = i->>'catalog_item_id' and k.company_id = o.company_id
    on conflict (order_id, catalog_id) do nothing;
end $$;
revoke execute on function public.v2_congelar_pedido(text) from public, anon, authenticated;

create or replace function public.v2_tg_congelar_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    perform public.v2_congelar_pedido(new.id);
    return null;
end $$;

drop trigger if exists v2_congelar_pedido on public.orders;
create trigger v2_congelar_pedido after insert or update of items on public.orders
    for each row execute function public.v2_tg_congelar_pedido();

-- ── 4 · Lo que ya estaba vendido: con la tarifa y el costo de hoy ─────────────

do $$
declare
    r record;
begin
    for r in select id from public.appointments where status = 'completed' loop
        perform public.v2_congelar_cita(r.id);
    end loop;
    for r in select id from public.orders loop
        perform public.v2_congelar_pedido(r.id);
    end loop;
end $$;

commit;

notify pgrst, 'reload schema';
