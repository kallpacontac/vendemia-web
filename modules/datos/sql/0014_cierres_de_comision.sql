-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0014: cierres de comisión · apuntar que ya se le pagó al barbero
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 18-nov-2026 (The 24/7): en su sistema de antes el panel decía
-- «6 cierres por pagar · S/309,50 a los barberos». Vendemia calculaba la comisión
-- (lib/panel/comisiones.ts) pero no tenía dónde apuntar que se pagó, así que no había
-- nada «por pagar» que contar.
--
-- Un CIERRE es un pago a un barbero: las citas que cubre, los adelantos que se le
-- descontaron (gastos tipo 'adelanto', datos 0013), cuánto le tocaba y cuánto se le dio.
-- Lo que se guarda son los ids: una cita o un adelanto entra en UN solo cierre, así que lo
-- «por pagar» es exactamente lo que ningún cierre cubre, aunque se marque «Vino» días después.
--
--   · comision_cierres_leer(company, dias): los cierres de esos días (dueño o admin).
--   · comision_cierre_guardar(company, datos): paga. Comprueba que las citas son de ese
--     barbero, están atendidas y no están ya en otro cierre (dos pestañas a la vez).
--   · comision_cierre_borrar(company, id): deshace un pago mal hecho (solo el dueño).
--
-- El pago SALE DE LA CAJA DEL DÍA: cada cierre con algo pagado apunta un gasto de hoy
-- («Comisión de Alexander», categoría «Comisiones»), y deshacer el cierre lo borra. Así la
-- Caja cuadra con el cajón. No hay doble descuento: los adelantos ya salieron como gasto el
-- día que se dieron, y el cierre paga solo comisión − adelantos.
--
-- La comisión la calcula el panel con las mismas reglas de siempre (tarifa congelada, 0011);
-- aquí se guarda lo que se le dijo al dueño, que es lo que firmó.
--
-- Necesita v2_autorizar_agenda y rol_en. No necesita la 0013: sin ella no hay adelantos.
-- Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.comision_cierres (
    id           uuid primary key default gen_random_uuid(),
    company_id   text not null,
    employee_id  text not null,
    -- Desde qué día se contó: el primer cierre fija desde cuándo lleva cuentas el negocio.
    desde        date not null,
    citas        text[] not null default '{}',
    adelantos    text[] not null default '{}',
    comision     numeric(12,2) not null check (comision >= 0),
    adelantado   numeric(12,2) not null default 0 check (adelantado >= 0),
    pagado       numeric(12,2) not null check (pagado >= 0),
    metodo       text not null default 'efectivo' check (metodo in ('efectivo', 'yape', 'plin', 'transferencia', 'otro')),
    nota         text not null default '' check (char_length(nota) <= 200),
    pagado_por   uuid,
    pagado_at    timestamptz not null default now(),
    -- El gasto de la Caja que apuntó este pago ('' si no se pagó nada).
    gasto_id     text not null default ''
);
alter table public.comision_cierres add column if not exists gasto_id text not null default '';
create index if not exists comision_cierres_por_barbero on public.comision_cierres (company_id, employee_id, pagado_at desc);
create index if not exists comision_cierres_citas on public.comision_cierres using gin (citas);
alter table public.comision_cierres enable row level security;
revoke all on public.comision_cierres from anon, authenticated;

create or replace function public.comision_cierres_leer(p_company text, p_dias integer default 180)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    return coalesce((
        select jsonb_agg(to_jsonb(c) - 'company_id' order by c.pagado_at desc)
          from public.comision_cierres c
         where c.company_id = p_company
           and c.pagado_at >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 180), 400)))
    ), '[]'::jsonb);
end $$;

create or replace function public.comision_cierre_guardar(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    d jsonb := coalesce(p_datos, '{}'::jsonb);
    v_emp text := btrim(coalesce(d->>'employee_id', ''));
    v_citas text[];
    v_adelantos text[];
    v_desde date;
    v_comision numeric;
    v_adelantado numeric;
    v_pagado numeric;
    v_metodo text := coalesce(nullif(btrim(d->>'metodo'), ''), 'efectivo');
    v_malas integer;
    v_fila public.comision_cierres;
    v_nombre text;
    v_gasto text := '';
begin
    perform public.v2_autorizar_agenda(p_company);

    select e.name into v_nombre from public.employees e where e.id = v_emp and e.company_id = p_company;
    if v_emp = '' or not found then
        raise exception 'Ese barbero no es de este negocio.' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct x), '{}') into v_citas
      from jsonb_array_elements_text(case when jsonb_typeof(d->'citas') = 'array' then d->'citas' else '[]' end) x;
    select coalesce(array_agg(distinct x), '{}') into v_adelantos
      from jsonb_array_elements_text(case when jsonb_typeof(d->'adelantos') = 'array' then d->'adelantos' else '[]' end) x;
    if cardinality(v_citas) = 0 and cardinality(v_adelantos) = 0 then
        raise exception 'No hay nada que pagar.' using errcode = '22023';
    end if;
    begin
        v_desde := (d->>'desde')::date;
        v_comision := round(coalesce((d->>'comision')::numeric, 0), 2);
        v_adelantado := round(coalesce((d->>'adelantado')::numeric, 0), 2);
        v_pagado := round(coalesce((d->>'pagado')::numeric, 0), 2);
    exception when others then
        raise exception 'Los montos o la fecha no son válidos.' using errcode = '22023';
    end;
    if v_desde is null or v_comision < 0 or v_adelantado < 0 or v_pagado < 0 then
        raise exception 'Los montos o la fecha no son válidos.' using errcode = '22023';
    end if;

    -- Las citas: de este negocio, de este barbero y atendidas.
    select count(*) into v_malas
      from unnest(v_citas) x
     where not exists (select 1 from public.appointments a
                        where a.id = x and a.company_id = p_company and a.employee_id = v_emp
                          and a.status = 'completed');
    if v_malas > 0 then
        raise exception 'Hay citas que no son de este barbero o no están atendidas. Recarga la página.' using errcode = '22023';
    end if;

    -- Que nadie las haya pagado ya (otra pestaña, otro celular). Bloqueo por negocio y barbero.
    perform pg_advisory_xact_lock(hashtext('comision_cierre:' || p_company || ':' || v_emp));
    if exists (select 1 from public.comision_cierres c
                where c.company_id = p_company and (c.citas && v_citas or c.adelantos && v_adelantos)) then
        raise exception 'Parte de esto ya se pagó en otro cierre. Recarga la página.' using errcode = '23505';
    end if;

    insert into public.comision_cierres (company_id, employee_id, desde, citas, adelantos, comision, adelantado,
                                         pagado, metodo, nota, pagado_por)
    values (p_company, v_emp, v_desde, v_citas, v_adelantos, v_comision, v_adelantado, v_pagado, v_metodo,
            left(btrim(coalesce(d->>'nota', '')), 200), auth.uid())
    returning * into v_fila;

    -- El dinero que salió, en la Caja de hoy (día de Lima).
    if v_pagado > 0 then
        v_gasto := 'cierre-' || v_fila.id::text;
        insert into public.gastos (id, company_id, fecha, concepto, categoria, importe, creado_por)
        values (v_gasto, p_company, to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD'),
                left('Comisión de ' || coalesce(nullif(btrim(v_nombre), ''), 'barbero') || ' (' || v_metodo || ')', 200),
                'Comisiones', v_pagado, coalesce(auth.uid()::text, ''));
        -- Con la 0013, el gasto dice a quién fue (y sigue siendo del negocio, no un adelanto).
        if exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'gastos' and column_name = 'employee_id') then
            execute 'update public.gastos set employee_id = $1 where id = $2' using v_emp, v_gasto;
        end if;
        update public.comision_cierres set gasto_id = v_gasto where id = v_fila.id returning * into v_fila;
    end if;
    return to_jsonb(v_fila) - 'company_id';
end $$;

create or replace function public.comision_cierre_borrar(p_company text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
    v_gasto text;
begin
    perform public.v2_autorizar_agenda(p_company);
    if public.rol_en(p_company) is distinct from 'dueno' then
        raise exception 'Deshacer un pago solo lo puede el dueño.' using errcode = '42501';
    end if;
    delete from public.comision_cierres where id = p_id and company_id = p_company returning gasto_id into v_gasto;
    if not found then raise exception 'Ese pago ya no existe.' using errcode = '22023'; end if;
    -- Y su gasto de la Caja: el dinero no salió.
    if coalesce(v_gasto, '') <> '' then
        delete from public.gastos where id = v_gasto and company_id = p_company;
    end if;
end $$;

revoke execute on function public.comision_cierres_leer(text, integer) from public, anon;
revoke execute on function public.comision_cierre_guardar(text, jsonb) from public, anon;
revoke execute on function public.comision_cierre_borrar(text, uuid) from public, anon;
grant execute on function public.comision_cierres_leer(text, integer) to authenticated;
grant execute on function public.comision_cierre_guardar(text, jsonb) to authenticated;
grant execute on function public.comision_cierre_borrar(text, uuid) to authenticated;

commit;
notify pgrst, 'reload schema';

-- Deshacer (borra los pagos apuntados):
-- begin;
-- drop function if exists public.comision_cierre_borrar(text, uuid);
-- drop function if exists public.comision_cierre_guardar(text, jsonb);
-- drop function if exists public.comision_cierres_leer(text, integer);
-- drop table if exists public.comision_cierres;
-- commit;
-- notify pgrst, 'reload schema';
