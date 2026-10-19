-- ═══════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · TODOS los negocios con la AGENDA en la nube (etapa 4)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decidido por Alvaro el 19-oct-2026, con los bots APAGADOS (feriado).
-- Requisitos, en este orden:
--   1. modules/datos/sql/0004_agenda_en_nube.sql aplicada.
--   2. La web desplegada con el commit que desvía los comandos de agenda
--      (lib/supabase/commands.ts → RPC_DE_AGENDA).
--   3. Este script.
--
-- ⚠️ Los bots NO se vuelven a encender hasta que hagan su parte
-- (docs/prompt-bot-agenda-en-nube.md). Encendidos como hoy, su espejo subiría la
-- agenda de SQLite encima de la de la nube.
--
-- Vuelta atrás de un negocio: update public.datos_v2_empresas set agenda_en_nube = false where company_id = '<id>';
-- (solo tiene sentido antes de encender su bot; lo escrito en la nube mientras tanto
-- no está en su SQLite).
-- ═══════════════════════════════════════════════════════════════════════════

-- PASO 1 · Marcar todos (la configuración ya lo está desde datos-v2-todos-a-la-nube.sql).
insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube, cambiado_at)
select c.id, true, true, now()
  from public.companies c
 where c.id not like 'zz-%'
on conflict (company_id) do update
   set config_en_nube = true,
       agenda_en_nube = true,
       cambiado_at    = now();

-- PASO 2 · Los comandos de agenda que quedaron en cola ya no los ejecuta nadie: el panel
-- escribe directo. Míralos; lo que decían se vuelve a hacer desde el panel.
select company_id, type, id, payload
  from public.commands
 where status = 'pending'
   and type in ('crear_cita', 'modificar_cita', 'marcar_pagado', 'registrar_pago', 'marcar_cumplido',
                'actualizar_lead', 'upsert_gasto', 'delete_gasto')
 order by company_id, type;

-- delete from public.commands
--  where status = 'pending'
--    and type in ('crear_cita', 'modificar_cita', 'marcar_pagado', 'registrar_pago', 'marcar_cumplido',
--                 'actualizar_lead', 'upsert_gasto', 'delete_gasto');

-- PASO 3 · Comprobar.
select company_id, config_en_nube, agenda_en_nube, cambiado_at
  from public.datos_v2_empresas order by company_id;
