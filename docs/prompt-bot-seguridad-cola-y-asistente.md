# Prompt para la sesión del bot: cerrar la cola de comandos y endurecer el asistente

Pégalo tal cual. Sale de la auditoría del 12-oct-2026, hecha desde `vendemia-web` al terminar el
asistente del dueño (`/panel/asistente`, comando `preguntar_asistente`).

**Cómo se encontró todo esto:** leyendo las migraciones y `src/` de este repo. Nada se explotó contra
producción. Las líneas citadas son las del 12-oct-2026; si se han movido, busca por el texto.

**Orden:** el §1 es solo SQL, no depende de desplegar el bot y es el único crítico: va primero y
solo. Lo demás puede ir en una segunda tanda.

---

## 1 · CRÍTICO · `commands.created_by` se puede falsear

**Qué pasa.** El bot decide QUIÉN manda un comando con `commands.created_by`, y en dos sitios lo
justifica así: «lo rellena Postgres con auth.uid(), así que el panel no puede falsearlo»
(`commands.service.ts`, en `add_member` y en `preguntar_asistente`). No es verdad:

- `0006_rls.sql:62` → `grant insert on public.commands to authenticated`. Es sobre la tabla
  ENTERA: quien inserta puede dar valor a cualquier columna.
- `0002_commands.sql:35` → `created_by uuid default auth.uid()`. Un `default` solo actúa si la
  columna NO viene en el insert.
- `0023_marcar_seguimiento.sql:42` → `p_commands_insert` comprueba `is_member(company_id)`,
  `status = 'pending'` y `attempts = 0`. De `created_by` no dice nada.

**Qué permite.** Un empleado (`role = 'member'`) ve el uuid del dueño en el `created_by` de
cualquier comando anterior del negocio. Con él:

1. Inserta `add_member` con `created_by` del dueño y `payload: { email: <el suyo>, role: 'owner' }`.
   El handler comprueba `quien.role === 'owner'` sobre ESE `created_by`, y crea la membresía con
   `cmd.payload.role` tal cual (`role: (cmd.payload.role as string | undefined) ?? 'member'`).
   Resultado: una cuenta de dueño, con su contraseña temporal en `commands.result` (§2).
2. Inserta `preguntar_asistente` como el dueño: el asistente corre con las herramientas de dinero.
   Con la 0037 no puede leer la respuesta, pero gasta el cupo del día y escribe en el historial
   del dueño (`web:<uid del dueño>`), que el modelo lee en los 8 turnos siguientes.
3. Firma gastos de caja a nombre de otro (`creado_por` sale del mismo campo).

**Arreglo.** Migración nueva (`0038`). El panel solo manda `company_id`, `type` y `payload` —
comprobado en `vendemia-web/lib/supabase/commands.ts`, los únicos dos `insert`—, así que no rompe nada:

```sql
begin;

-- Insertar, sí; decir quién eres, en qué estado nace o qué resultado tiene, no.
revoke insert on public.commands from authenticated;
grant  insert (company_id, type, payload) on public.commands to authenticated;

-- Cinturón y tirantes: si alguien vuelve a dar el grant entero, la política sigue ahí.
drop policy if exists p_commands_insert on public.commands;
create policy p_commands_insert on public.commands
    for insert to authenticated with check (
        (
            public.is_member(company_id)
            or (public.es_admin_plataforma() and type = 'marcar_seguimiento')
        )
        and status     = 'pending'
        and attempts   = 0
        and created_by = auth.uid()
        and result is null
        and error  is null
    );

commit;
```

Y en el bot, aunque el SQL ya lo cierre:

- `add_member`: `role` contra una lista blanca. Desde el panel solo llega `'member'`; `'owner'`
  no debería poder crearse por esta vía.
- Corrige los dos comentarios que dicen «no puede falsearlo»: ahora será verdad, pero por la 0038.

**Cómo comprobarlo.** Añade el caso a `src/dev/smoke-aislamiento.ts`: con la sesión de B,
`insert` en `commands` con `created_by` de A → tiene que fallar (42501). Y sin `created_by` → entra
y la fila queda con el uid de B.

---

## 2 · ALTO · La contraseña temporal de `add_member`

- Se devuelve en `result.password_temporal` y la fila no se borra nunca. `p_commands_read` deja
  leerla a TODOS los miembros del negocio.
- Sale en el log: `ejecutar` hace `JSON.stringify(result)` para todo lo que no sea
  `preguntar_asistente`.

**Arreglo.**
- Log: nunca el `result` de `add_member` (ni de ningún tipo futuro con secretos). Mejor lista
  blanca de qué se loguea que lista negra.
- Lectura: en `p_commands_read`, tratar `add_member` igual que `preguntar_asistente` (solo quien lo
  creó). Va en la misma 0038 y sustituye a la política de la 0037 (la incluye):

  ```sql
  drop policy if exists p_commands_read on public.commands;
  create policy p_commands_read on public.commands
      for select to authenticated using (
          (
              public.is_member(company_id)
              and (type not in ('preguntar_asistente', 'add_member') or created_by = auth.uid())
          )
          or (public.es_admin_plataforma() and type = 'marcar_seguimiento')
      );
  ```
- Vida: quitar `password_temporal` del `result` a los 15 minutos (el panel la enseña en el momento;
  ver `vendemia-web/app/(panel)/panel/configuracion/page.tsx`, función `Usuarios`).
- Lo ya guardado: un `update` que la borre de las filas `add_member` existentes.

Nota: el plan es sustituir `add_member` por invitaciones por enlace. Esto es para mientras tanto.

---

## 3 · ALTO · La respuesta del asistente vive más de lo que dice

El handler promete «a las 24 h se borran comandos y audios». `limpiarAsistente` solo se llama DESDE
el propio handler: si nadie vuelve a preguntar, las filas —con la caja y las ventas dentro— se
quedan para siempre.

Y aunque corriera: el panel bloquea la pantalla a los 10 minutos y pide la contraseña, pero eso es
el navegador. Con la sesión abierta, un `select result from commands where type =
'preguntar_asistente'` devuelve todo lo de las últimas 24 h sin pasar por esa tarjeta.

**Arreglo.**
- Limpieza con temporizador propio (cada hora, y al arrancar), no colgada del handler.
- Vaciar `result.respuesta`, `result.transcripcion` y `result.audio.hablado` a los **5 minutos** de
  `done_at`. El panel ya tiene el texto en memoria y no relee la fila después. ⚠️ No toques
  `result.audio.estado` ni `url` antes de eso: el panel relee `result.audio` hasta 25 s después del
  texto.
- `payload.pregunta`: lo mismo, a los 5 minutos.

No incluido aquí, es decisión de Alvaro: exigir en el servidor una autenticación reciente para
insertar `preguntar_asistente` (se puede leer `auth.jwt() -> 'amr'` en la política). Hoy esa
exigencia solo la hace el panel.

---

## 4 · MEDIO · Consumo: lo que hoy no tiene tope

Lo que SÍ está acotado y no hay que tocar: `consultas_dia` (60), `MAX_ITERATIONS` (8),
`gasto_dia_usd` (0,50) y `notas_voz_mes` (150).

**4a. La transcripción va antes del tope.** `responderDesdeWeb` llama a `transcribirDeLaWeb`
(ffmpeg + Gemini) y solo después `turnoDelDueno` mira `consultasHoy`. Con el cupo agotado, cada
audio se sigue transcribiendo; y no queda en `usage_log`.
→ Mirar el tope ANTES de transcribir, contar la transcripción como consulta y registrar su uso.

**4b. No hay caducidad.** `drenar` recoge todo lo `pending`, tenga la edad que tenga. Con el bot
apagado, las preguntas se acumulan y al arrancar se contestan todas: tokens para nadie (el panel se
rinde a los 45 s) y respuestas con dinero guardadas.
→ En el handler: si `created_at` tiene más de **60 s**, `SinReintento('La pregunta caducó sin
respuesta. Vuelve a preguntar.')` sin llamar al modelo ni transcribir. Ojo con el reloj del
portátil: `created_at` lo pone Postgres; si el del bot va desfasado, 60 s se quedan cortos o largos.

**4c. No hay límite de tamaño ni de ritmo.** `payload` es `jsonb` sin tope y `drenar` hace
`select … payload … limit 50`: cincuenta payloads en memoria de golpe. Y ejecuta en fila, así que
una ráfaga de preguntas retrasa los `send_message` y los cobros del negocio.
→ `alter table public.commands add constraint commands_payload_max check
(octet_length(payload::text) <= 1500000) not valid;` (el panel manda audios de 700 KB como mucho:
~935 000 caracteres en base64) y bajar `MAX_AUDIO_BYTES` a 1 000 000.
→ Un disparador `before insert` para `preguntar_asistente`: como mucho 1 pendiente por usuario y 10
por minuto. El panel ya manda de una en una.
→ `drenar`: traer primero los ids y el `payload` de cada comando al ejecutarlo; y que una pregunta
al asistente no bloquee el resto de la cola.

**4d. El tope es del negocio.** Un empleado puede gastar las 60 consultas del dueño.
→ Un sub-tope para quien no es `owner` (p. ej. 20), o contar aparte por usuario.

---

## 5 · MEDIO · Enlaces que no salieron de una herramienta

`respaldo.ts` quita los importes que no están en lo que el código le dio al modelo. Con los enlaces
no se hace: el prompt dice «los únicos enlaces son los wa.me que te dan», pero es texto. El modelo
lee mensajes de clientes (`<dato_de_cliente>`), y si uno lo convence, puede escribir un
`https://wa.me/<otro número>?text=<la caja del día>`.

→ El mismo control que los importes: en la respuesta solo sobreviven los `https://wa.me/…` que
aparecen literalmente en `fuentes`. El resto, fuera.

El panel ya hace su parte: solo los `wa.me` son pulsables y el botón enseña el número de destino.

---

## 6 · MEDIO · `kallpabot.db` está versionada

`git ls-files` la lista, y `.gitignore` solo ignora `-shm` y `-wal`. La copia que hay en el
historial es de agosto (4 negocios, 5 leads, 36 mensajes) y está en GitHub. El riesgo vivo es un
`git add -A` que suba la base de hoy.

→ `git rm --cached kallpabot.db` y añadirla a `.gitignore`.
→ Si el repositorio no es privado, o ha tenido colaboradores, hay que sacarla también del
historial. Eso reescribe la historia: **no lo hagas sin que Alvaro lo confirme.**

---

## Criterios de aceptación

- [ ] B inserta un comando con `created_by` de A → rechazado. Sin `created_by` → entra con el suyo.
- [ ] B inserta un comando con `status: 'done'` o con `result` → rechazado.
- [ ] `add_member` con `role: 'owner'` desde un comando → rechazado por el bot.
- [ ] Un miembro que no creó el `add_member` no ve esa fila. En el log no sale la contraseña.
- [ ] A los 15 min, `result.password_temporal` es `null`.
- [ ] A los 5 min de contestar, la fila de `preguntar_asistente` no tiene texto ni transcripción;
      el audio se sigue pudiendo oír en el panel (está en memoria) y `result.audio.estado` no cambió
      durante los primeros 25 s.
- [ ] Sin ninguna pregunta nueva, a las 24 h las filas y los MP3 del bucket ya no están.
- [ ] Con el cupo del día agotado, un audio NO se transcribe.
- [ ] Bot apagado, tres preguntas encoladas, bot encendido 5 min después → las tres en `error` con
      «caducó», cero llamadas al modelo.
- [ ] Un `payload` de 3 MB → rechazado por Postgres. Once preguntas en un minuto → la undécima,
      rechazada.
- [ ] Una respuesta con un `wa.me` que no vino de una tool sale sin ese enlace.
- [ ] `git ls-files | grep kallpabot.db` no devuelve nada.

## Lo que cambia para el panel

Nada obligatorio. Dos avisos para la sesión de `vendemia-web` cuando esto esté desplegado:

- El rechazo por ritmo (§4c) hoy se vería como «No se pudo enviar la pregunta. Revisa tu conexión».
  Si el disparador devuelve un mensaje propio, dilo y el panel lo enseña.
- Si `add_member` deja de devolver la contraseña a quien no la creó, `Usuarios` no cambia: ya la
  lee solo de su propio comando.
