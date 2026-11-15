-- The 24/7 · portadas (14-nov-2026). Se puede repetir. Necesita el código de 14-nov desplegado.
--   · Principal: la foto del equipo (public/assets/the247/portada.webp). En el celular, su
--     recorte vertical centrado en el barbero sentado (portada-movil.webp).
--   · Alterna: el barbero con la tijera (portada-alterna.webp y portada-alterna-movil.webp).
--   · En cada carga de la página sale una de las dos al azar.
update public.tu_pagina
   set secciones = jsonb_set(jsonb_set(secciones,
         '{apariencia,portadaLuxuryMovil}', '"https://vendemias.com/assets/the247/portada-movil.webp"'),
         '{apariencia,portadasLuxuryAlternas}', jsonb_build_array(jsonb_build_object(
             'compu', 'https://vendemias.com/assets/the247/portada-alterna.webp',
             'movil', 'https://vendemias.com/assets/the247/portada-alterna-movil.webp')))
 where company_id = 'the247barbershop' and secciones ? 'apariencia';

-- Comprobación: la portada del celular y la alterna.
select secciones #>> '{apariencia,portadaLuxuryMovil}' as portada_movil,
       secciones #>  '{apariencia,portadasLuxuryAlternas}' as alternas
  from public.tu_pagina where company_id = 'the247barbershop';
