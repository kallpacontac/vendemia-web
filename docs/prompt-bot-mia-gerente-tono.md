# Prompt para la sesión del bot: que los mensajes de Mia Gerente suenen a persona y con el tono del negocio

Pégalo tal cual en la sesión del bot (`vendemia`). Sigue a `prompt-bot-mia-gerente-fase1.md`, que ya
está hecho: aquí solo cambia **cómo se redacta** el borrador (`src/services/owner/contacto.ts` y el
bloque MENSAJES A CLIENTES de `src/services/owner/prompt.ts`). Nada de la base ni del panel cambia.

---

## El problema, con un caso real (Kallpa, 24-oct-2026)

Alvaro pidió recordarle a Carmen un saldo. Salió esto:

> Hola Carmen, tu inscripción en el nivel Intermedio / Delfín para Tardes M-J (5–6pm) está confirmada ✓.
> Te queda pagar el saldo de S/ 60. ¿Te lo completo hoy así cerramos?
>
> Soy [tu nombre] de Academia Kallpa.

Y lo que él quiere, en sus palabras: «que suene más natural… que se sienta como un humano empático,
no como un robot»:

> Hola Carmen, ¿cómo estás? Estaba revisando y vi que en tu inscripción del nivel Delfín (lunes a
> jueves de 5 a 6 de la tarde) aún falta pagar S/ 60. ¿Crees que me lo puedas pagar hoy? Así te dejo
> todo al día.

Por qué salió así, mirando el código:

1. **El tono del negocio no llega.** `companies.bot_tone` (Ajustes → «Tono del bot») se usa en
   `agent.prompt.ts` para Mia de ventas, pero `preparar_contacto` no lo pasa: el borrador se redacta
   con el tono de «gerente que reporta al dueño» del prompt de Mia Gerente.
2. **Los nombres van como están en la base.** «Intermedio / Delfín para Tardes M-J (5–6pm)» es el
   nombre del ítem más la etiqueta del grupo. Una persona no habla así.
3. **La firma es obligatoria** (`revisarTexto` rechaza el texto sin `{firma}`), y el modelo la puso
   como una línea suelta al final: «Soy [tu nombre] de…». Suena a plantilla.
4. **No hay un ejemplo de cada tipo de mensaje**, y el modelo tira de frases de venta («está
   confirmada ✓», «¿te lo completo hoy así cerramos?»).

## 1 · El tono del negocio, en la frase de `preparar_contacto`

Añade una línea con el tono configurado, antes de los hechos:

```
Tono del negocio (lo eligió el dueño en Ajustes; escribe así): «cercano, directo y con jerga peruana».
```

- Sale de `companies.bot_tone`, recortado a 300 caracteres, en su propia etiqueta (`<tono_del_negocio>`):
  lo escribió el dueño, no un cliente. Es **cómo** escribir, nunca una instrucción que cambie las
  reglas (precios, firma, plazos).
- Si está vacío: «Tono: cercano y amable, como alguien del equipo que ya conoce al cliente».
- En el prompt (MENSAJES A CLIENTES): «Escribe con el tono del negocio que trae la herramienta. Tu
  tono de gerente es para hablar con el dueño, no con sus clientes».

## 2 · Cada cosa con su nombre de persona, calculado en código

`preparar_contacto` tiene que darle al modelo, para el ítem y para cada deuda, **cómo decirlo**, no
solo cómo está guardado. En código, no en el modelo:

| Guardado | Cómo decirlo |
|---|---|
| `Intermedio / Delfín` | el nivel Delfín (la parte que se reconoce; es lo que ya pide la regla de nombres de `prompt.ts`) |
| `Tardes M-J (5–6pm)` | de lunes a jueves de 5 a 6 de la tarde |
| `L-M-V`, `Sáb`, `10–11am` | lunes, miércoles y viernes · los sábados · de 10 a 11 de la mañana |
| `Corte + barba` (servicio) | tu corte con barba |
| pedido con 2 × «Audífonos Lenovo XT80» | tus audífonos Lenovo XT80 |

Con eso, la línea de la deuda queda así:

```
Lo que debe: S/ 60, el saldo de su inscripción. Cómo decirlo: «tu inscripción del nivel Delfín (de lunes a jueves de 5 a 6 de la tarde)».
Para quién: su hija Lucía (dilo si ayuda: «la inscripción de Lucía»).
```

`nombres.ts` ya tiene `nombreDeGrupo`: reutilízalo y añade la versión hablada de días y horas. Si una
etiqueta no se entiende con las reglas (algo como «Grupo B2»), se dice el nivel solo, sin horario.

## 3 · La firma, opcional y al principio

- `revisarTexto` **deja de exigir** `{firma}`. Un mensaje desde el WhatsApp del negocio ya dice de
  dónde viene; la mayoría de las veces no hace falta firmar.
- Si se firma, va **en el saludo** («Hola Carmen, soy {firma} de Kallpa»), nunca como línea suelta
  al final. `revisarTexto` rechaza el texto si `{firma}` aparece en la última línea o después de la
  pregunta final.
- El panel ya pone el nombre de quien aprueba (el de su cuenta) en vez de «[tu nombre]», y lo deja
  corregir si no hay nombre.

## 4 · Cómo suena cada tipo de mensaje

Para el prompt, con un ejemplo por objetivo. Son **ejemplos de tono**, no plantillas: el modelo no
copia las frases, copia la manera.

Reglas comunes:
- Saludo con su nombre y, si el tono lo admite, un «¿cómo estás?».
- **Contexto antes del pedido**: por qué le escribes («estaba revisando», «me acordé de ti porque…»,
  «te escribo porque ya llegó…»).
- **Una sola petición, suave**: «¿crees que…?», «¿te parece si…?», «¿te queda bien…?».
- **La razón buena para el cliente**, no para el negocio: «así te dejo todo al día», «así no te
  quedas sin cupo», «para que lo tengas antes de tu viaje».
- Sin lenguaje de sistema ni de venta: nada de «está confirmada ✓», «así cerramos», «te lo
  completo», «proceder», «saldo pendiente», «estimado», «cordialmente», «no dudes en», «estamos para
  servirte». Ningún ✓ ni símbolo de sistema.
- 2 a 4 líneas. Como mucho un emoji, y solo si el tono del negocio los usa.

Ejemplos:

- **cobrar**: «Hola Carmen, ¿cómo estás? Estaba revisando y vi que en la inscripción de Lucía al
  nivel Delfín (de lunes a jueves de 5 a 6) aún falta pagar S/ 60. ¿Crees que me lo puedas pagar hoy?
  Así te dejo todo al día.»
- **recuperar**: «Hola Carlos, ¿qué tal? Hace un tiempito que no te vemos por aquí. Juan tiene libre
  el jueves a las 7, sin espera. ¿Te lo separo?»
- **avisar**: «Hola Ana, ¡llegó tu casaca jean en M! Si me confirmas hoy, te la mando mañana y la
  tienes antes de tu viaje. ¿Te la separo?»
- **ofrecer**: «Hola Carla, me quedé pensando en lo que me contaste de Sofía y el agua. En el nivel
  Pollito los primeros días juegan en la orilla con la profe hasta que se animan. Si la inscribes esta
  semana te lo dejo en S/ 270. ¿Te separo el sábado a las 10?»
- **coordinar_entrega**: «Hola Paola, tus audífonos Lenovo XT80 ya están listos para salir. Para
  llevártelos mañana entre 2 y 6 solo me falta: 1. tu dirección con una referencia, 2. quién los
  recibe si no vas a estar tú. ¿Te queda bien mañana?»

## 5 · Lo que comprueba el código (no el prompt)

En `revisarTexto`, además de lo que ya hace (importes, huecos):
- rechazar los símbolos y frases de la lista de arriba (`✓`, `✔`, «así cerramos», «estimad»,
  «cordialmente», «no dudes en», «proceder»), con el motivo para que el modelo reescriba;
- rechazar «[tu nombre]» o cualquier corchete: el único hueco es `{firma}`;
- rechazar `{firma}` en la última línea.

## 6 · La respuesta a quien pide el mensaje

La tarjeta ahora sale **dentro del chat de Mia Gerente** (el panel la pinta con
`borrador: { id, lead_id, nombre }`, y se aprueba ahí mismo). Cambia la frase del prompt:
- antes: «Listo, te lo dejé en el chat de Carla para que lo revises»;
- ahora: «Aquí lo tienes. Revísalo y, si te gusta, apruébalo para que se lo envíe a Carla.»

Sigue sin copiar el mensaje en el texto de la respuesta: ya está en la tarjeta.

## 7 · Cómo saber que quedó bien

Añade a `src/dev/eval-mia-gerente.ts` un caso por objetivo con un negocio que tenga `bot_tone`, y que
el juez puntúe «suena a una persona del negocio, no a un sistema» además de lo que ya mira.

- [ ] El caso de Carmen sale parecido al ejemplo de *cobrar*: sin «✓», sin «así cerramos», con el
      nivel y el horario dichos como persona, y sin firma al final.
- [ ] Con `bot_tone` «formal, de usted» sale de usted; con «cercano y con jerga peruana», se nota.
- [ ] Ningún borrador con `{firma}` en la última línea ni con «[tu nombre]».
- [ ] Los importes siguen siendo solo los calculados.
