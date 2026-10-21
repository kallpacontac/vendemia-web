-- Permite el diseño Luxury sin modificar las migraciones anteriores.
alter table public.tu_pagina drop constraint if exists tu_pagina_plantilla_check;
alter table public.tu_pagina add constraint tu_pagina_plantilla_check
  check (plantilla in ('vitrina', 'lista', 'carta', 'agenda', 'clases', 'envios', 'impulso', 'luxury'));
