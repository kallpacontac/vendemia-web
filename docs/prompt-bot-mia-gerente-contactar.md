# Mia Gerente: «escríbele a este cliente» (y lo que ya se puede hacer hoy)

Dos lectores:
- **Alvaro**: las partes 1 a 6 explican cómo funcionaría y qué se puede enseñar en una demo **sin
  construir nada**.
- **La sesión del bot**: la parte 7 dice qué construir; la 8, cómo probarlo.

Escrito el 21-oct-2026 leyendo el bot sin tocarlo. Sigue a `prompt-bot-mia-gerente-consejos.md` y
respeta su regla: **el modelo no calcula ni estima nada**. Precios, descuentos, fechas y plazos los
calcula el código; el modelo solo redacta palabras con esos números ya hechos.

---

## 0 · En corto

El dueño le dice a Mia Gerente, por escrito o por voz:

> «Escríbele a la mamá de Sofía. Ofrécele el plan trimestral, puedes bajarle hasta 25 soles. Entra
> por lo del miedo al agua.»

Mia le devuelve un **borrador listo**: un mensaje corto que suena a persona, la foto o el vídeo del
plan y, si quiere, un audio de 15 segundos. El dueño o el administrador lo revisa, lo corrige si
quiere y lo **aprueba**; recién ahí sale, y lo envía Mia (parte 10). Si la clienta
contesta, Mia de ventas sigue la conversación **sabiendo el encargo**: hasta dónde puede bajar,
desde dónde empezar y hasta cuándo vale. Nunca dice el tope.

Tres cosas que no cambian:
1. **Nada sale sin aprobación.** Mia redacta y envía, pero solo después de que el dueño o el
   administrador lo apruebe. El empleado no aprueba: hoy tampoco puede escribir a clientes desde el
   panel (`send_message` es de dueño y administrador).
2. **Los números los pone el código.** «Hasta 25 soles» se convierte en un precio de entrada y un
   tope, calculados y comprobados (que no quede por debajo del costo, que el plan exista).
3. **No inventa el «dolor».** Sale de lo que la clienta dijo de verdad, o de lo que dice el dueño.
   Si no hay nada, el mensaje se apoya en hechos (lo que preguntó, lo que compró), no en suposiciones.

---

## 1 · Cómo lo vive el dueño: tres ejemplos

### Academia de natación: el miedo al agua

Lo que hay en los datos: Carla preguntó en septiembre por el nivel Pollito para su hija Sofía, de 6
años. Escribió: *«Sofía le tiene miedo al agua, en la otra academia la metieron de frente a la piscina
y lloró toda la clase»*. Mia le pasó precios y Carla respondió *«lo voy a pensar»*. No volvió.

El dueño:
> «Escríbele a Carla. Ofrécele el trimestral del nivel Pollito, puedes bajarle hasta 25 soles. Entra
> por lo del miedo al agua.»

Mia Gerente (en el chat del panel):

> **Para Carla (mamá de Sofía)**
>
> «Hola Carla, soy Andrea de Kallpa. Me quedé pensando en lo que me contaste de Sofía. En el nivel
> Pollito los primeros días no entran a lo hondo: juegan en la orilla con la profe hasta que ellas
> solitas se animan. Te mando un video de una clase para que lo veas. Si la inscribes esta semana en
> el trimestral, te lo dejo en S/ 270 en vez de S/ 280. ¿Te separo un cupo para el sábado a las 10?»
>
> 📎 Video: «Clase nivel Pollito» (de la ficha del nivel)
> 🎤 Audio de 15 s (opcional): *«Carla, te lo cuento rapidito: a Sofía nadie la va a apurar. Primero
> que se sienta segura, después nadamos. Cualquier duda me escribes.»*
>
> **Si contesta, Mia sabe:** puede bajar hasta S/ 255. Empezó en S/ 270. Vale hasta el domingo 26.
> Antes de bajar más, ofrece pagar en dos partes.
>
> [Enviar] [Cambiar algo] [Sin audio] [Cancelar]

Fíjate en lo que hizo cada parte:
- *«Lo que me contaste de Sofía»*: demuestra que la escucharon. Es lo que hace que no parezca
  publicidad.
- *«No entran a lo hondo»*: responde al dolor con un hecho del negocio. **Este hecho tiene que estar
  en la ficha del nivel o decirlo el dueño**; Mia no se lo inventa.
- *S/ 270 y no S/ 255*: no se regala todo el descuento de entrada. Lo calculó el código (parte 3).
- *«¿Te separo un cupo para el sábado a las 10?»*: una sola pregunta, fácil de contestar con un sí. El
  sábado a las 10 sale de los cupos libres de verdad.

### Barbería: el cliente fiel que dejó de venir

Datos: Carlos se corta cada 3 semanas con Juan; lleva 6 sin venir. En su última visita escribió
*«la próxima avísame si hay espera, ayer esperé 25 minutos»*.

El dueño: «Escríbele a Carlos, ofrécele el corte con barba al precio del corte solo».

> «Carlos, ¿qué tal? Soy Miguel de Barber Shop. Te tengo libre el jueves a las 7 con Juan, a la hora
> exacta, sin espera. Y si te haces la barba, te la regalo esta vez. ¿Te lo separo?»

El dolor (la espera) se resuelve con una hora fija. La oferta va como regalo («te la regalo»), no
como «descuento del X %»: suena a trato entre conocidos.

### Tienda: la talla que no había

Datos: Ana pidió la Casaca jean en M y estaba agotada; dijo *«es para un viaje el 10»*. Ya llegó.

El dueño: «Avísale a Ana que llegó su talla. Si regatea, hasta 15 soles».

> «Hola Ana, llegó tu Casaca jean en M. Si me confirmas hoy, te la mando mañana y la tienes antes de
> tu viaje del 10. Te paso foto de cómo queda puesta.»
>
> 📎 Foto de la casaca (de la ficha del producto)

Aquí no se menciona el descuento: el dolor era la fecha, no el precio. El tope de S/ 15 queda
guardado para Mia de ventas, por si Ana regatea.

---

## 2 · Quién hace qué: el código calcula, Mia redacta

| Lo hace el código (sin modelo) | Lo hace Mia (modelo) |
|---|---|
| Encontrar al cliente y comprobar que escribió alguna vez | Elegir las palabras |
| Sacar lo que dijo: frases suyas sobre miedos, quejas, fechas, precio | Elegir cuál de esas frases usar como entrada |
| El precio de lista, el precio de entrada y el tope | Decir el precio de entrada como viene, sin cambiarlo |
| Que el tope no pase del costo ni del máximo del negocio | |
| La fecha de vencimiento de la oferta | Decirla en palabras («hasta el domingo») |
| Los cupos u horas libres de verdad | Proponer una de ellas |
| El adjunto que corresponde (foto o vídeo del producto o plan) | |
| Si hay voz configurada y cuánto puede durar el audio | El guion del audio |

Si el dueño pide algo que no cuadra, el código lo para antes de redactar y Mia lo dice:
- «Hasta 25 soles» y el plan cuesta 20 → no se puede.
- El producto tiene costo cargado y con S/ 25 menos se vende perdiendo → «Con 25 soles menos lo
  vendes por debajo de lo que te cuesta. Lo máximo sin perder es S/ 18.»
- El cliente pidió que no le escriban → no hay borrador.

---

## 3 · La escalera del descuento

Dar todo el descuento en el primer mensaje es perder plata: el cliente igual va a pedir un poco más.
El código parte el tope en escalones:

| Paso | Cuánto | Cuándo |
|---|---|---|
| **Entrada** | 40 % del tope, redondeado a 5 | En el primer mensaje, si el dueño quiere hablar de precio |
| **Si pide más** | Antes de bajar, algo que no es plata: pagar en dos partes, una clase de prueba, un regalo pequeño | Primer «está caro» |
| **Segundo escalón** | 80 % del tope | Si insiste |
| **Tope** | 100 % | Solo si se va, y a cambio de algo: que pague hoy, que traiga a alguien |
| **Más del tope** | Nunca | Mia avisa al dueño: «Carla pide S/ 40 menos; tu tope era 25. ¿La llamas tú?» |

Con tope de S/ 25: entrada S/ 10, segundo escalón S/ 20 y tope S/ 25.

Regla de oro, que es la de cualquier buen vendedor: **cada rebaja se cambia por algo** («si lo
pagas hoy…», «si te inscribes esta semana…»). Una rebaja que se da a cambio de nada enseña al
cliente a regatear siempre.

El dueño puede saltarse la escalera: «ofrécele directamente los 25».

---

## 4 · Que suene a persona

### Reglas del mensaje

1. **Corto**: 2 a 4 líneas. En WhatsApp, un texto largo de un negocio se lee como publicidad.
2. **Por su nombre, y firmado por una persona del negocio** («soy Andrea de Kallpa»), no «el equipo
   de…».
3. **Una cosa que dijo el cliente**, con sus palabras o casi. Es lo que hace que se note que lo
   escucharon.
4. **Un hecho del negocio que resuelve eso.** Si no hay hecho, no se inventa: mejor un mensaje más
   simple.
5. **Una sola pregunta al final, fácil de contestar con un sí**: «¿Te separo el sábado a las 10?», no
   «¿Qué te parece?».
6. **Plazo solo si es de verdad.** «Hasta el domingo» si la oferta vence el domingo. Nada de
   «¡últimos cupos!» si no lo son.
7. **Se entiende sin el adjunto.** Las fotos a veces no cargan.
8. **Como mucho un emoji**, y solo si el negocio escribe así.
9. **Prohibido**: «Estimado cliente», «Le saludamos cordialmente», «¡Aprovecha esta increíble
   oferta!», «No te lo pierdas», mayúsculas para gritar, y repetir el mismo texto a varios clientes.

### El audio

- **10 a 20 segundos.** Más largo, no lo escuchan.
- **Dice algo distinto del texto**: el texto lleva los datos (precio, hora); el audio, el tono («a
  Sofía nadie la va a apurar»). Nunca lee el mensaje en voz alta.
- **Sin precios ni horas en el audio**: van escritos, donde se pueden releer.
- **De quién es la voz**, de más humano a menos:
  1. **La del propio dueño**: Mia le da el guion y él lo graba en el panel. Es lo más creíble y no
     necesita nada nuevo del lado de la voz.
  2. **La voz clonada del dueño**: solo con el consentimiento firmado que ya exige `voz-mia.md`.
  3. **La voz de Mia** (catálogo): sirve, pero suena a negocio, no a persona.
- Tiene que llegar como **nota de voz** (el micrófono verde), no como archivo de audio. El bot ya sabe
  hacerlo para la voz de Mia (`voice/send.ts`, `ptt: true`); hay que confirmar que lo grabado desde el
  panel también sale así.

### Los adjuntos

- **Uno, el que mejor responde al dolor**: miedo → vídeo de una clase; precio → foto del plan con lo
  que incluye; talla o fecha → foto del producto puesto.
- Salen de lo que ya hay: la foto o el vídeo de la ficha del producto, plan o nivel, o los adjuntos
  de saludo y cierre. El dueño puede cambiarlo por otro.
- Orden de envío: **adjunto con el texto como pie → audio**. Si va primero el audio, nadie sabe de qué
  habla.

---

## 5 · Límites que no se negocian

- **Solo a clientes que ya escribieron alguna vez.** Escribirle a un número que nunca habló con el
  negocio es lo que hace que WhatsApp bloquee el número (`whatsapp-ban-safety.md`).
- **De uno en uno.** Esto no es un envío masivo: no hay «mándaselo a los 50 que no volvieron». Si el
  dueño lo pide, Mia prepara los 3 o 5 más prometedores, cada uno con su mensaje.
- **No escribir de noche**: entre las 9 de la noche y las 8 de la mañana el borrador queda listo y el
  botón dice «Enviar mañana a las 9».
- **Quien dijo «no me escribas» no recibe nada**, y Mia lo dice: «Carlos pidió que no le escribamos».
- **El tope es secreto.** Mia de ventas nunca dice «puedo bajarte hasta 25».
- **Ojo con el futuro de WhatsApp**: hoy el bot envía por la vía del QR, donde se puede mandar texto
  libre. Con la API oficial que promete la web, a un cliente que lleva más de 24 h sin escribir solo
  se le puede mandar una **plantilla aprobada por Meta**, y cada una se cobra. El mensaje personal de
  esta guía no sería posible tal cual: habría que abrir con una plantilla corta («Hola Carla, tengo
  novedades de lo que preguntaste sobre Sofía, ¿te cuento?») y mandar lo demás cuando conteste.

---

## 6 · Lo que se puede hacer HOY, sin construir nada

Revisado contra el código del bot y del panel. Todo esto ya existe; muchos negocios no lo están
usando. Ordenado por el dolor del dueño.

| El dolor del dueño | Lo que ya hay | Cómo usarlo |
|---|---|---|
| **«Se me quedan ventas a medias y no hago seguimiento»** | «¿A quién le escribo hoy?» en Mia Gerente y la pantalla de Retargeting: carritos sin cerrar, citas a medias, cupo liberado, stock repuesto, cliente dormido, preguntó y no volvió. Cada uno con su mensaje redactado y su enlace de WhatsApp | Que el dueño lo abra cada mañana. Es la acción con más plata directa |
| **«No sé por qué no me compró»** | Mia Gerente: «¿Qué le frenó a Carla?» lee su conversación y lo resume | Antes de escribirle a alguien, preguntar esto |
| **«Quiero ofrecerle algo a un cliente concreto»** | Mensajes → Nuevo: texto + foto, vídeo, audio o PDF, desde el número del negocio. Mia sigue contestando después y ve lo que se le dijo | El dueño escribe (o pega un borrador de Mia Gerente) y adjunta la foto del plan |
| **«Que Mia sepa algo de este cliente»** | Notas del negocio en la ficha del cliente («Editar»). Mia de ventas las lee siempre, no las recita y las usa para lo que puede ofrecerle | Ahí van los encargos que no son de plata: «si vuelve a escribir, ofrécele una clase de prueba gratis», «quiere siempre con Juan» |
| **«Me regatean»** (tienda) | Descuento máximo por producto: Mia de ventas negocia hasta ahí y el sistema no deja pasar de ese tope en el pedido | Poner el tope en los productos que más regatean. Ojo: vale para todos los clientes, no para uno |
| **«No ven bien lo que vendo»** | Fotos y vídeos en la ficha de cada producto; adjuntos en el saludo y en el cierre | Poner el vídeo del plan en el saludo: llega a todos los que escriben por primera vez |
| **«Hago promos y nadie se entera»** | Promoción con fecha de vigencia en el producto: Mia la ofrece solo mientras vale | Cargar la promo con su fecha en vez de decírsela a mano a cada uno |
| **«Me preguntan cosas que Mia no sabe»** | Catálogo → «Lo que no supe contestar» | Completar esas respuestas cada semana |
| **«Se me olvida quién renueva»** (academia) | «¿A quién se le vence la mensualidad?» | Cada lunes |
| **«Gente quiere hora y estoy lleno»** (citas) | «¿Qué me están pidiendo que no tengo?» | Abrir horas donde se repite |
| **«No me cuadra la caja / cuánto le debo al barbero»** | Caja, quién me debe, comisiones en Mia Gerente | Al cerrar el día |
| **«Los clientes no vuelven»** | Fideliza: tarjeta de sellos en el celular del cliente | Para barberías, cafeterías, salones |

### Dos cosas que hoy NO funcionan así, aunque lo parezca

- **Descuento para un solo cliente.** El tope de descuento es por producto e igual para todos. Si se
  pone «puedes bajarle 25 a Carla» en sus notas, Mia de ventas puede prometerlo, pero el pedido
  saldrá con el tope del producto. **En servicios, citas y planes no hay descuento en el cobro**:
  sale el precio del catálogo. Hasta construirlo, una rebaja a un cliente de un servicio la cierra el
  dueño a mano (pausando a Mia en ese chat).
- **Mia Gerente redactando mensajes para clientes.** Su prompt dice que no escribe a clientes. Es
  probable que, si se le pide «redáctame un mensaje para Carla», lo haga, porque redactar no es
  enviar. Pero no está probado, y si mete un precio con descuento tendría que **restar**, que es justo
  lo que tiene prohibido. Para la demo, pedirle el mensaje **sin** el precio final («con 10 soles de
  descuento», no «a S/ 270»).

### La demo, hoy, en 5 pasos

1. Mia Gerente: **«¿A quién le escribo hoy?»** → salen 3 clientes con motivo y mensaje.
2. **«¿Qué le frenó a Carla?»** → el resumen de su conversación: el miedo al agua.
3. **«Redáctame un mensaje corto para Carla: el trimestral del nivel Pollito, 10 soles de descuento si
   se inscribe esta semana, entrando por lo del miedo al agua.»** → el borrador. *(Probarlo antes:
   ver arriba.)*
4. Mensajes → Nuevo → número de Carla → pegar el texto → adjuntar el vídeo de la clase → Enviar.
5. En la ficha de Carla, Notas: «Si responde, se le puede ofrecer una clase de prueba gratis antes de
   pagar». Desde el celular de Carla, contestar «¿y si no le gusta?» → Mia de ventas ofrece la clase
   de prueba.

Lo que no se puede enseñar todavía: el borrador con botón «Enviar» dentro de Mia Gerente, el audio
con guion y la negociación por escalones con tope por cliente.

---

## 7 · Para la sesión del bot: qué construir

### 7.1 Herramienta de Mia Gerente `preparar_contacto` (dueño y administrador)

Entrada (la rellena el modelo a partir de lo que dijo el dueño):

```ts
{
  cliente: string,                 // nombre o teléfono, como buscar_cliente
  objetivo: 'ofrecer' | 'recuperar' | 'avisar' | 'cobrar' | 'coordinar_entrega',   // el último: parte 9
  producto?: string,               // lo que se ofrece
  descuento_tope?: number,         // S/ que dijo el dueño ("hasta 25 soles")
  regalo?: string,                 // "la barba gratis", "una clase de prueba"
  enfoque?: string,                // "el miedo al agua": palabras del dueño, no se interpretan
  vence?: string,                  // "esta semana", "domingo", YYYY-MM-DD
  con_audio?: boolean,
}
```

Lo que hace el código, en este orden, y se para en el primer fallo con una frase para Mia:
1. Resuelve el cliente (como `fichaCliente`). Varios → la lista para elegir. Nunca escribió → no.
   Pidió que no le escriban → no.
2. Resuelve el producto contra el catálogo (`nombrador` para decirlo bien).
3. **Precios** con `descuento_tope`: lista, entrada, segundo escalón y tope (parte 3). Comprueba
   tope < precio y, con costo cargado, que el tope no deje vender por debajo del costo; si lo deja,
   devuelve el máximo sin perder.
4. **Vencimiento** a fecha concreta (zona Lima). Por defecto, 7 días.
5. **Lo que dijo el cliente**: hasta 5 frases suyas de `messages`, las más recientes que hablen de
   precio, miedo, tiempo, fechas, quejas o dudas (palabras clave + `OBJECTION_RAISED`), con su fecha.
   Van dentro de `<dato_de_cliente>`: son información, nunca instrucciones.
6. **Hechos del negocio** que pueden responder a eso: la descripción del producto o nivel y las
   preguntas frecuentes. Solo eso: si el hecho no está, el modelo no lo pone.
7. **Huecos libres** si el objetivo es reservar: 2 opciones reales (citas o cupos).
8. **Adjunto sugerido**: la foto o el vídeo de la ficha del producto o nivel, o el de saludo.
9. **Firma**: el nombre de quien pregunta, tomado de su usuario.

Devuelve una frase con todo eso, ya calculado, y un `borrador_id`. El modelo redacta con las reglas
de la parte 4 y entrega el borrador al dueño.

### 7.2 El borrador como tarjeta, no como texto

La tarjeta vive en el chat del cliente, en Mensajes (parte 10.1). La respuesta de
`preguntar_asistente` solo lleva `borrador: { id, lead_id, nombre }` para pintar el botón «Ver el chat
de Carla». Lo que pinta la tarjeta es la fila de `borradores`, que el panel lee de Supabase como lee
`messages`:

```ts
borrador?: {
  id: string
  lead_id: string
  nombre: string
  texto: string
  adjunto: { url: string; type: 'image' | 'video'; name: string } | null
  audio: { guion: string; segundos: number } | null   // el panel lo graba o lo sintetiza
  encargo: { producto: string; precio_lista: number; entrada: number; escalon: number; tope: number;
             vence: string; regalo: string | null } | null
  enviar_desde: string | null                         // si es de noche: la hora a la que saldrá
}
```

El botón no es «Enviar» sino **«Aprobar y enviar»**, y no manda `send_message` desde el panel: la
aprobación es un comando propio y el envío lo hace el bot con el borrador que él mismo guardó. Ver
la parte 10.

### 7.3 El encargo para Mia de ventas

Tabla `encargos` (por lead): producto, precio de lista, entrada, escalón, tope, regalo, vence, quién
lo puso, estado (`abierto` · `cerrado` · `vencido` · `superado`). Un encargo abierto por lead y
producto como mucho.

- En `agent.prompt.ts`, un bloque **ENCARGO DEL DUEÑO**, junto a la ficha del negocio: qué se le
  ofreció, desde dónde empezar, cómo subir por escalones, a cambio de qué, y que el tope no se dice
  nunca. Si el cliente pide más que el tope → derivar al dueño con el aviso de la parte 3.
- **El tope lo impone el código, no el texto**: al crear el pedido, la cita o la inscripción de ese
  lead y ese producto, el precio no puede bajar del tope del encargo. Para productos, es ampliar el
  recorte que ya hace `order.tools.ts` con `max_discount`. **Para servicios y planes no existe**: el
  precio acordado tiene que llegar al cobro (cita, inscripción, Yape esperado). Es lo más delicado de
  todo esto: sin eso Mia promete S/ 255 y el cobro le pide S/ 280.
- Vencido el plazo, el encargo deja de existir para Mia de ventas: vuelve el precio de lista.
- Un evento `ENCARGO_CERRADO` cuando hay venta de ese producto con ese lead dentro del plazo. Con eso
  Mia Gerente contesta «de las 8 ofertas que mandaste este mes, cerraron 3» (la tabla
  `recomendaciones` / `seguimientos.resultado` de `metricas-y-asesor.md`).

### 7.4 El audio

- Primera versión: el panel enseña el guion y un botón «Grabarlo yo» (reutilizar la grabadora del
  asistente, `useGrabadora`). Sale por `send_message` como audio; **confirmar que llega como nota de
  voz** (`ptt`) y no como archivo, que es lo que hoy hace solo `voice/send.ts`.
- Con voz clonada y consentimiento firmado: «Que lo diga mi voz», sintetizado con el motor de
  `voice/`, con su tope diario de coste.

### 7.5 Cambios al prompt de Mia Gerente

- Quitar el choque con «no puedes escribir a clientes»: puede **preparar** un mensaje con
  `preparar_contacto`, y sale cuando quien habla con ella lo aprueba en la tarjeta. Nunca dice «ya
  se lo mandé» antes de la aprobación: dice «aquí lo tienes; si te parece bien, apruébalo».
- Añadir las reglas de la parte 4 (mensaje y audio) y estas:
  - El precio que pone en el mensaje es el `entrada` que trae la herramienta, tal cual. Nunca resta.
  - El dolor sale de las frases del cliente que trae la herramienta o de las palabras del dueño. Si no
    hay ninguna, no se menciona dolor.
  - Un hecho sobre el negocio («no entran a lo hondo») solo si está en los hechos que trae la
    herramienta o lo dijo el dueño en esta conversación.
  - Si el dueño pide varios clientes, un borrador por cada uno, 5 como mucho, cada uno con su texto.
- Chip nuevo: «Prepárame un mensaje para un cliente».

### 7.6 Si se pasa a la API oficial de WhatsApp

`preparar_contacto` tiene que saber si el cliente escribió en las últimas 24 h. Si no, el borrador es
dos piezas: una plantilla aprobada de una línea, y el resto, que sale cuando conteste. Dejarlo
previsto en el tipo del borrador aunque hoy no se use.

---

## 8 · Para probar

En kallpa (tiene voz) y barberia-01, con un lead de prueba que haya escrito antes y tenga una frase de
duda en su conversación.

- [ ] «Escríbele a Carla, el trimestral del nivel Pollito, hasta 25 soles, por lo del miedo al agua» →
      borrador de 4 líneas como mucho, con su nombre, una frase suya, precio de entrada S/ 270 (no
      255) y una pregunta final.
- [ ] Ningún número del borrador que no venga de la herramienta. Ningún hecho del negocio que no esté
      en la ficha.
- [ ] Un cliente sin frases útiles → mensaje sin «dolor», sin inventarlo.
- [ ] Tope mayor que el precio, o por debajo del costo → Mia lo dice y no hay borrador.
- [ ] Cliente que nunca escribió o que pidió que no le escriban → no hay borrador.
- [ ] Enviar → sale el adjunto con su pie y después el audio, como nota de voz.
- [ ] Carla contesta «está caro» → Mia de ventas ofrece primero lo que no es plata, luego S/ 260, y
      nunca dice el tope. Pide S/ 40 menos → aviso al dueño, sin rebajar.
- [ ] La inscripción de Carla sale a S/ 255 como mínimo, no a S/ 280, y no a S/ 240 aunque el modelo lo
      prometa.
- [ ] Pasado el plazo, Carla vuelve a escribir → precio de lista.
- [ ] Como administrador: prepara y aprueba igual que el dueño, sin ver costos ni márgenes en
      ningún momento (pruebas de la parte 10).
- [ ] A las 10 de la noche → «Enviar mañana a las 9».

---

## 9 · «Coordina la entrega de Paola»: pedir lo que falta para entregar

Añadido el mismo día, a partir de un mensaje real que Alvaro mandó a mano desde kallpita.store:

> Hola que tal Paola, te habla Alvaro de https://kallpita.store
> Nos faltaría solo su dirección exacta vía google maps para agendar la entrega de sus audífonos
> Lenovo XT80

Es el caso más fácil de todos y de los que más se repiten: **un pedido vendido que no se puede
entregar porque falta un dato**. Aquí no hay que convencer a nadie: el cliente ya pagó o ya decidió.
Lo único que importa es que conteste rápido y lo que haga falta en una sola respuesta.

### 9.1 Lo que se puede mejorar del mensaje

El mensaje funciona, pero se puede ajustar para que la respuesta llegue antes y completa:

| Lo que pasó | Por qué importa | Mejor |
|---|---|---|
| El enlace de la tienda va en la primera línea | WhatsApp pinta encima una tarjeta grande con la vista previa: lo primero que ve Paola parece publicidad, no su pedido | Sin enlace. Ya sabe dónde compró: basta con el nombre de la tienda |
| «Te habla» y luego «su dirección», «sus audífonos» | Mezcla tú y usted | Uno solo. En Perú, de tú suena cercano sin perder respeto |
| Pide solo la dirección | El repartidor también va a necesitar una referencia, quién recibe y a qué hora. Cada dato pedido después es otra vuelta | Todo lo que falta, en un mensaje, numerado |
| «Para agendar la entrega» | No le dice cuándo llega | Proponer día y franja reales: «mañana entre 2 y 6» |
| No termina en pregunta | No queda claro qué tiene que responder | Cerrar con algo fácil de contestar |

Así quedaría, sin cambiar el tono de Alvaro:

> Hola Paola, soy Alvaro de Kallpita. Tus audífonos Lenovo XT80 ya están listos para salir. Para
> llevártelos mañana entre 2 y 6 pm solo me falta:
> 1. Tu dirección con una referencia (o el enlace de Google Maps).
> 2. Quién los recibe, si no vas a estar tú.
>
> ¿Te queda bien mañana en ese horario?

Una lista numerada aquí sí va bien, aunque la parte 4 pide mensajes sin estructura: es un trámite y
la lista le dice a Paola exactamente qué contestar.

### 9.2 Un hallazgo del bot que cambia qué hay que pedir

**El bot no tiene nada para la ubicación de WhatsApp** (el clip → Ubicación). Hay flujos para texto,
voz, imágenes y documentos (`src/flows/`), pero no para `EVENTS.LOCATION`. El propio comentario de
`document.flow.ts` cuenta que, sin flujo, builderbot no da error: el mensaje se pierde sin dejar
rastro. Así que si Paola manda su ubicación, Alvaro la ve en el celular, pero Mia y el panel no.
**Falta confirmarlo en vivo.**

Mientras tanto, pedir **la dirección escrita o el enlace de Google Maps** (que llega como texto),
como hizo Alvaro. «Mándame tu ubicación» sería lo más fácil para el cliente, pero hoy se perdería.

Y un segundo hueco: Mia de ventas guarda la dirección **en la ficha del cliente**
(`save_customer_info`), pero **no hay herramienta para corregir la entrega de un pedido que ya existe**.
`create_order` la pide al crearlo y nada la cambia después. Si Paola contesta con su dirección, Mia
puede agradecerlo, pero el pedido sigue sin ella hasta que alguien la ponga a mano.

### 9.3 Qué se puede hacer hoy

- Mia Gerente: **«¿Qué pedidos tengo por entregar?»** (`en_curso`) da nombre, qué llevan y fecha de
  entrega si la tienen. **No dice qué dato falta**: eso hay que mirarlo en el pedido.
- Escribirle desde **Mensajes → Nuevo** con el mensaje de arriba. Mia sigue atendiendo después y ve lo
  que se le pidió.
- En la ficha de Paola, **Notas del negocio**: «Su pedido se entrega mañana de 2 a 6; si manda la
  dirección, confírmale ese horario». Mia de ventas lo usará para contestar bien. El pedido igual hay
  que completarlo a mano.

### 9.4 Qué construir (sesión del bot)

1. **Qué le falta a cada entrega, calculado.** Una función que, por pedido pagado o confirmado con
   envío y sin entregar, devuelva lo que falta: dirección, referencia, quién recibe y su número (si no
   es el cliente), día y franja (`delivery_at` vacío) y opción de envío. Con eso:
   - herramienta de Mia Gerente **`entregas_por_coordinar`**: «Tienes 3 pedidos que no se pueden
     entregar todavía: a Paola le falta la dirección…»;
   - aviso al dueño (las notificaciones del panel) cuando un pedido pagado lleve más de X horas
     incompleto.
2. **`preparar_contacto` con `objetivo: 'coordinar_entrega'`.** El código pone en la frase: el
   pedido, lo que falta, y **la franja real** de la opción de envío (`window_start`/`window_end`,
   `cutoff_hour`; si ya pasó la hora de corte, mañana). Mia redacta con las reglas de 9.1. Sin
   precios ni descuentos: no hay escalera.
3. **Encargo de tipo entrega para Mia de ventas.** Al enviar, el lead queda con «completar entrega
   del pedido N: falta X». Cuando el cliente conteste, Mia lo reconoce, pide solo lo que siga
   faltando y lo guarda con una herramienta nueva **`completar_entrega`** sobre el pedido existente
   (solo dirección, referencia, quién recibe, día y franja; nunca productos ni importes). Hecho eso,
   aviso al dueño: «Paola completó su entrega: dirección, referencia, mañana de 2 a 6».
4. **Flujo para la ubicación** (`EVENTS.LOCATION`): guardar la latitud y longitud como enlace de
   Google Maps en la dirección del pedido o del cliente, y anotarlo en el historial para que el panel
   lo enseñe. Cuando exista, el mensaje de 9.1 puede pasar a «mándame tu ubicación por aquí: clip 📎 →
   Ubicación».

### 9.5 Para probar

- [ ] Pedido pagado con envío, sin dirección → sale en `entregas_por_coordinar` con «falta la
      dirección».
- [ ] «Coordina la entrega de Paola» → un mensaje sin enlace, de tú, con todo lo que falta numerado y
      una franja real de la opción de envío; nada de lo que ya está.
- [ ] Pasada la hora de corte → la franja propuesta es de mañana.
- [ ] Paola contesta con la dirección → queda en el pedido (no solo en su ficha), Mia pide solo lo que
      siga faltando y el dueño recibe el aviso.
- [ ] Paola manda su ubicación de WhatsApp → hoy: confirmar si se pierde. Con el flujo nuevo: queda
      como enlace de Maps en el pedido.
- [ ] `completar_entrega` no puede tocar productos, cantidades ni el total.

---

## 10 · La aprobación: Mia redacta y envía, el dueño o el administrador aprueba

Decidido por Alvaro el 21-oct: **Mia redacta claro y envía ella, pero solo con la aprobación del
dueño o del administrador**. Vale para todo lo de este documento: ofertas, recuperar clientes,
avisos y coordinar entregas.

### 10.1 Cómo lo vive quien aprueba

Decidido por Alvaro el 21-oct: **la tarjeta va dentro del chat de ese cliente**, en Mensajes, al
final de la conversación, como el siguiente mensaje que todavía no salió. Así quien aprueba lee el
borrador con la conversación entera encima, que es justo lo que necesita para saber si suena bien.

Es una tarjeta pequeña, alineada a la derecha como los mensajes del negocio, con borde punteado
para que no se confunda con algo ya enviado:

```
                         ┌ Mia · por aprobar ─────────────────── ┐
                         │ Hola Carla, soy Lucía de Kallpa. Me   │
                         │ quedé pensando en lo que me contaste  │
                         │ de Sofía…                  ver todo ▾ │
                         │ 🎬 Clase nivel Pollito   🎤 0:15 ▶   │
                         │ Puede bajar hasta S/ 255 · hasta dom 26│
                         │ [Aprobar y enviar] [Corregir] [✕]     │
                         └────────────────────────────────────── ┘
```

- **Aprobar y enviar**: la tarjeta se convierte en los mensajes reales (adjunto con su texto, luego
  el audio), con una línea pequeña debajo: «Mia · aprobado por Lucía».
- **Corregir**: el texto se edita dentro de la misma tarjeta y se aprueba desde ahí. No en la caja de
  escribir de abajo: esa está bloqueada mientras Mia atiende al cliente, y aprobar un borrador no
  pausa a Mia.
- **✕ Descartar**: la tarjeta desaparece y no sale nada.

En **Mia Gerente**, la respuesta no repite la tarjeta. Solo dice que lo dejó listo, con un botón
que lleva al chat:

> «Listo, te dejé el mensaje para Carla en su chat para que lo revises.»
> [Ver el chat de Carla]

Y en la **lista de conversaciones** de Mensajes, los chats con un borrador llevan la etiqueta «Por
aprobar» y un filtro para verlos todos juntos.

Hay dos formas de que aparezca un borrador:
1. **Lo pide alguien**: «escríbele a Carla…». Quien lo pidió también puede aprobarlo.
2. **Lo propone Mia**: por ejemplo, cada mañana con los de «a quién escribir» o los pedidos que no se
   pueden entregar. Cada uno queda en el chat de su cliente y llega una notificación push al celular
   (parte 10.4): «Mia preparó 3 mensajes para aprobar». La aprueba el primero que llegue, dueño o
   administrador.

**Quién ve la tarjeta:** solo el dueño y el administrador. Lleva el tope de la negociación, así que
si un empleado tiene acceso a Mensajes, no le aparece (la tabla `borradores` con la misma regla de
lectura que `avisos_recibe`).

### 10.2 Por qué la aprobación va en el servidor y no solo en el botón

Si «Aprobar» fuera el panel mandando `send_message` con el texto, el borrador sería solo una
sugerencia: cualquiera con acceso a la cola podría mandar otra cosa y quedaría como «de Mia». La
aprobación tiene que ser un paso que el bot compruebe:

1. `preparar_contacto` **guarda** el borrador en una tabla `borradores`: negocio, cliente, texto,
   adjunto, audio, encargo, quién lo pidió (o «Mia»), estado (`por_aprobar` · `enviado` ·
   `descartado` · `caducado`), quién lo aprobó y cuándo.
2. Comando nuevo **`aprobar_borrador { borrador_id, texto? }`**, con los mismos permisos que
   `send_message`: dueño y administrador sí, empleado no. Se añade a la tabla de
   `run-tests-equipo.ts` y a `juzgarComando`.
3. El bot, al recibirlo, **vuelve a comprobar todo** antes de enviar, porque entre que se redactó y
   se aprobó pudo cambiar algo:
   - el borrador es de ese negocio y sigue `por_aprobar` (aprobar dos veces no envía dos veces);
   - no tiene más de 24 h; si tiene más, `caducado` y se pide uno nuevo;
   - el precio, el stock y el cupo u hora propuestos siguen siendo verdad; si no, no envía y dice qué
     cambió («el sábado a las 10 ya se llenó»);
   - el cliente no pidió que no le escriban;
   - si es de noche, queda programado para las 9 y la tarjeta lo dice.
4. Envía **lo guardado**: el adjunto con el texto de pie y después el audio, como hoy
   `send_message`. Guarda el encargo y anota quién aprobó.

**El texto corregido también se revisa.** Si quien aprueba cambia el texto y escribe un precio por
debajo del tope («te lo dejo en S/ 240» con el mínimo en S/ 255), el bot no lo envía y dice por qué.
Basta con buscar los importes «S/ N» del texto y compararlos con el encargo. Lo que no sea precio se
respeta tal cual: es la palabra del negocio.

**La firma la pone quien aprueba.** Si Mia propuso el mensaje y lo aprueba Lucía, sale «soy Lucía
de Kallpa». Por eso la firma se rellena al aprobar, no al redactar.

### 10.3 El administrador y la plata

Hoy el administrador no ve importes en Mia Gerente: caja, ganancia y comisiones no existen para él.
Pero un mensaje con oferta lleva precios. Cómo lo resolvería:

- **Ve los precios que va a ver el cliente** (lista, entrada, tope): son precios de catálogo, no
  cuentas del negocio. Ya los puede cambiar hoy: editar el catálogo, descuento máximo incluido
  (`upsert_catalog_item`), es de dueño y administrador.
- **Nunca ve el costo ni el margen.** Si pide un descuento que deja vender por debajo del costo, Mia
  le dice «ese descuento no se puede para este producto; lo máximo es S/ 18», sin decir por qué.
  Al dueño sí le explica que es por el costo.

**Confirmado por Alvaro el 21-oct**: el administrador puede preparar y aprobar ofertas con descuento
para un cliente concreto, con las dos condiciones de arriba (ve precios de catálogo, nunca costo ni
margen).

### 10.4 La notificación de «por aprobar»

Va por los avisos push del panel que ya existen (`modules/avisos`: triggers sobre tablas espejadas →
`panel_push_events` → pg_cron → web-push), no por algo nuevo:
- un tipo nuevo `por_aprobar` en `panel_push_events` (migración `0003` de `modules/avisos`), apuntado
  por un trigger al insertar en `borradores` con `creado_por = 'mia'`. Lo que pide una persona no
  avisa: ya lo está viendo;
- lo reciben quienes pasan `avisos_recibe` (dueño y administrador) y lo tengan activado en sus
  preferencias;
- se agrupan: varios en el mismo minuto son un solo aviso, «Mia preparó 3 mensajes para aprobar»
  (`redactar.ts`);
- al tocarlo, abre Mensajes con el filtro «Por aprobar»; si es uno solo, el chat de ese cliente.

### 10.5 Para probar

- [ ] «Escríbele a Carla…» → en Mia Gerente, «te lo dejé en su chat» con el botón; en el chat de
      Carla, la tarjeta punteada al final. **No sale nada** hasta aprobar.
- [ ] «Corregir» → el texto se edita en la tarjeta y se aprueba desde ahí.
- [ ] Un empleado con acceso a Mensajes no ve la tarjeta ni la etiqueta «Por aprobar».
- [ ] Mia propone 3 por la mañana → una sola notificación push; al tocarla abre el filtro «Por
      aprobar».
- [ ] Aprobar → sale adjunto + texto + audio, y en el chat del cliente queda quién lo aprobó.
- [ ] Pulsar dos veces o reintentar el comando → sale una sola vez.
- [ ] Un empleado que encola `aprobar_borrador` a mano → rechazado.
- [ ] Borrador de ayer con el cupo ya lleno → no se envía y la tarjeta dice qué cambió.
- [ ] Corregir el texto a «S/ 240» con mínimo S/ 255 → no se envía, con el motivo.
- [ ] Los borradores de la mañana los aprueba el administrador → salen firmados con su nombre.
- [ ] Administrador con un descuento por debajo del costo → «no se puede», sin la palabra costo ni
      ninguna cifra de costo.
- [ ] A las 10 de la noche → «Aprobado: sale mañana a las 9».
