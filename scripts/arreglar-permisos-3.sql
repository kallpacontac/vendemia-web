-- ═══════════════════════════════════════════════════════════════════════════
-- PERMISOS DE MÁS · tercera vuelta (detectado el 2026-10-16)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mismo caso que arreglar-permisos-2.sql: tablas creadas DESPUÉS de 0006_rls.sql
-- heredaron los permisos por defecto de Supabase. Comprobado con la clave anon contra
-- PostgREST: estas dos devuelven `[]` en vez de «permission denied», o sea que `anon`
-- tiene SELECT y solo el RLS lo frena.
--
--   consumo_mensual · recargas        (migración 0036 del bot)
--
-- (datos_v2_empresas y sync_borrados tenían lo mismo; se arreglan en
-- modules/datos/sql/0002_variantes_y_ajustes.sql.)
--
-- Qué NO rompe: el panel solo LEE estas tablas, con sesión (políticas p_consumo_read y
-- p_recargas_read); el bot escribe con la service_role, que no depende de estos grants.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.consumo_mensual, public.recargas from anon;

revoke insert, update, delete, truncate, references, trigger
  on public.consumo_mensual, public.recargas
  from authenticated;

grant select on public.consumo_mensual, public.recargas to authenticated;

-- Comprobación: las dos tienen que salir sin privilegios para anon y solo SELECT para
-- authenticated.
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('consumo_mensual', 'recargas')
   and grantee in ('anon', 'authenticated')
 group by table_name, grantee
 order by table_name, grantee;
