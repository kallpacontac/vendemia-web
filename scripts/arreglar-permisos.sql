-- ═══════════════════════════════════════════════════════════════════════════
-- QUITAR LOS PERMISOS DE MÁS EN `instances` Y `v_instance_health`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sale de la verificación del 2026-08-23 (ver SEGURIDAD.md § 4). Todas las
-- tablas del proyecto tienen un SELECT pelado para `authenticated` y nada para
-- `anon`… menos estas dos, que tienen DELETE, INSERT, SELECT y UPDATE para los
-- dos roles. Tiene pinta de un `grant all` suelto.
--
-- ── ¿ES URGENTE? NO. ¿HAY QUE HACERLO? SÍ. ────────────────────────────────
-- Hoy no se puede explotar: `instances` tiene RLS activo y su única política es
-- un SELECT para `authenticated`, así que Postgres deniega insert/update/delete
-- por no haber política que los permita. Es decir, lo que protege esos datos
-- ahora mismo es UNA sola capa.
--
-- El día que alguien desactive el RLS de `instances` para depurar algo, o añada
-- una política permisiva, `anon` —sin cuenta y sin sesión— podrá borrar filas.
-- Un permiso que no se usa y no se puede usar es un permiso que sobra.
--
-- ── QUÉ NO SE ROMPE ───────────────────────────────────────────────────────
--   · El panel: lee `v_instance_health` con sesión, y conserva su SELECT.
--   · El bot: usa la service_role, que va por otros permisos.
--   · `anon` no pierde nada que el panel use: sin sesión no se lee nada de
--     negocio, que es justo el diseño del contrato.
--
-- ⚠️ Antes de ejecutarlo, confirma que ninguna otra cosa (una página de estado,
-- un script) consulte `instances` o `v_instance_health` con la clave anon.

begin;

-- `anon` no debe poder nada con estas dos, como con el resto del esquema.
revoke all privileges on public.instances        from anon;
revoke all privileges on public.v_instance_health from anon;

-- `authenticated` solo lee. El panel nunca escribe directamente: para cambiar
-- algo inserta una fila en `commands` y el bot lo aplica.
revoke insert, update, delete, truncate, references, trigger
    on public.instances         from authenticated;
revoke insert, update, delete, truncate, references, trigger
    on public.v_instance_health from authenticated;

-- Y se deja explícito lo único que sí necesita.
grant select on public.instances         to authenticated;
grant select on public.v_instance_health to authenticated;

commit;

-- ── Comprobación ──────────────────────────────────────────────────────────
-- Debe devolver SOLO dos filas, las dos de `authenticated` y con `SELECT`.
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('instances', 'v_instance_health')
   and grantee::text in ('anon', 'authenticated')
 group by grantee, table_name
 order by grantee, table_name;
