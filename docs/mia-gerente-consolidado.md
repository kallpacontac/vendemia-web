# Mia Gerente: cómo queda

Resumen de lo acordado el 21-oct-2026. El detalle está en dos documentos:
- [prompt-bot-mia-gerente-consejos.md](prompt-bot-mia-gerente-consejos.md): qué mirar, qué
  aconsejar, cuánto comprar, avisos de stock y cómo hablar.
- [prompt-bot-mia-gerente-contactar.md](prompt-bot-mia-gerente-contactar.md): escribirle a un
  cliente, negociar, coordinar entregas y la aprobación.

En las listas, **Hoy** quiere decir que ya funciona y **Nuevo**, que hay que construirlo.

---

## 1 · Qué es

La gerente del negocio en el panel. Le dice al dueño cómo va, qué se le escapa y qué hacer hoy, y
prepara los mensajes a los clientes para que salgan con un clic.

Cuatro reglas que no cambian:
1. **No calcula ni estima nada.** Todo número sale de una función con su fórmula. Ella solo lo cuenta.
2. **Nada sale a un cliente sin aprobación** del dueño o del administrador.
3. **No inventa**: ni causas, ni el «dolor» del cliente, ni datos del negocio.
4. **Habla fácil**: palabras de mostrador, sin tecnicismos y sin tratar a nadie como niño.

## 2 · Quién la usa

| | Dueño | Administrador | Empleado |
|---|---|---|---|
| Preguntar por ventas, clientes, stock, agenda | Sí | Sí | No |
| Caja, ganancia, gastos, comisiones, quién debe | Sí | No | No |
| Costo y margen de los productos | Sí | No | No |
| Preparar y aprobar mensajes a clientes | Sí | Sí | No |
| Ofertas con descuento a un cliente | Sí | Sí, sin ver costo ni margen | No |
| Poner avisos de stock | Sí | Sí | No |

## 3 · Lo que se le puede preguntar

### Plata (solo el dueño)
- ¿Cuánto entró hoy? ¿Cuadra la caja? — **Hoy**
- ¿Cuánto me queda este mes? ¿Cuánto gasté? — **Hoy**
- ¿Quién me debe? — **Hoy**
- ¿Cuánto le debo a cada barbero esta semana? — **Hoy**
- ¿Cuánto me deja cada producto? — **Hoy**, solo si el costo está cargado (hoy se carga por script)

### Ventas
- ¿Cómo me fue la semana pasada? ¿Este mes contra el pasado? — **Hoy**
- ¿Cuántos pedidos tengo al día? ¿De cada 10 que preguntan, cuántos compran? — **Hoy**
- ¿Qué me piden más y qué se vende más? — **Hoy**
- ¿Qué productos preguntan y no compran? — **Hoy**
- ¿Qué se compra junto? — **Nuevo**

### Clientes
- ¿A quién le escribo hoy? — **Hoy** (carritos sin cerrar, citas a medias, cupo liberado, volvió lo
  que quería, cliente que no vuelve, preguntó y no volvió)
- ¿Qué sé de Carlos? ¿Qué pasó con el pedido de María? — **Hoy**
- ¿Qué le frenó a Carla? — **Hoy**
- ¿Funcionaron los mensajes que mandé este mes? — **Nuevo**

### Productos y stock
- ¿Cuánto me queda del Polo negro? ¿Qué tallas se me agotan? — **Hoy**
- ¿Qué se me acaba pronto? — **Hoy** (contra 14 días fijos)
- ¿Qué me piden que no tengo? — **Hoy**
- ¿Qué tengo que comprar esta semana y cuánto? — **Nuevo**
- ¿Qué tengo parado? ¿Cuánta plata hay ahí? — **Nuevo**
- Avísame cuando queden 5 del Polo negro. — **Nuevo**

### Agenda, cupos y academia
- ¿Cómo está mi agenda de mañana? — **Hoy**
- ¿Qué horarios tengo llenos? ¿Cuántos cupos quedan en el nivel Pollito? — **Hoy**
- ¿A quién se le vence la mensualidad? — **Hoy**
- ¿Qué horas se me quedan vacías? — **Nuevo**
- ¿Cuántos faltaron sin avisar? — **Nuevo**
- ¿Quién no renovó este mes? — **Nuevo**

### Pedidos y entregas
- ¿Qué está pendiente? ¿Qué pedidos tengo en curso? — **Hoy**
- ¿Qué pedidos no puedo entregar todavía y qué les falta? — **Nuevo**

### Mia
- ¿Cómo lo está haciendo Mia? — **Hoy**
- ¿Qué no supo contestar? — **Hoy**

### Consejos
- ¿Qué hago hoy para vender más? — **Nuevo**

## 4 · Lo que puede hacer

Todo lo que llega a un cliente pasa por una **tarjeta pequeña dentro del chat de ese cliente**, en
Mensajes: al final de la conversación, como el siguiente mensaje que todavía no salió, con borde
punteado y tres botones: **Aprobar y enviar · Corregir · Descartar**.
- **Corregir** edita el texto ahí mismo, dentro de la tarjeta.
- En Mia Gerente solo queda «Te lo dejé en el chat de Carla» con un botón para ir.
- En la lista de conversaciones, esos chats llevan la etiqueta «Por aprobar» y tienen su filtro.
- La tarjeta solo la ven el dueño y el administrador: lleva el tope de la negociación.

| Acción | Ejemplo de lo que se le dice | |
|---|---|---|
| **Ofrecer algo a un cliente** | «Escríbele a Carla, ofrécele el trimestral del nivel Pollito, hasta 25 soles menos, entra por lo del miedo al agua» | Nuevo |
| **Recuperar a un cliente** | «Escríbele a Carlos, que hace 6 semanas que no viene» | Nuevo |
| **Avisar algo** | «Avísale a Ana que llegó su talla» | Nuevo |
| **Cobrar** | «Recuérdale a Pedro el saldo de su pedido» | Nuevo |
| **Coordinar una entrega** | «Coordina la entrega de Paola» | Nuevo |
| **Negociar por ti** | Al aprobar una oferta, Mia de ventas queda con el encargo: empieza en S/ 10 menos, ofrece algo que no es plata, luego S/ 20, y S/ 25 solo si el cliente se va. Nunca dice el tope. Si piden más, te avisa | Nuevo |
| **Proponer mensajes sola** | Cada mañana deja los mensajes que conviene mandar, cada uno en el chat de su cliente, y avisa por push | Nuevo |
| **Activar avisos de stock a pedido** | «Avísame cuando queden 5 del Polo negro», «¿Qué avisos tengo?», «Ya no me avises del Polo negro». Sin aprobación: no toca clientes ni plata. Mia puede proponer uno, pero solo lo activa si le dicen que sí | Nuevo |

Cada mensaje sale:
- corto (2 a 4 líneas), con el nombre del cliente y firmado por quien lo aprueba;
- con una cosa que el cliente dijo de verdad, y una sola pregunta fácil al final;
- con el adjunto que mejor responde a lo que le preocupa (vídeo de la clase, foto del plan, foto del
  producto);
- si se quiere, con un audio de 10 a 20 segundos: el guion lo da Mia y lo graba quien aprueba, o lo
  dice la voz clonada si hay consentimiento firmado.

### Lo que no hace
- Cambiar precios, pedidos, citas o pagos.
- Mandar sin aprobación.
- Mandar en masa: es de uno en uno, y como mucho 5 borradores a la vez.
- Escribir a quien nunca escribió al negocio, o a quien pidió que no le escriban.
- Mandar de noche: lo aprobado después de las 9 de la noche sale a las 9 de la mañana.

## 5 · Avisos que llegan al celular

Todos son **notificaciones push** del panel instalado en el celular (la PWA), por el mismo camino que
los avisos de pago y de reserva que ya existen. Respetan las horas de silencio y se pueden apagar
por tipo en Ajustes.

### Los de stock: solo si los pides

No hay ninguno puesto de entrada. Le llegan **solo a quien lo pidió**, una vez por vuelta: si
reponen y vuelve a bajar, avisa de nuevo.

| Lo que pides | Ejemplo de notificación |
|---|---|
| «Avísame cuando queden 5 del Polo negro» | «Polo negro: quedan 5. Vendes unos 6 por semana» |
| «Avísame si se agota la M de la Casaca jean» | «Casaca jean M: agotada» |

Al tocarla se abre Mia Gerente con «¿Cuánto pido del Polo negro?» lista para enviar.

### Los del negocio: activados o apagados en Ajustes

| Aviso | | Cuándo |
|---|---|---|
| Pago por revisar | Ya existe | En el momento |
| Reserva o pedido nuevo | Ya existe | En el momento |
| WhatsApp desconectado | Ya existe | En el momento |
| Mensajes por aprobar | Nuevo | Cada mañana, agrupados en uno |
| Un cliente pide más descuento del que le diste | Nuevo | En el momento |
| Un cliente completó los datos de su entrega | Nuevo | En el momento |

### Lo que no es notificación

Lo que se acaba antes de que llegue el pedido, la mercadería parada, las horas llenas o vacías y
los clientes que no vuelven **no llegan al celular**: Mia lo dice cuando le preguntan o en el
resumen. Si algo de eso interesa, Mia ofrece convertirlo en un aviso («¿Quieres que te avise cuando
queden 9?»).

## 6 · La rutina del dueño

- **Cada día, 2 minutos:** caja, pendientes, aprobar los mensajes de la mañana.
- **Cada lunes:** qué comprar, horas llenas y vacías, clientes que no vuelven, lo que Mia no supo
  contestar.
- **Cada mes:** cuánto le queda, cuánto deja cada producto, plata parada, precios.

## 7 · Qué construir, en orden

1. **Ya, sin construir nada:** pegar en el prompt las reglas de cómo aconsejar y cómo hablar
   (parte 8 de *consejos*, sin las líneas de compras y avisos).
2. **Mensajes con aprobación, sin plata de por medio:** `preparar_contacto`, la tarjeta,
   `aprobar_borrador` y coordinar entregas (`entregas_por_coordinar`, `completar_entrega`). Es lo
   que más se va a usar y no depende de nada más.
3. **Ofertas con tope:** los encargos para Mia de ventas, y que el precio pactado llegue al cobro.
   Primero productos (se amplía el tope que ya existe); después servicios y planes, que hoy cobran
   siempre el precio del catálogo.
4. **Compras:** costo, lo que tarda en llegar y cada cuánto se compra, en la ficha del producto;
   `que_comprar`; los avisos de stock.
5. **Que el bot entienda la ubicación de WhatsApp.**
6. **Lo demás:** plata parada, horas vacías y faltas, lo que se compra junto, «¿qué hago hoy?» y el
   seguimiento de si los consejos funcionaron.
