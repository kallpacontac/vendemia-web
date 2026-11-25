-- Deshace tu-pagina 0037: sin foto del ticket (las fotos ya subidas siguen en Cloudinary).
begin;
drop function if exists public.mi_agenda_ticket_foto(text, text, text, text);
drop table if exists public.ticket_fotos;
commit;
notify pgrst, 'reload schema';
