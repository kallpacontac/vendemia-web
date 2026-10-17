-- ═══════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · ¿qué negocios ya existentes no tienen bot?
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Los negocios creados en la web DESPUÉS de la 0001 nacen «de la nube» solos
-- (trigger v2_alta_en_nube). Los de antes, no: hay que marcarlos a mano, y hasta
-- entonces su panel sigue mandando comandos a un bot que no existe (el caso de
-- barberia-01, con 9 comandos colgados desde el 11-sep).
--
-- PASO 1 · Mirar la lista. Solo lectura.
-- PASO 2 · Marcar los que de verdad no tienen bot (abajo, comentado).
--
-- ⚠️ No marques un negocio que SÍ tiene bot corriendo: su panel escribiría en la
-- nube y el espejo del bot lo pisaría en cuanto tocara esa fila. Para esos es la
-- etapa 2 (bajada del bot), no esto. Ante la duda, mira `bot_visto`.
-- ═══════════════════════════════════════════════════════════════════════════

select c.id,
       c.name,
       c.business_mode,
       i.status                                   as instancia,
       i.heartbeat                                as bot_visto,
       (select count(*) from public.catalog k  where k.company_id = c.id) as productos,
       (select count(*) from public.leads l    where l.company_id = c.id) as clientes,
       (select count(*) from public.commands m where m.company_id = c.id and m.status = 'pending') as comandos_colgados,
       exists (select 1 from public.loyalty_settings s where s.company_id = c.id) as tiene_fideliza
  from public.companies c
  left join public.instances i on i.company_id = c.id
 where not exists (select 1 from public.datos_v2_empresas d where d.company_id = c.id)
   and c.id not like 'zz-%'
 order by (i.company_id is null) desc, c.created_ts desc nulls last;

-- PASO 2 · Por cada negocio sin bot (sin instancia, o con un bot que no se va a volver a
-- encender), descomenta y ajusta. La configuración y la agenda pasan a la nube.
--
-- select public.datos_v2_marcar('<id-del-negocio>', true, true);
--
-- Sus comandos de configuración colgados ya no los ejecutará nadie: si quedan, bórralos
-- después de mirarlos (lo que dicen ya no aplica, el dueño volverá a guardarlo):
--
-- delete from public.commands
--  where company_id = '<id-del-negocio>' and status = 'pending'
--    and type in ('update_company', 'upsert_catalog_item', 'delete_catalog_item', 'upsert_catalog_media',
--                 'set_primary_media', 'delete_catalog_media', 'upsert_employee', 'delete_employee',
--                 'upsert_employee_block', 'delete_employee_block');
