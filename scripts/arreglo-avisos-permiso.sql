-- ═══════════════════════════════════════════════════════════════════════════════
-- ARREGLO · los avisos al celular no salen (5-nov-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
-- /api/avisos/despachar fallaba cada minuto con «permission denied for function
-- panel_push_srv_pendientes»: el servidor (clave anon + x-fideliza-key, que comprueba
-- loyalty_srv_check dentro) había perdido el permiso. Todas las migraciones de avisos se lo
-- dan; en la base faltaba. Sin él, ningún aviso (reservas, pagos…) llega al celular.
-- La función sigue cerrada a quien no tenga la clave del servidor (loyalty_srv_check).
-- ═══════════════════════════════════════════════════════════════════════════════
grant execute on function public.panel_push_srv_pendientes() to anon;
grant execute on function public.panel_push_srv_resultado(uuid[], text[]) to anon;
notify pgrst, 'reload schema';

-- Comprobación: las dos en true.
select has_function_privilege('anon', 'public.panel_push_srv_pendientes()', 'execute') as pendientes,
       has_function_privilege('anon', 'public.panel_push_srv_resultado(uuid[], text[])', 'execute') as resultado;
