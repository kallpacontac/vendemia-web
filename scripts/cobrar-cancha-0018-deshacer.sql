-- Deshace modules/tu-pagina/sql/0018_cobrar_cancha_en_panel.sql: quita la búsqueda y los códigos
-- del panel. cancha_validar_pago se queda en su versión nueva, que acepta lo mismo que la de la
-- 0017 (los argumentos nuevos son opcionales), y v2_comprobante_aplicar sigue dando otro plazo tras
-- un pago parcial; para volver a la de antes, corre otra vez la 0017. Pagos y fotos no se tocan.
begin;
drop function if exists public.cancha_codigos(text, text[]);
drop function if exists public.cancha_buscar(text, text);
commit;
notify pgrst, 'reload schema';
