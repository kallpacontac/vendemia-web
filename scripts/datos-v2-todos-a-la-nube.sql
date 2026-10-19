-- ═══════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · TODOS los negocios con la CONFIGURACIÓN en la nube
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decidido por Alvaro el 19-oct-2026: lo que hizo kallpa el 17-oct, para todos.
-- Catálogo, fotos, opciones, equipo, bloqueos, formularios y datos del negocio
-- los escribe el panel directo en Supabase (cfg_*); el bot que esté corriendo
-- los BAJA a su SQLite (bajada.service.ts, genérico por negocio). Sin bot, por
-- fin se puede editar el catálogo (barberia-01 llevaba comandos colgados desde
-- el 11-sep).
--
-- Solo CONFIGURACIÓN. La agenda (citas, pedidos, pagos) sigue en el bot: la
-- columna agenda_en_nube no la usa nadie todavía (etapa 4) y aquí no se toca.
--
-- ⚠️ Lo que se asume, y por qué con kallpa se comparó antes:
--   desde el corte la nube es la dueña. Si el SQLite de un bot que corre tiene
--   algo que nunca llegó a Supabase (una fila que el espejo no subió), la bajada
--   lo pisa con lo de la nube. Si algún negocio con bot tiene cambios recientes
--   de catálogo hechos por Mia o por la API, compruébalo antes (PASO 1, columna
--   bot_visto) o pídele a la sesión del bot que compare como hizo con kallpa.
--
-- Ejecútalo en el editor SQL de Supabase (rol postgres). Inserta directo en
-- datos_v2_empresas: datos_v2_marcar() exige sesión de admin de plataforma, que
-- el editor no tiene.
-- ═══════════════════════════════════════════════════════════════════════════

-- PASO 1 · Mirar. Solo lectura.
select c.id,
       c.name,
       c.business_mode,
       coalesce(d.config_en_nube, false)          as ya_en_nube,
       i.status                                   as instancia,
       i.heartbeat                                as bot_visto,
       (select count(*) from public.catalog k  where k.company_id = c.id) as productos,
       (select count(*) from public.commands m where m.company_id = c.id and m.status = 'pending') as comandos_colgados
  from public.companies c
  left join public.instances i on i.company_id = c.id
  left join public.datos_v2_empresas d on d.company_id = c.id
 where c.id not like 'zz-%'
 order by ya_en_nube, c.id;

-- PASO 2 · Marcar todos. Vuelta atrás de uno: update … set config_en_nube = false where company_id = '<id>';
insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube, cambiado_at)
select c.id, true, false, now()
  from public.companies c
 where c.id not like 'zz-%'
on conflict (company_id) do update
   set config_en_nube = true,
       cambiado_at    = now();

-- PASO 3 · Los comandos de configuración que quedaron en cola ya no los ejecuta nadie
-- (el panel escribe directo y el bot rechaza los de un negocio de la nube). Mira cuáles
-- son y bórralos: lo que decían, el dueño lo vuelve a guardar desde el panel.
select company_id, type, id
  from public.commands
 where status = 'pending'
   and type in ('update_company', 'upsert_catalog_item', 'delete_catalog_item', 'upsert_catalog_media',
                'set_primary_media', 'delete_catalog_media', 'upsert_employee', 'delete_employee',
                'upsert_employee_block', 'delete_employee_block')
 order by company_id, type;

-- delete from public.commands
--  where status = 'pending'
--    and type in ('update_company', 'upsert_catalog_item', 'delete_catalog_item', 'upsert_catalog_media',
--                 'set_primary_media', 'delete_catalog_media', 'upsert_employee', 'delete_employee',
--                 'upsert_employee_block', 'delete_employee_block');

-- PASO 4 · Comprobar: todos con config_en_nube = true.
select company_id, config_en_nube, agenda_en_nube, cambiado_at
  from public.datos_v2_empresas order by company_id;
