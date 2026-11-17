-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · la dirección primero en el nombre de cada sede (17-nov-2026). Se puede repetir.
-- ═══════════════════════════════════════════════════════════════════════════════
--   Pedido de Alvaro: «que salga primero Huallaga 646 · 24/7 Premium, igual para el otro: así lo
--   escanean más rápido». En el celular el botón se corta por la derecha y queda a la vista el número.
--     Jr. Huallaga 625 → «Huallaga 625 · The 24/7»
--     Jr. Huallaga 646 → «Huallaga 646 · 24/7 Premium»
--   Cada sede se reconoce por su DIRECCIÓN (625 / 646), no por el nombre que tenga ahora.
--   El nombre se guarda también en cada cita (appointments.sede): se cambia en las dos a la vez, o
--   las citas viejas dejarían de contar en su sede. Aforo, foto y dirección no se tocan.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_id    constant text := 'the247barbershop';
    v_sedes jsonb;
    v_nuevas jsonb := '[]'::jsonb;
    s       jsonb;
    v_nuevo text;
    n       integer;
begin
    select secciones #> '{citas,sedes}' into v_sedes from public.tu_pagina where company_id = v_id for update;
    if jsonb_typeof(v_sedes) is distinct from 'array' then raise exception 'La página no tiene sedes.'; end if;

    for s in select e from jsonb_array_elements(v_sedes) e loop
        v_nuevo := case when s->>'direccion' ~ '625' then 'Huallaga 625 · The 24/7'
                        when s->>'direccion' ~ '646' then 'Huallaga 646 · 24/7 Premium' end;
        if v_nuevo is not null and s->>'nombre' <> v_nuevo then
            update public.appointments set sede = v_nuevo where company_id = v_id and sede = s->>'nombre';
            get diagnostics n = row_count;
            raise notice '«%» → «%» (% citas).', s->>'nombre', v_nuevo, n;
            s := s || jsonb_build_object('nombre', v_nuevo);
        end if;
        v_nuevas := v_nuevas || jsonb_build_array(s);
    end loop;

    update public.tu_pagina set secciones = jsonb_set(secciones, '{citas,sedes}', v_nuevas) where company_id = v_id;
end $$;

commit;

-- Comprobación: los nombres nuevos y cuántas citas tiene cada sede.
select e->>'nombre' as sede, e->>'direccion' as direccion, e->>'capacidad' as sillas,
       (select count(*) from public.appointments a where a.company_id = 'the247barbershop' and a.sede = e->>'nombre') as citas
  from public.tu_pagina p, jsonb_array_elements(p.secciones #> '{citas,sedes}') e
 where p.company_id = 'the247barbershop';
