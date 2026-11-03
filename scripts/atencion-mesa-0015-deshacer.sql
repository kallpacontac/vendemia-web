-- Deshace modules/tu-pagina/sql/0015_atencion_en_mesa.sql.
-- ⚠️ Borra las mesas, sus llamados y los comentarios. Las páginas con la plantilla 'mesa'
-- vuelven a 'restaurante' antes de quitarla de la lista. panel_push_srv_pendientes se queda:
-- sin eventos 'web_mesa' se comporta igual que la de avisos 0004.
begin;

update public.tu_pagina set plantilla = 'restaurante' where plantilla = 'mesa';
alter table public.tu_pagina drop constraint if exists tu_pagina_plantilla_check;
alter table public.tu_pagina add constraint tu_pagina_plantilla_check
  check (plantilla in ('vitrina', 'lista', 'carta', 'agenda', 'clases', 'envios', 'impulso', 'luxury', 'restaurante', 'canchas'));

drop function if exists public.mesa_panel_historial(text, text, integer, integer);
drop function if exists public.mesa_panel_borrar(text, uuid);
drop function if exists public.mesa_panel_nuevo_qr(text, uuid);
drop function if exists public.mesa_panel_activa(text, uuid, boolean);
drop function if exists public.mesa_panel_crear(text, text, integer, integer);
drop function if exists public.mesa_panel_mesas(text);
drop function if exists public.mesa_panel_llegue_qr(text, text);
drop function if exists public.mesa_panel_llegue(text, uuid);
drop function if exists public.mesa_panel_vivo(text);
drop function if exists public.mesa_panel_usa(text);
drop function if exists public.mesa_quien(text);
drop function if exists public.mesa_autorizar_equipo(text);
drop function if exists public.mesa_srv_pedir(text, text);
drop function if exists public.mesa_srv_carrito(text, text, text, jsonb);
drop function if exists public.mesa_srv_llamar(text, jsonb);
drop function if exists public.mesa_srv_leer(text, text);
drop function if exists public.mesa_carrito_json(uuid, text);
drop function if exists public.mesa_avisar(uuid, public.pagina_mesas, text, text, integer);
drop function if exists public.mesa_de_token(text);

drop table if exists public.mesa_carrito;
drop table if exists public.mesa_llamados;
drop table if exists public.pagina_mesas;

commit;
