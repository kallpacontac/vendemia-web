-- Habilita la plantilla ecommerce Impulso sin modificar las páginas existentes.
alter table public.tu_pagina
  drop constraint if exists tu_pagina_plantilla_check;

alter table public.tu_pagina
  add constraint tu_pagina_plantilla_check
  check (plantilla in ('vitrina', 'lista', 'carta', 'agenda', 'clases', 'envios', 'impulso'));
