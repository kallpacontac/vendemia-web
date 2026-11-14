-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · ajustes de la página (14-nov-2026). Se puede correr más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════════
-- Para el negocio ya creado con scripts/the247-alta.sql. Necesita desplegados los archivos de
-- public/assets/the247/ (fotos y videos) y, para la ventana de la tarjeta, la 0022.
--
--   1. Cada servicio con la foto donde se ve SU corte (no la cara ni el local). Solo las fotos
--      t247-m-*: no toca las que el dueño suba desde el panel.
--   2. Fondo de la invitación a crear la tarjeta tras subir el comprobante (el del flameado).
--   3. «En video»: inauguración de la sede Premium y lavado + masaje capilar.
--   4. «Antes de tu cita»: tolerancia de 10 minutos y lo demás, al terminar de reservar.
--   5. La misma tolerancia (10 min) en las reglas del negocio.

begin;

-- 1 · Fotos del catálogo
update public.catalog_media m
   set url = 'https://vendemias.com/assets/the247/' || f.archivo
  from (values ('t247-corte', 'corte.webp'), ('t247-corte-barba', 'corte-barba.webp'), ('t247-corte-cejas', 'corte-cejas.webp'),
               ('t247-corte-raya', 'corte-raya.webp'), ('t247-corte-diseno', 'corte-diseno.webp'), ('t247-corte-nino', 'corte-nino.webp'),
               ('t247-perfilado', 'perfilado.webp'), ('t247-barba', 'arreglo-barba.webp')) as f(id, archivo)
 where m.company_id = 'the247barbershop' and m.id = 't247-m-' || f.id;

-- 2, 3 y 4 · Página
update public.tu_pagina
   set secciones = jsonb_set(jsonb_set(jsonb_set(secciones,
         '{fideliza,foto}', '"https://vendemias.com/assets/the247/invitacion.webp"'),
         '{apariencia,videos}', jsonb_build_array(
             jsonb_build_object('url', 'https://vendemias.com/assets/the247/video-premium.mp4',
                                'poster', 'https://vendemias.com/assets/the247/video-premium.webp',
                                'titulo', 'Inauguración de 24/7 Premium · Jr. Huallaga 646'),
             jsonb_build_object('url', 'https://vendemias.com/assets/the247/video-lavado.mp4',
                                'poster', 'https://vendemias.com/assets/the247/video-lavado.webp',
                                'titulo', 'Lavado y masaje capilar'))),
         '{citas,indicaciones}', jsonb_build_array(
             'Tolerancia máxima de 10 minutos: pasado ese tiempo, la cita se reprograma sin excepción.',
             'Tu cita queda confirmada cuando revisamos la captura del adelanto (50 %). El resto lo pagas en el local.',
             'Te atendemos en Jr. Huallaga 625 o en 24/7 Premium (Jr. Huallaga 646), Iquitos. Si quieres una sede en especial, avísanos por WhatsApp.',
             'Si no puedes venir, avísanos por WhatsApp con tiempo para darle tu hora a otra persona.'))
 where company_id = 'the247barbershop' and secciones ? 'fideliza' and secciones ? 'citas';

-- 5 · Reglas del negocio (las lee Mia cuando se encienda el bot)
update public.companies
   set custom_rules = replace(custom_rules, 'Tolerancia máxima de 5 minutos', 'Tolerancia máxima de 10 minutos')
 where id = 'the247barbershop';

commit;

-- Comprobación: 8 filas de fotos y, abajo, la página con sus videos e indicaciones.
select catalog_id, url from public.catalog_media where company_id = 'the247barbershop' order by catalog_id;
select jsonb_array_length(secciones #> '{apariencia,videos}') as videos,
       jsonb_array_length(secciones #> '{citas,indicaciones}') as indicaciones,
       secciones #>> '{fideliza,foto}' as fondo_invitacion,
       (select custom_rules like '%10 minutos%' from public.companies where id = 'the247barbershop') as tolerancia_10
  from public.tu_pagina where company_id = 'the247barbershop';
