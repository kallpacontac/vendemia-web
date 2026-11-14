-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · sus dos sedes, cada una con su aforo (14-nov-2026). Se puede repetir.
-- ═══════════════════════════════════════════════════════════════════════════════
-- Necesita corridas la 0023 (sede en la cita), la 0024 (plazo para pagar) y la 0025 (aforo por
-- sede), y el código desplegado.
--   · «Nuestras sedes» en la página, con «Cómo llegar» (Google Maps) y «Reservar aquí».
--   · Al reservar, el cliente elige sede (obligatorio) y ve los horarios libres DE ESA SEDE.
--   · Aforo independiente (decisión de Alvaro): 5 citas a la vez en cada una. Lo ocupado en una
--     no quita sitio en la otra.
--   · El aforo general del negocio pasa a 10 (la suma): es el que mira el panel al agendar y el
--     bot; el de cada sede lo controla la página.
-- El nombre de cada sede es lo que se guarda en la cita: si lo cambias, las citas viejas
-- conservan el nombre de antes (y dejan de contar en la sede renombrada).

begin;

update public.tu_pagina
   set secciones = jsonb_set(jsonb_set(secciones,
         '{citas,sedes}', jsonb_build_array(
             jsonb_build_object('nombre', 'The 24/7 · Huallaga 625', 'direccion', 'Jr. Huallaga 625, Iquitos', 'capacidad', 5),
             jsonb_build_object('nombre', '24/7 Premium · Huallaga 646', 'direccion', 'Jr. Huallaga 646, Iquitos', 'capacidad', 5,
                                'foto', 'https://vendemias.com/assets/the247/sede-premium.webp'))),
         '{citas,indicaciones}', jsonb_build_array(
             'Tolerancia máxima de 10 minutos: pasado ese tiempo, la cita se reprograma sin excepción.',
             'Tu cita queda confirmada cuando revisamos la captura del adelanto (50 %). El resto lo pagas en el local.',
             'Ve a la sede que elegiste: está en el resumen de arriba y en tu mensaje de WhatsApp.',
             'Si no puedes venir, avísanos por WhatsApp con tiempo para darle tu hora a otra persona.'))
 where company_id = 'the247barbershop' and secciones ? 'citas';

-- Aforo general = suma de las sedes (5 + 5), todos los días.
update public.companies c
   set schedule = (select jsonb_object_agg(e.k, case when jsonb_typeof(e.v) = 'object' then e.v || '{"capacity": 10}'::jsonb else e.v end)
                     from jsonb_each(c.schedule::jsonb) e(k, v))::text
 where c.id = 'the247barbershop';

commit;

-- Comprobación: 2 sedes con capacidad 5, 4 indicaciones y aforo general 10.
select jsonb_path_query_array(secciones, '$.citas.sedes[*].capacidad') as capacidad_por_sede,
       jsonb_array_length(secciones #> '{citas,indicaciones}') as indicaciones,
       (select (schedule::jsonb -> 'monday' ->> 'capacity') from public.companies where id = 'the247barbershop') as aforo_general
  from public.tu_pagina where company_id = 'the247barbershop';
