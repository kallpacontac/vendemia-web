-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN DE SEGURIDAD · pégalo entero en el SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Responde de una vez a las tres preguntas que NO se pueden comprobar desde el
-- panel (ver SEGURIDAD.md § 4):
--
--   1 · ¿Está el RLS activo en todas las tablas de negocio?
--   2 · ¿Las vistas v_* se saltan el RLS? ← lo más fácil de que pase inadvertido
--   3 · ¿La política de INSERT en `commands` comprueba la membresía?
--
-- Es SOLO DE LECTURA: mira el catálogo de Postgres, no toca ni una fila.
--
-- Cómo leerlo: cada fila trae una columna `estado`. Todo lo que empiece por
-- "REVISAR" es lo único que hay que mirar; el resto es "OK".
--
-- Una sola consulta a propósito: el editor de Supabase solo enseña el resultado
-- de la última sentencia, así que partirlo en varias haría perder las primeras.

with
  -- 1 · Sin RLS, un GRANT de SELECT deja la tabla entera a la vista de
  --     cualquiera que tenga cuenta. La tabla no filtra por empresa sola.
  rls(orden, comprobacion, objeto, estado, detalle) as (
    select
      1,
      'RLS activo en la tabla',
      c.relname::text,
      case when c.relrowsecurity then 'OK' else 'REVISAR · SIN RLS' end,
      case when c.relrowsecurity and not exists (
             select 1 from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname)
           then 'RLS activo pero SIN POLÍTICAS: no devuelve nada a nadie'
           else '' end
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),

  -- 2 · ⚠️ EL PUNTO IMPORTANTE.
  --     Una vista normal corre con los permisos de SU DUEÑO, no con los de
  --     quien consulta, así que se salta el RLS de las tablas de debajo. Si
  --     v_daily_metrics no es security_invoker y `authenticated` tiene SELECT
  --     sobre ella, cualquiera con cuenta lee las métricas de TODAS las
  --     empresas cambiando el company_id del filtro.
  --
  --     Se arregla con:
  --       alter view public.v_daily_metrics set (security_invoker = true);
  vistas(orden, comprobacion, objeto, estado, detalle) as (
    select
      2,
      'Vista · ¿respeta el RLS?',
      c.relname::text,
      case when coalesce(array_to_string(c.reloptions, ','), '') ~ 'security_invoker=(true|on)'
           then 'OK · invoker'
           else 'REVISAR · SE SALTA EL RLS' end,
      coalesce(array_to_string(c.reloptions, ','), '(sin opciones)')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  ),

  -- 3 · Una función SECURITY DEFINER también se salta el RLS: tiene que
  --     comprobar la membresía por dentro, o cualquiera le pasa el company_id
  --     de otro negocio. Se listan las DEFINER y, siempre, analytics_products.
  funciones(orden, comprobacion, objeto, estado, detalle) as (
    select
      3,
      'Función · ¿se salta el RLS?',
      p.proname::text,
      case when p.prosecdef
           then 'REVISAR · SECURITY DEFINER'
           else 'OK · invoker' end,
      pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (p.prosecdef or p.proname = 'analytics_products')
  ),

  -- 4 · Lo esperado: `anon` sin nada; `authenticated` con SELECT y con INSERT
  --     SOLO en `commands`. Ni UPDATE ni DELETE en ninguna parte — el panel no
  --     los usa y el espejo los pisaría igual.
  permisos(orden, comprobacion, objeto, estado, detalle) as (
    select
      4,
      'Permisos de ' || g.grantee::text,
      g.table_name::text,
      string_agg(g.privilege_type::text, ', ' order by g.privilege_type::text),
      case
        when g.grantee::text = 'anon' then 'REVISAR · anon no debería poder nada'
        when 'UPDATE' = any(array_agg(g.privilege_type::text)) then 'REVISAR · UPDATE de más'
        when 'DELETE' = any(array_agg(g.privilege_type::text)) then 'REVISAR · DELETE de más'
        when 'INSERT' = any(array_agg(g.privilege_type::text)) and g.table_name::text <> 'commands'
          then 'REVISAR · INSERT fuera de commands'
        else ''
      end
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee::text in ('anon', 'authenticated')
      and g.privilege_type::text in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    group by g.grantee, g.table_name
  ),

  -- 5 · Aquí es donde se lee la política de `commands`. Su WITH CHECK de INSERT
  --     tiene que exigir las tres cosas: company_id de una empresa del usuario,
  --     status = 'pending' y created_by = auth.uid(). Si no comprueba la
  --     membresía, cualquier usuario encola un update_company sobre el negocio
  --     de otro, y el panel no pinta nada ahí: se hace contra la API.
  politicas(orden, comprobacion, objeto, estado, detalle) as (
    select
      5,
      'Política ' || p.cmd,
      (p.tablename || ' · ' || p.policyname)::text,
      coalesce(p.roles::text, ''),
      left(coalesce(p.with_check, p.qual, '(sin condición)'), 400)
    from pg_policies p
    where p.schemaname = 'public'
  )

select comprobacion, objeto, estado, detalle
from (
  select * from rls
  union all select * from vistas
  union all select * from funciones
  union all select * from permisos
  union all select * from politicas
) t
order by orden, comprobacion, objeto;
