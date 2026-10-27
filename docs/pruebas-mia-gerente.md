# Checklist de pruebas · Mia Gerente (mensajes con aprobación, avisos de stock, compras)

Para marcar a mano. Cada prueba dice qué hacer y qué tiene que pasar. Si algo no pasa, anota el
número y qué viste (mejor con captura).

**🤖** = necesita que el bot tenga su parte hecha y esté corriendo con ella.

---

## 0 · Antes de empezar

- [ ] El bot de **kallpa** reiniciado con la fase 1 y el tono (commiteado en su repo).
- [ ] El panel instalado en tu celular (Android: «Instalar Vendemia»; iPhone: Compartir → Añadir a
      pantalla de inicio) y abierto desde el icono.
- [ ] En **Ajustes → Avisos en este celular**: «Activar avisos», y que llegue el aviso de prueba.
- [ ] Un **segundo número de WhatsApp** que haga de cliente (el tuyo personal sirve), que ya le haya
      escrito alguna vez al número de kallpa. Lo llamamos «el cliente de prueba».
- [ ] Una cuenta de **administrador** y una de **empleado** en kallpa (Ajustes → Acceso del equipo).

---

## 1 · Mensajes que redacta Mia (en el chat de Mia Gerente) 🤖

### Cobrar

- [ ] **1.1** Desde el celular del cliente de prueba, inscríbete en un grupo y paga solo una parte
      (o usa a Carmen si sigue con saldo).
- [ ] **1.2** En Mia Gerente: «Recuérdale a [cliente] que le falta pagar».
      → Sale una **tarjeta dentro de la misma respuesta** con el mensaje y los botones «Aprobar y
      enviar», «Corregir» y la ✕. Mia dice algo como «Aquí lo tienes…», no «ya se lo mandé».
- [ ] **1.3** Lee el mensaje. Tiene que:
  - [ ] sonar a persona («estaba revisando y vi que…», «¿crees que me lo puedas pagar hoy?»);
  - [ ] usar el tono de Ajustes → «Tono del bot»;
  - [ ] decir el nivel y el horario como se hablan («el nivel Delfín, de lunes a jueves de 5 a 6»),
        no «Intermedio / Delfín para Tardes M-J (5–6pm)»;
  - [ ] llevar el importe correcto del saldo;
  - [ ] **no** llevar «✓», «está confirmada», «así cerramos», «[tu nombre]» ni una firma suelta al final.
- [ ] **1.4** Pulsa «Aprobar y enviar».
      → La tarjeta pasa a «Mia lo está enviando…» y en unos segundos a **«Enviado»**.
- [ ] **1.5** En el celular del cliente llega el mensaje, tal cual lo aprobaste.
- [ ] **1.6** En **Mensajes**, en el chat de ese cliente, aparece el mensaje enviado.

### Corregir y descartar

- [ ] **1.7** Pide otro mensaje. Pulsa «Corregir», cambia una palabra y aprueba.
      → Al cliente le llega **tu versión**, no la de Mia.
- [ ] **1.8** Pide otro y pulsa la **✕**. → La tarjeta dice «Descartado: no se envió» y al cliente no
      le llega nada.
- [ ] **1.9** Corrige un mensaje con oferta y pon un precio **por debajo del mínimo** (ej. si la
      oferta es S/ 270 con mínimo S/ 255, escribe S/ 240) → no sale, y dice «En el mensaje pusiste
      S/ 240 y lo mínimo para esta oferta es S/ 255».

### Otros tipos de mensaje

- [ ] **1.10** Recuperar: «Escríbele a [cliente], que hace tiempo que no viene» → mensaje cálido, con
      un día y hora libres de verdad si es de citas.
- [ ] **1.11** Avisar: «Avísale a [cliente] que llegó [producto]».
- [ ] **1.12** Ofrecer con descuento: «Ofrécele el [plan] a [cliente], puedes bajarle hasta 25 soles,
      entra por [lo que te dijo]».
  - [ ] La tarjeta dice «empieza ofreciendo S/ X · como mínimo S/ Y».
  - [ ] El mensaje lleva el precio de **entrada**, nunca el mínimo.
  - [ ] Usa algo que el cliente dijo de verdad (o nada, si no dijo nada); no se inventa.
- [ ] **1.13** Coordinar entrega (tienda): con un pedido sin dirección, «Coordina la entrega de
      [cliente]» → lista numerada de lo que falta, sin enlace a la tienda.

### Lo que NO tiene que hacer

- [ ] **1.14** «Escríbele a [alguien que nunca le escribió al negocio]» → no hay mensaje, y Mia
      explica por qué.
- [ ] **1.15** «Ofrécele el plan con 500 soles de descuento» (más que el precio) → «no se puede», sin
      tarjeta.
- [ ] **1.16** Pulsa «Aprobar y enviar» dos veces seguidas → al cliente le llega **una sola vez**.

### De noche

- [ ] **1.17** Aprueba un mensaje **después de las 9 de la noche** → la tarjeta dice «sale mañana a
      las 9:00» y no llega nada esa noche.
- [ ] **1.18** Al día siguiente, a las 9, le llega al cliente.

---

## 2 · El cliente acepta una oferta (servicio o plan) 🤖

- [ ] **2.1** Tras 1.12, desde el celular del cliente: «Sí, me inscribo con ese precio».
      → Mia de ventas **no** cierra la inscripción con la rebaja: le dice que lo confirma alguien
      del equipo.
- [ ] **2.2** En **Mensajes**, en ese cliente, aparece por revisar:
      «Aceptó la oferta que le mandaste: confírmale el precio» y debajo
      «[Plan] a S/ X (de S/ Y) · la oferta vale hasta el …».
- [ ] **2.3** «Resolver» la quita.

---

## 3 · Quién ve qué

- [ ] **3.1** Como **administrador**: pide un mensaje con descuento y apruébalo → funciona.
- [ ] **3.2** Como **administrador**: en ningún sitio sale un costo ni un margen.
- [ ] **3.3** Como **empleado**: no ve Mia Gerente, ni las tarjetas en Mensajes, ni la etiqueta
      «Por aprobar».
- [ ] **3.4** La firma: si el mensaje lleva tu nombre, sale el nombre de **quien aprueba**, no
      «[tu nombre]».

---

## 4 · La etiqueta «Por aprobar» en Mensajes

- [ ] **4.1** Pide un mensaje en Mia Gerente y **no** lo apruebes.
- [ ] **4.2** En Mensajes: el chat de ese cliente lleva la etiqueta **«Por aprobar»** y aparece el
      filtro «Por aprobar (1)».
- [ ] **4.3** Dentro del chat, la tarjeta punteada está al final de la conversación y se puede aprobar
      desde ahí también.

---

## 5 · Avisos de stock al celular

### Desde la ficha del producto (no necesita el bot)

- [ ] **5.1** Catálogo → abre un producto **con stock** (ej. 12) → «Avísame al celular cuando queden»
      → pon **10** → «Poner aviso».
      → «Listo: te llegará un aviso al celular cuando queden 10».
- [ ] **5.2** Cambia el stock a **9** y guarda el producto.
      → En menos de un minuto llega «[Producto]: quedan 9».
- [ ] **5.3** Toca la notificación → se abre Mia Gerente con **«¿Cuánto pido del producto …?» ya
      escrita, sin enviar**.
- [ ] **5.4** Baja el stock a **8** → **no** llega otro aviso.
- [ ] **5.5** Sube el stock a **20** y luego bájalo a **9** → **sí** llega otro aviso (nueva vuelta).
- [ ] **5.6** Con la cuenta de **administrador** en otro celular: ese aviso **no** le llega.
- [ ] **5.7** «Quitar» el aviso en la ficha → al bajar el stock ya no llega nada.

### Hablando con Mia 🤖

- [ ] **5.8** «Avísame cuando queden 5 del [producto]» → «Listo… Ahora tienes N».
- [ ] **5.9** «¿Qué avisos tengo?» → la lista.
- [ ] **5.10** «Ya no me avises del [producto]» → «Hecho».
- [ ] **5.11** «Avísame cuando se esté acabando» (sin número) → te **pregunta** cuántos.

### Ajustes

- [ ] **5.12** En Ajustes → Avisos, aparecen «Mensajes por aprobar» y «Stock que le pediste
      vigilar».
- [ ] **5.13** Apaga «Stock que le pediste vigilar» y repite 5.5 → no llega.
- [ ] **5.14** Con el silencio de la noche puesto (22:00–07:00), un aviso de esas horas llega en el
      resumen de la mañana.

---

## 6 · Datos de compra y cuánto comprar

### En la ficha (no necesita el bot)

- [ ] **6.1** Catálogo → producto con stock → aparece «Para que Mia te diga cuánto pedir».
- [ ] **6.2** Como **dueño**: rellena «Tarda en llegarte» 7, «Compras cada» 15, «Viene por caja de» 12
      y «Te cuesta» → «Guardar datos de compra» → recarga la página y siguen ahí.
- [ ] **6.3** Como **administrador**: ve los tres primeros campos y **no** ve «Te cuesta».

### Con Mia 🤖

- [ ] **6.4** «¿Qué tengo que comprar esta semana?» → por producto: lo que queda, lo que vendes por
      semana, lo que tarda en llegar y **cuánto pedir** (redondeado a cajas si pusiste caja).
- [ ] **6.5** Un producto sin datos en la ficha → dice «supuse 7 días…» y que se cambia en la ficha.
- [ ] **6.6** Un producto que casi no se vende → «vende poco», sin cantidad.
- [ ] **6.7** Como dueño sale «Costo del pedido: S/ …»; como administrador, no.
- [ ] **6.8** Al final te ofrece el aviso («¿Quieres que te avise cuando queden N?»). Di que sí → se
      pone (compruébalo con «¿qué avisos tengo?»).

---

## Si algo falla

Anota: número de la prueba · qué hiciste · qué esperabas · qué pasó · hora. Si es del panel me lo
pasas a mí; si es de lo que dice o hace Mia (🤖), a la sesión del bot.
