-- The 24/7 · portada en blanco y negro (14-nov-2026). Se puede repetir.
-- La de la compu es el mismo archivo de siempre (public/assets/the247/portada.webp, ahora en B/N):
-- cambia sola al desplegar. Esto solo añade la versión vertical para el celular
-- (apariencia.portadaLuxuryMovil), que necesita el código de 14-nov desplegado.
update public.tu_pagina
   set secciones = jsonb_set(secciones, '{apariencia,portadaLuxuryMovil}', '"https://vendemias.com/assets/the247/portada-movil.webp"')
 where company_id = 'the247barbershop' and secciones ? 'apariencia';

-- Comprobación: la URL de la portada del celular.
select secciones #>> '{apariencia,portadaLuxuryMovil}' as portada_movil from public.tu_pagina where company_id = 'the247barbershop';
