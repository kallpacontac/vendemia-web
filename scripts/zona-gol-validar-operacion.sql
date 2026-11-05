-- Revierte scripts/zona-gol-demo-sin-validar-operacion.sql: Zona Gol vuelve a rechazar un
-- n.º de operación ya registrado (lo normal).
update public.tu_pagina
   set secciones = secciones #- '{canchas,validarOperacion}'
 where slug = 'zona-gol';

-- Comprobación: debe salir vacío (null) = validando.
select slug, secciones #> '{canchas,validarOperacion}' as valida_operacion from public.tu_pagina where slug = 'zona-gol';
