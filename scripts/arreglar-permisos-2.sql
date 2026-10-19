-- ═══════════════════════════════════════════════════════════════════════════
-- PERMISOS DE MÁS · segunda vuelta (detectado el 2026-10-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mismo caso que `instances` el 2026-08-23 (SEGURIDAD.md § 4): tablas y
-- vistas creadas DESPUÉS de 0006_rls.sql heredaron los permisos por defecto de
-- Supabase — `anon` y `authenticated` con DELETE, INSERT, SELECT, UPDATE.
--
--   gastos · platform_admins · retargeting · seguimientos
--   v_movimientos · v_revenue_by_day
--
-- Hoy no es explotable: el RLS de esas tablas no tiene políticas de escritura
-- (y platform_admins no tiene ninguna), así que todo INSERT/UPDATE/DELETE se
-- rechaza. Pero queda sostenido por una sola capa: basta con desactivar el RLS
-- para depurar y cualquiera con la clave anon se haría admin de plataforma.
--
-- Qué NO rompe: el panel solo LEE esas tablas (las escrituras van por
-- `commands`) y el bot usa la service_role, que no depende de estos grants.
-- `es_admin_plataforma()` es SECURITY DEFINER: no necesita que `authenticated`
-- pueda leer platform_admins.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.gastos, public.platform_admins, public.retargeting, public.seguimientos,
              public.v_movimientos, public.v_revenue_by_day
  from anon;

revoke insert, update, delete, truncate, references, trigger
  on public.gastos, public.platform_admins, public.retargeting, public.seguimientos,
     public.v_movimientos, public.v_revenue_by_day
  from authenticated;

-- platform_admins no la lee nadie desde el panel.
revoke select on public.platform_admins from authenticated;

-- Comprobación: tiene que devolver SOLO filas de `authenticated` con SELECT.
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as permisos
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated')
   and table_name in ('gastos', 'platform_admins', 'retargeting', 'seguimientos', 'v_movimientos', 'v_revenue_by_day')
 group by grantee, table_name
 order by grantee, table_name;
