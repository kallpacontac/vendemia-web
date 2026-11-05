# Checklist de pruebas · Canchas con adelanto (Zona Gol)

Para marcar a mano. Cada prueba dice qué hacer y qué tiene que pasar. Si algo no pasa, anota el
número y qué viste, mejor con captura.

**Lo prometido:** reservas, cupos, horarios, ingresos, quién reservó y sus datos, lista de espera,
recordatorios y validación de Yape o Plin por Mia, con adelanto de S/ 40 y sin overbooking.

**Si hay poco tiempo:** 0 completo, 1.1 a 1.5, 2.1 a 2.4, 3.1 a 3.4 y 4B.1 a 4B.8.

**Hoy Zona Gol va sin bot:** no hay un número propio para conectarla, así que el comprobante se sube en la página.
Las secciones 3.7, 4 y 5 quedan para cuando el negocio tenga su número.

Hay cuatro niveles, y solo el ejemplo no demuestra que funciona de verdad:

| Nivel | Qué es | Qué demuestra |
|---|---|---|
| **Ejemplo** `/ejemplos/canchas` | Datos inventados, no guarda nada. Mia está simulada | Sirve para enseñar |
| **Empresa `zona-gol`** | Base real, con datos sembrados | Reservas, horarios, dinero, datos y lista de espera |
| **`zona-gol` + validación en la página** | Lo anterior, subiendo la captura | Validación del Yape, sin WhatsApp |
| **`zona-gol` + bot** | Requiere un número solo para este negocio | Mia por chat y recordatorios |

---

## 0 · Preparar la empresa de ejemplo

- [ ] Vercel desplegó esta versión.
- [ ] En el editor SQL de Supabase, corre `modules/tu-pagina/sql/0017_pago_de_cancha.sql`.
- [ ] Abre `scripts/zona-gol-demo.sql`, pon tu celular en `v_whatsapp` y el titular del Yape en `v_titular`, y córrelo entero.
      Zona Gol queda como segundo negocio de **subovideodetodo@gmail.com**, sin tocar su contraseña. La última consulta
      devuelve una fila con 7 ítems de catálogo y decenas de reservas.
- [ ] Entra en el panel con subovideodetodo@gmail.com y cambia de negocio a **Zona Gol** con el selector.
- [ ] Abre `agenda.vendemias.com/zona-gol` en otro celular, sin sesión y con datos móviles.
- [ ] `GEMINI_API_KEY` y las tres `CLOUDINARY_*` en Vercel, en Production. Sin la primera, todo queda por revisar a mano.
- [ ] El Yape y Plin de Zona Gol es el **947 144 701**: los comprobantes de prueba tienen que ir a ese número.
- [ ] ⚠️ **No conectes Zona Gol al número 51907863118 ni pongas ese número en botones de la página:** lo contesta el bot de
      otro negocio. Los puntos 4 y 5 solo se prueban con un número propio y `docs/prompt-bot-canchas-adelanto.md`.

Para borrarlo todo: `scripts/zona-gol-demo-deshacer.sql`.

---

## 1 · Reservar y apartar (cliente)

- [ ] **1.1** Abre la página. → Modalidades, días y horas, sin deslizar de lado.
- [ ] **1.2** Mira los precios. → 5 vs 5 S/ 90, 6 vs 6 S/ 110, 7 vs 7 S/ 140 y 9 vs 9 S/ 180.
- [ ] **1.3** Elige **9 vs 9** y una hora libre. → Total S/ 180, adelanto S/ 40, resto en la cancha S/ 140.
- [ ] **1.4** Pon nombre y **el celular de tu WhatsApp**, y toca **Apartar mi cancha**.
      → «Tu cancha está apartada, falta confirmarla», con el plazo de 30 minutos y un código `R-XXXX`.
- [ ] **1.5** Mira el paso 2. → Sale tu número de Yape y el titular. Si dice «Te pasamos el número en el chat»,
      falta la `0017` o no hay número en `payment_methods`.
- [ ] **1.6** Solo con la opción **Por WhatsApp** o **Las dos**, y con número propio: toca **Confirmar mi reserva por WhatsApp**.
      → Abre el chat del negocio con el código, cancha, día, hora, total, adelanto y resto.
- [ ] **1.7** Reserva dos turnos seguidos con **+**. → Total S/ 360, adelanto S/ 40, resto S/ 320.

---

## 2 · Horarios, cupos y quién reservó (dueño)

- [ ] **2.1** Abre **Reservas → Canchas** en el día de 1.4. → Una columna por cancha y una fila por hora.
      La reserva sale con tu nombre y **Esperando pago**.
- [ ] **2.2** Toca la reserva. → Cancha, hora, celular, total y estado. **Escribirle por WhatsApp** abre el chat.
- [ ] **2.3** Compara con la página pública. → Lo ocupado y lo libre coinciden hora por hora.
- [ ] **2.4** Cuenta las casillas libres. → «Horas libres» da lo mismo.
- [ ] **2.5** Reservas de dos turnos. → Un solo bloque que ocupa dos filas.
- [ ] **2.6** Hoy. → Las horas pasadas salen rayadas y no cuentan como libres.
- [ ] **2.7** Toca una casilla libre. → Abre **Nueva reserva** con cancha, día y hora ya puestos.
- [ ] **2.8** En el celular del dueño. → Una cancha cada vez, con botones para cambiar.

---

## 3 · Sin overbooking

- [ ] **3.1** Con dos celulares, aparta la misma cancha y hora a la vez. → Entra uno. El otro lee «Alguien acaba
      de reservar esa cancha» y la hora se pinta ocupada.
- [ ] **3.2** Con una cancha ya apartada, intenta reservarla. → Sale ocupada, con «Avísame».
- [ ] **3.3** Aparta la **Cancha Principal** y luego la **Cancha Anexo**, las dos 7 vs 7 a la misma hora. → Las dos
      entran: cada cancha se ocupa por separado.
- [ ] **3.4** Desde el panel, **Nueva reserva** en una cancha y hora ocupadas. → No deja, y explica el motivo.
- [ ] **3.5** Aparta y **espera 31 minutos sin pagar**. → Se vuelve a ofrecer en la página y en el tablero.
- [ ] **3.6** Reserva esa hora con otro número. → Entra. La apartada anterior queda cancelada.
- [ ] **3.7** ⚠️ Pídele a Mia por chat una cancha ocupada. → **No debe reservarla.** Hoy lo frena solo una regla
      escrita; el bloqueo real es el punto 6 del prompt del bot. Si la reserva, es overbooking: no lo enseñes.

---

## 4 · Mia valida el Yape o Plin (con el bot)

Usa un celular cuyo número sea el mismo que pusiste al reservar.

- [ ] **4.0** ⚠️ Con un número que **nunca** le haya escrito al negocio, reserva y envía el mensaje **al instante**.
      → Mia debe ver tu reserva. Si no la ve, es el punto 2 del prompt: espera 15 segundos antes de enviar y anótalo.
- [ ] **4.1** Manda el mensaje de 1.6. → Mia pide la captura de **S/ 40, no el total**, con el número. No ofrece horarios.
- [ ] **4.2** Yapea S/ 40 al número y manda la captura. → Mia confirma la reserva y dice que faltan S/ 140.
- [ ] **4.3** En el tablero, actualiza. → «Por cobrar · S/ 40 de S/ 180», sin borde punteado.
- [ ] **4.4** Reenvía la misma captura. → Rechazada: ya se envió.
- [ ] **4.5** Manda una captura a **otro** número. → Rechazada. La reserva no cambia.
- [ ] **4.6** Plin en vez de Yape. → Igual que 4.2.
- [ ] **4.7** ⚠️ Yapea menos de S/ 40. → Debe seguir apartada y decir cuánto falta. **Hoy lo confirmaría:** es el
      punto 4 del prompt.
- [ ] **4.8** Paga desde un número distinto al de la reserva, citando el código. → Debe enganchar la reserva. **Hoy
      no:** es el punto 8 del prompt.
- [ ] **4.9** Paga el total. → Confirmada y **Cobrada**.

---

## 4B · Subir el comprobante en la página (sin bot)

Se elige en **Mi página → Agregar funciones → Canchas por horas**. `zona-gol` viene con **Subiéndolo en la página** y validación
**automática**. Usa una reserva distinta en cada prueba de rechazo.

- [ ] **4B.1** Aparta una cancha, yapea S/ 40 y toca **Subir mi comprobante aquí**. → «¡Pago validado! Tu reserva está
      confirmada» y lo que falta. El tablero dice «Por cobrar · S/ 40 de S/ X».
- [ ] **4B.2** Sube la misma captura. → «Esta misma captura ya se envió antes…».
- [ ] **4B.3** Sube una foto cualquiera. → «Esta imagen no es un comprobante de pago…».
- [ ] **4B.4** Sube un comprobante pagado a **otro** número. → «El pago se hizo a otro número…».
- [ ] **4B.5** Sube uno de hace más de 4 horas. → «El comprobante tiene más de 4 horas…».
- [ ] **4B.6** Sube uno de S/ 10. → «Recibimos S/ 10, todavía no alcanza…». La reserva sigue apartada.
- [ ] **4B.7** Sube una captura recortada, sin monto o sin destinatario. → «Recibimos tu comprobante». En **Reservas** sale
      la tarjeta **Comprobantes por revisar**, con el motivo, y suena el aviso en el celular.
- [ ] **4B.8b** Sin comprobante: abre una reserva **Esperando pago** en el tablero → **Validar pago** con S/ 40 por Yape.
      → Queda confirmada, «Por cobrar · S/ 40 de S/ X». Con S/ 10 sigue apartada y dice cuánto falta.
- [ ] **4B.8c** Entra con una cuenta de **empleado**. → No ve «Comprobantes por revisar», no puede validar y no le llegan esos avisos.
- [ ] **4B.8** **Aprobar pago**. → Se confirma y queda en la Caja. **Rechazar**: desaparece y la reserva sigue apartada.
- [ ] **4B.9** Cambia a **Yo: lo apruebo en Reservas**. → Toda captura queda por revisar, sin confirmarse sola.
- [ ] **4B.10** Cambia a **Por WhatsApp**. → La página ya no ofrece subirla. No envíes el mensaje si el número es compartido, y vuelve a **Subiéndolo en la página**.
- [ ] **4B.11** ⚠️ Mira los registros de Vercel tras las pruebas. → Sin `comprobante_lectura_error`. Si aparece y todo se va a
      «por revisar», falla la lectura: `gemini_400`/`gemini_403` es la clave o el modelo, `gemini_429` el límite y `json` la respuesta.

---

## 5 · Recordatorio (con el bot y `REMINDERS_ENABLED=true`)

- [ ] **5.1** Reserva con tu número para dentro de 2 horas y paga el adelanto.
- [ ] **5.2** Espera. → Te llega el recordatorio con cancha y hora, entre 1 y 3 horas antes.
- [ ] **5.3** Una reserva **sin pagar** a la misma hora. → No recibe recordatorio.
- [ ] **5.4** Lee el texto. → Si dice «cita», falta el punto 5 del prompt.
- [ ] **5.5** Revisa que ningún cliente inventado (`5190000…`) reciba nada. Mira el log del bot.

---

## 6 · Cuánto ingresa (dueño)

El **tablero** cuenta el dinero de las reservas de ese día. La **Caja** lo cuenta el día que entró.

| Paso, con una reserva de S/ 180 | Tablero · Ya cobrado | Tablero · Falta cobrar | Caja · Entró hoy |
|---|---|---|---|
| Recién apartada | sin cambio | +180 | sin cambio |
| Adelanto de S/ 40 validado | +40 | −40 | +40, como «A cuenta» |
| Cobra el resto en la cancha | +140 más | −140 más | +140 más |

- [ ] **6.1** Apunta las cifras antes de empezar y comprueba cada fila de la tabla.
- [ ] **6.2** Sin bot: **Próximas → Registrar pago** de S/ 40 por Yape. → Igual que la segunda fila.
- [ ] **6.3** **Caja** de hoy. → Entró, por método; y «A cuenta · por cobrar» con esa reserva.
- [ ] **6.4** **Caja** de días pasados. → Tiene dinero sembrado.
- [ ] **6.5** **Métricas → Ingresos** y **Dashboard**. → Anota lo que muestran. Por la regla del 8-sep, una reserva
      confirmada ya cuenta como ingreso aunque no esté cobrada: **Métricas puede dar más que la Caja**.
- [ ] **6.6** Cancela una reserva sin pagos. → La hora se libera y sale del tablero.
- [ ] **6.7** Cancela una reserva **con** adelanto. → Anota qué pasa con ese dinero. No está definido si se devuelve:
      decídelo antes de que lo pregunten.
- [ ] **6.8** Pasada la hora, en **Por revisar**, marca **No vino**. → El tablero la tacha y deja de sumarla.

---

## 7 · Lista de espera

- [ ] **7.1** Como cliente, toca una hora ocupada. Deja nombre y celular, y acepta la casilla. → «Listo».
- [ ] **7.2** Sin marcar la casilla. → Pide marcarla.
- [ ] **7.3** **Mi página → Avísame**. → Sale esa persona, junto a los dos sembrados de mañana por la noche.
- [ ] **7.4** Cancela la reserva de esa hora. → Sale «Se liberó» y, con avisos activados, suena en el celular.
- [ ] **7.5** Toca escribirle. → Abre WhatsApp con el mensaje listo. **Hoy no se le escribe solo.**

---

## 8 · También del dueño

- [ ] **8.1** **Nueva reserva** por teléfono, cliente nuevo. → Sale en el tablero y en la página.
- [ ] **8.2** **Repetir cada semana** durante 4 semanas. → Crea las 4 y dice si saltó alguna ocupada.
- [ ] **8.3** **Próximas → Turnos fijos**: **4 semanas más** y **Cancelar**. → Solo se cancelan las que faltan.
- [ ] **8.4** **Próximas → Consumos**: 2 Gaseosas. → El total sube S/ 10, también en el tablero, y el stock baja a 22.
- [ ] **8.5** Quita una. → Baja S/ 5 y el stock vuelve a 23.
- [ ] **8.6** Marca «No vino» dos veces al mismo cliente. → **Por revisar → Faltan seguido** lo muestra.
- [ ] **8.7** **Mi página → Agregar funciones → Canchas por horas**. → Se ve el adelanto de S/ 40 y el plazo de 30 minutos.
      Cámbialo a S/ 50 y aparta otra. → La página pide S/ 50. Vuélvelo a S/ 40.
- [ ] **8.8** Si el cliente tiene vóley u otro deporte: la portada dice **FÚTBOL** porque el texto es fijo.

---

## Qué falta y de quién depende

| Qué | Estado | Dónde |
|---|---|---|
| Cliente nuevo que escribe antes de que baje la reserva | Falta; riesgo de no confirmar | Prompt del bot, punto 2 |
| Mia pide el total en vez del adelanto | Cubierto a medias con `custom_rules` | Prompt del bot, punto 3 |
| Adelanto mínimo: hoy cualquier monto confirma | Falta | Prompt del bot, punto 4 |
| Mia no debe reservar canchas por chat | Falta; riesgo de overbooking | Prompt del bot, punto 6 |
| Confirmar comprobando la cancha, no el aforo | Falta; en `zona-gol` lo cubre `capacity = 5` | Prompt del bot, punto 7 |
| Validar por código `R-XXXX` | Falta; hoy va por teléfono | Prompt del bot, punto 8 |
| Aviso automático de la lista de espera | Falta; lo envía el dueño con un toque | Sin prompt todavía |
| Pago en línea | No existe; se paga por fuera y se valida la captura | Decisión |
| Devolución del adelanto | Sin definir | Decisión tuya |

## Comparación con Cancheria

Referencia: [cancheria.com](https://cancheria.com/). Su pantalla del jugador pide cuenta, así que solo se
vio su presentación. Revisado el 5-nov-2026: publica US$ 49 y US$ 69 al mes por 3 canchas.

| Cancheria | Nosotros |
|---|---|
| Página propia que reserva sola | Sí |
| Sin dobles reservas | Sí en la página y el panel; por chat, ver punto 3.7 |
| Panel con «Reservas de hoy», «Lo que ingresó», «Pagó / Debe» | Sí, con el tablero |
| Caja del día y clientes | Sí |
| Lista de espera | Sí, pero el dueño avisa a mano |
| Marcar quién no vino y quién debe | Sí |
| Consumo cargado a la reserva | Sí |
| Recordatorios | Sí con el bot encendido |
| Asistente que contesta | Mia valida pagos; no reserva canchas |
| Cafetería con inventario y ganancia | A medias: productos y stock, sin ganancia |
| Descargar toda tu información | Falta: solo leads y comisiones |
| Torneos | Descartado por decisión tuya |
| Validar Yape o Plin y adelanto | Lo tenemos; su página no lo menciona |
| Turno fijo semanal | Lo tenemos; su página no lo menciona |
