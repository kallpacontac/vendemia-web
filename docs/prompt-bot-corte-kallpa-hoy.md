# Prompt para la sesión del bot · el corte de kallpa, HOY (17-oct)

Pégalo en la sesión que está con `docs/prompt-bot-arquitectura-v2-etapa2.md`. Alvaro decidió
**adelantar el corte de la configuración de kallpa a hoy**: mañana es feriado y no trabajan, así que
si algo sale mal hay un día entero sin clientes para arreglarlo.

Solo **kallpa** y solo **configuración** (`companies`, `catalog`, `catalog_variantes`, `catalog_media`,
`employees`, `employee_blocks`, `form_templates`). La agenda sigue siendo tuya: es la etapa 4.

## Lo que ya está del lado de la web (en producción desde hoy)

- 0001 y 0002 aplicadas en Supabase.
- El panel, en un negocio con `config_en_nube`, ya **no encola** los 10 comandos de configuración:
  llama directo a las `cfg_*`. Pregunta quién manda una vez por minuto.
- `v2_anotar_borrado` arreglado (borrar un negocio fallaba; commit `53eb4d0` de la web).

## Lo que necesito de ti, en este orden

1. **A** (subir `catalog_variantes`) y **B** (bajada en sombra) del prompt de la etapa 2. Si B todavía no
   está, basta con que compare **una vez**, completo, la configuración de kallpa: nube contra SQLite,
   columna a columna en las columnas que existen en los dos lados.
2. **Dime las diferencias.** Tienen que ser cero o explicables (filas que el espejo aún no subió). Si
   hay alguna que no se explica, **paramos aquí**: el corte hace a la nube la dueña, y lo que esté mal
   en la nube pisaría tu SQLite.
3. **C** (el corte), solo para kallpa: el filtro del vaciado de la outbox, aplicar la bajada, tus
   escrituras de configuración por `cfg_*` / `ajustar_stock*`, los comandos de configuración rechazados
   con mensaje claro si llegan, y las escrituras de arranque apagadas para kallpa. Todo condicionado a
   `datos_v2_empresas.config_en_nube` del negocio: con `false` el comportamiento tiene que ser
   idéntico al de hoy.
4. **Reinicia el bot de kallpa** con eso y avísame. Entonces Alvaro marca a kallpa:
   `select public.datos_v2_marcar('kallpa', true, false);`
5. **La prueba**, en cuanto esté marcado:
   - desde el panel (lo hago yo con la cuenta de prueba) se cambia la descripción de un nivel;
   - tú confirmas que la bajada la aplicó en SQLite en segundos y que Mia la usa en su siguiente turno;
   - se deja la descripción como estaba y se comprueba lo mismo de vuelta.

## Vuelta atrás

`select public.datos_v2_marcar('kallpa', false, false);` → vuelves a subir y el panel vuelve a encolar
(tarda hasta un minuto en enterarse). Tu SQLite tiene todo, porque la bajada lo fue escribiendo.

## Lo que NO haces hoy

- Nada de agenda, pedidos, pagos ni gastos.
- Ningún otro negocio: piel-futbolera, default, unicos y barberia-01 siguen como están.
- Nada de roles: el corte de roles sigue siendo el 21-oct.
