-- The 24/7 · 26-nov-2026. Se puede repetir.
--   1. «Antes de tu cita»: la línea de las sedes, con sede principal y segunda sede Premium.
--   2. Portada: quita la del celular y la alterna que puso scripts/the247-portada.sql (14-nov).
--      Tapaban la foto que el dueño sube en Mi página: en el celular salía siempre la vieja y en
--      la compu, la del barbero con la tijera una de cada dos veces. Queda solo la suya.
--      (Desde el código de hoy, cambiar la portada en el panel ya las quita solo.)
-- La página se actualiza sola en menos de un minuto.

update public.tu_pagina
   set secciones = jsonb_set(secciones, '{citas,indicaciones}', (
         select jsonb_agg(case when t.x like 'Te atendemos en%'
                               then to_jsonb('Te atendemos en nuestra sede principal de Jr. Huallaga 625 o en nuestra segunda sede Premium, Jr. Huallaga 646.'::text)
                               else to_jsonb(t.x) end order by t.o)
           from jsonb_array_elements_text(secciones #> '{citas,indicaciones}') with ordinality t(x, o)))
 where company_id = 'the247barbershop'
   and jsonb_typeof(secciones #> '{citas,indicaciones}') = 'array';

update public.tu_pagina
   set secciones = secciones #- '{apariencia,portadaLuxuryMovil}' #- '{apariencia,portadasLuxuryAlternas}'
 where company_id = 'the247barbershop';

-- Comprobación: las indicaciones, la portada que queda y que ya no hay móvil ni alternas.
select secciones #> '{citas,indicaciones}'              as indicaciones,
       portada_url,
       secciones #>> '{apariencia,portadaLuxuryMovil}'   as portada_movil,   -- debe salir null
       secciones #>  '{apariencia,portadasLuxuryAlternas}' as alternas        -- debe salir null
  from public.tu_pagina where company_id = 'the247barbershop';
