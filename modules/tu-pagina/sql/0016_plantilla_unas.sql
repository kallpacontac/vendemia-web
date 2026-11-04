-- Habilita la plantilla «Estudio de uñas» para páginas con agenda.
-- Ejecutar después de 0015_atencion_en_mesa.sql. Idempotente.
begin;

alter table public.tu_pagina drop constraint if exists tu_pagina_plantilla_check;
alter table public.tu_pagina add constraint tu_pagina_plantilla_check
  check (plantilla in ('vitrina', 'lista', 'carta', 'agenda', 'clases', 'envios', 'impulso', 'luxury', 'restaurante', 'canchas', 'mesa', 'unas'));

commit;
