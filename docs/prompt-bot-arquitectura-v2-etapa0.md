# Prompt para la sesión del bot · Arquitectura v2, etapa 0: medir

Pégalo tal cual. Escrito el 15-oct-2026 desde la sesión de la web.

---

## Contexto

Alvaro aprobó cambiar quién escribe cada tabla. El documento completo está en el repo de la web:
`vendemia-web/docs/ARQUITECTURA-DATOS-V2.md`. **Léelo antes de empezar.** En resumen:

- **Configuración** (catálogo, fotos, equipo, bloqueos, ajustes) y **agenda** (citas, líneas, pedidos,
  pagos, gastos) pasan a escribirse en Postgres. El bot las **baja** a SQLite y sigue leyéndolas en
  local.
- La **conversación** (leads, mensajes, eventos, retargeting, consumo) sigue siendo del bot, con el
  espejo de subida de siempre.
- El bot **no lee nada en remoto por mensaje**. Solo va a la nube al escribir agenda o configuración.

Motivo: Pide (`docs/PLAN-PIDE.md`) y Fideliza tienen negocios **sin bot** que hoy no pueden ni
guardar su catálogo.

Desde la web se midió: **~210 ms por consulta a Supabase** con la conexión abierta (420–770 ms
abriéndola), desde esta misma máquina. Lo que falta es medir el lado del bot.

## Lo que te pido: medir, sin cambiar ningún comportamiento

Instrumentación detrás de una variable (`MEDIR_V2=1`), apagada por defecto. Ningún cambio de lógica.

1. **Por turno de Mia:** número de consultas a SQLite, tiempo total en SQLite y tiempo total del turno
   (modelo incluido). Con `p50`, `p95` y máximo por negocio, después de al menos 200 turnos reales o
   del eval completo.
2. **Escrituras por día y por negocio** en cada tabla que pasa a la nube (§3 del documento), separadas
   por quién escribe: tool de Mia, comando del panel, cron, voucher, API.
3. **Inventario de escritores:** cada sitio del código que escribe en `appointments`,
   `appointment_services`, `orders`, `pending_payments`, `gastos`, `catalog` (incluido el stock),
   `catalog_media`, `employees`, `employee_blocks`, `form_templates` y `companies`, con fichero:línea y
   qué campos toca. El documento cita los que se vieron desde fuera (§5); **confírmalo o corrígelo**,
   porque de esa lista sale la etapa 4.
4. **El espejo en el último mes:** cuántas veces falló la subida, cuánto duró la cola más larga y el
   mayor retraso. Es el dato que dice cuánto pesa el riesgo 2 («Postgres caído»).
5. **El motor:** confirma que `utils/datetime.ts`, `services/tools/staff.ts`, `utils/availability.ts`,
   `utils/periodo.ts` y `utils/horario.ts` no importan nada con estado (`db`, red, reloj sin inyectar).
   Lista lo que habría que inyectar para sacarlos a `@vendemia/motor` (etapa 3).

## Lo que devuelves

Un fichero `docs/medidas-arquitectura-v2.md` en el repo del bot con las cinco secciones, y una línea
final: **«¿Algo de lo medido contradice la arquitectura?»**, con sí o no y el porqué. Si sale que sí, se
para y se replantea antes de la etapa 1.

## Lo que NO haces en esta etapa

- No cambies el espejo, ni los comandos, ni ninguna escritura.
- No toques `memberships` ni nada de roles: el corte es el 21-oct.
- No empieces la bajada. Va en la etapa 2, después de los cimientos SQL de la web.
