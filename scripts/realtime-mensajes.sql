-- ═══════════════════════════════════════════════════════════════════════════
-- MENSAJES EN VIVO EN EL PANEL: `messages` y `leads` EN REALTIME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La bandeja de Mensajes se suscribe a los INSERT de `messages`, pero la tabla
-- no está en la publicación `supabase_realtime` (las migraciones solo añaden
-- commands, sync_state e instances). El canal se suscribe sin dar error y no
-- llega ningún evento: el chat no se movía hasta recargar la página.
--
-- Desde el 24-sep-2026 el panel sondea (chat cada 4 s, lista cada 15 s), así
-- que funciona sin esto. Con esto, el mensaje aparece al instante en vez de
-- hasta 4 s después, y el sondeo queda de red por si el websocket se cae.
--
-- ── ¿ES SEGURO? ───────────────────────────────────────────────────────────
-- Realtime aplica el RLS de la tabla a cada evento: un usuario solo recibe las
-- filas que podría leer con un SELECT. `messages` tiene RLS activo y resuelve
-- el permiso a través de `leads` (SEGURIDAD.md § 2.1), así que nadie recibe
-- mensajes de otro negocio. Compruébalo con la consulta del final antes de
-- dar esto por bueno.
--
-- ── ¿DÓNDE VA? ────────────────────────────────────────────────────────────
-- En el SQL Editor de Supabase. Es idempotente: ejecutarlo dos veces no hace
-- nada la segunda. Conviene copiarlo también a las migraciones del bot
-- (vendemia/supabase/migrations) para que un entorno nuevo nazca con ello.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  -- `leads`: para que la lista reaccione a un lead nuevo o a un cambio de
  -- bot_active sin esperar al sondeo. El panel aún no escucha esta tabla; se
  -- añade ya para no tener que volver aquí cuando lo haga.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;

-- Verificación: tienen que salir las dos, con rowsecurity = true.
select p.tablename, c.relrowsecurity as rowsecurity
from pg_publication_tables p
join pg_class c on c.relname = p.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
where p.pubname = 'supabase_realtime'
  and p.schemaname = 'public'
  and p.tablename in ('messages', 'leads');
