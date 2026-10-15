# Plan · Tu página (tienda.vendemias.com · agenda.vendemias.com)

> **Nombre.** Por fuera el producto se llama **«Tu página»** y vive en dos hosts que sirven lo mismo:
> `tienda.*` para quien vende y `agenda.*` para quien agenda (citas y grupos); el panel le da a cada
> negocio el suyo según `business_mode`. Por dentro sigue llamándose **Pide**: `modules/pide`, tablas
> `pide_*`, `/api/pide`, la ruta interna `/pide/<negocio>`. Donde este plan dice «Pide» es eso.

Escrito el 15-oct-2026. Sustituye a `PLAN-CATALOGO-Y-RESERVAS.md` (14-oct), que se borró. Los datos
de los que depende están en `docs/ARQUITECTURA-DATOS-V2.md`.

**Pide es la página que un negocio comparte con sus clientes**: lo que vende, cómo reservar, cómo
inscribirse y cómo pedir un envío, en un solo enlace (con `agenda.` en vez de `tienda.` si agenda):

```
tienda.vendemias.com/<negocio>             portada + catálogo
tienda.vendemias.com/<negocio>/p/<item>    un producto o servicio (para compartir suelto)
tienda.vendemias.com/<negocio>/reservar    citas y grupos
tienda.vendemias.com/<negocio>/envio       agendar un envío
```

## 1 · Principios

1. **Producto aparte.** Funciona con lo mínimo: un negocio y su número de WhatsApp. **No necesita a
   Mia ni a Fideliza.** Si están, se suman: Mia atiende el chat que abre Pide; la tarjeta de Fideliza
   puede salir como botón. Ajustes, plantillas y tablas son propios (`modules/pide/`, `pide_*`).
2. **Se genera desde lo que ya está configurado.** Catálogo, fotos, vídeos, precios, horario, equipo,
   grupos y cupos salen del panel. En Pide solo se eligen el aspecto y qué secciones se muestran.
3. **Configurar en 3 pasos, sin manual.** Ver §4.
4. **Comprar o reservar en 3–4 toques, sin cuenta.** Nunca se pide correo, contraseña ni tarjeta.
5. **Todo termina en WhatsApp, siempre.** Primero se guarda (el cupo queda tomado y el negocio lo ve
   en el panel y en el aviso push). Después, un botón grande **«Enviar por WhatsApp»** abre el chat del
   negocio con todo lo elegido ya escrito. Sin bot, es así como se entera el dueño y el cliente se queda
   con la prueba en su chat; con bot, es además lo seguro con Baileys, porque escribe el cliente
   primero.
6. **Rápida en un Android de gama media con datos móviles.** Ver §6.

## 2 · Lo que ve el cliente

**Portada y catálogo (todos los negocios).** Logo, nombre, una línea, y las secciones que el negocio
encendió. El catálogo va en tarjetas con la foto principal, título, descripción breve y precio, más un
filtro por categoría (`catalog.familia`) cuando hay más de una.

**Ficha de producto.** Galería de fotos y vídeos (`catalog_media`), descripción y **opciones**:

| Grupo | Ejemplo | Cómo se elige |
|---|---|---|
| Talla | S · M · L · XL | Botones; los agotados aparecen tachados |
| Color | Negro · Blanco | Muestras de color con su nombre |
| Tamaño | 1 kg · 3 kg | Botones, cada uno con su precio extra |
| Nivel | Pollito · Tiburón | Botones con «quedan 3 cupos» |

Cantidad → **«Añadir»**. El carrito es una barra fija abajo («3 productos · S/ 120 → Pedir»). Al
pedir: nombre, WhatsApp y, si el negocio reparte, entrega o recojo (dirección y referencia) → se
guarda → «Enviar por WhatsApp»:

```
Hola, quiero pedir (P-4F7):
• 2 × Polo básico · Talla M · Negro — S/ 70
• 1 × Gorra · Única — S/ 35
Total: S/ 105 · Entrega en Surco, Av. Primavera 123 (frente al parque)
A nombre de: Lucía
```

**Reservar (citas puntuales: salón, barbería, clínica).** Servicio → profesional (solo si el negocio
lo pide, con la opción «el primero libre») → día y hora → nombre y WhatsApp, más «¿para quién es?»
opcional → hecho: código, «Añadir a mi calendario» (.ics) y «Enviar por WhatsApp».

**Inscribirse (grupos: gimnasio, academia).** Nivel → grupo de la semana con «quedan 2 cupos»; los
llenos aparecen deshabilitados → datos → hecho.

**Agendar un envío.** Formulario corto, en una sola pantalla y con autocompletado:

- Quién envía: nombre y teléfono (se recuerdan en el navegador para la próxima vez).
- A quién: nombre, teléfono, dirección, distrito (lista), referencia.
- Qué va: descripción, número de bultos, peso aproximado (opcional), pago contra entrega (sí/no y
  monto).
- Recojo: fecha y franja (mañana / tarde).

→ se guarda con código `E-8K3Q` → «Enviar por WhatsApp».

## 3 · Lo que hace el negocio con los envíos

En el panel, **Envíos**: lista con filtros (por recoger · impresos · en camino · entregados), casillas
para marcar varios y **«Imprimir etiquetas»**:

- **A4** con 4 u 8 etiquetas por hoja, o **térmica 10×15 cm**, una por etiqueta.
- Cada etiqueta lleva destinatario en grande, dirección, distrito, referencia y teléfono, más
  remitente, bultos (`1/2`, `2/2`), monto a cobrar si hay contra entrega, código y un QR del código.
- Al imprimir, pasan a «impresos». El QR abre la ficha del envío en el panel para marcarlo como
  recogido o entregado.

La técnica de impresión ya existe en Fideliza (`modules/fideliza/ui/hojaLote.ts`: HTML con `@page`,
QR en SVG, `window.print()`): se reutiliza el patrón, no el código de placas.

## 4 · Lo que hace el dueño: 3 pasos

```
1. ¿Qué quieres que tus clientes puedan hacer?        (se marca solo según tu negocio)
   [✓] Ver mi catálogo y pedir   [✓] Reservar cita   [ ] Inscribirse a grupos   [ ] Pedir un envío
2. Elige cómo se ve                                    [plantillas en miniatura, vista previa real]
   Color · Logo · Foto de portada (opcional)
3. Tu WhatsApp para recibir los pedidos                987 654 321         → [Publicar]
```

Después: el enlace con «Copiar», «Compartir» y un **QR para imprimir**, más «Ver mi página».

**Plantillas propias de Pide**, pensadas para vender y no para enlaces:

| Plantilla | Para |
|---|---|
| **Vitrina** | Cuadrícula de fotos grandes: ropa, accesorios |
| **Lista** | Filas compactas con foto pequeña: muchos productos, lavanderías |
| **Carta** | Por categorías, sin fotos obligatorias: comida |
| **Agenda** | La reserva primero, los servicios debajo: salones, clínicas |
| **Clases** | Niveles y grupos con cupos a la vista: gimnasios, academias |
| **Envíos** | El formulario primero: couriers, emprendedores |

Se propone una sola según el negocio (`business_mode` + rubro) y se cambia con un clic. El patrón
técnico es el de Fideliza: una función pura arma la página, y **la misma** función alimenta la vista
previa en un iframe. Lo que ve el dueño es lo que verá su cliente.

**Opciones de producto** en el Catálogo del panel: «Añadir opciones» → elegir un grupo frecuente
(Talla, Color, Tamaño, Nivel) o escribir uno → escribir los valores separados por coma → precio extra
y stock por valor, solo si hace falta. Nada más.

## 5 · Datos

| Tabla | Nace en | Contenido |
|---|---|---|
| `pide_paginas` | Nube | `company_id`, `slug` (único; por defecto el de Fideliza si existe, si no el id del negocio), `plantilla`, `color`, `logo_url`, `portada_url`, `secciones` (jsonb), `whatsapp`, `publicada`, `version` |
| `catalog_opciones` | Nube | `catalog_id`, `grupo`, `valor`, `precio_extra`, `stock` (null = sin control), `orden`, `color_hex` |
| `pide_pedidos` | Nube | `codigo`, `company_id`, cliente, líneas (jsonb con opciones), total, entrega, `estado`. Es la intención del cliente; el pedido real (`orders`) llega en la etapa 4 de la arquitectura |
| `envios` | Nube | `codigo`, remitente, destinatario, dirección, distrito, referencia, bultos, peso, contra entrega, fecha y franja de recojo, `estado`, `impreso_at` |

Catálogo, fotos, horario y equipo se leen de las tablas de siempre. Las reservas usan el servicio de
reservas (arquitectura, §5).

**Lectura pública:** RPC `pide_srv_*` con una clave de servidor (mismo patrón que `loyalty_srv_*`), que
devuelve solo campos públicos. Nunca PII de otros clientes: los cupos salen como números.

**Abuso:** límite por IP y por teléfono, un campo trampa oculto y una clave de idempotencia por envío
(un doble toque no crea dos pedidos).

## 6 · Rendimiento

- La página se arma en el servidor y se **cachea hasta que el dueño publica** (revalidación por
  etiqueta al guardar). Abrirla no consulta la base.
- **Cupos y horas** van aparte, en un JSON pequeño con caché de 15 s: lo único que cambia a menudo no
  invalida la página.
- **Fotos** por Cloudinary con tamaño y formato según el uso (como `imagenPagina()` de Fideliza): 400 px
  en la cuadrícula, 1200 px en la ficha, WebP/AVIF, `loading="lazy"` salvo las primeras.
- **Vídeos:** solo la portada (un fotograma de Cloudinary) hasta que se tocan. Nunca autoplay con datos
  móviles.
- **JavaScript solo donde hace falta:** el catálogo es HTML; el carrito y la reserva son islas pequeñas.
  Objetivo: **< 100 KB** de primera carga sin contar fotos, y LCP < 2 s en 4G.

## 7 · Orden

| Fase | Qué | Depende de |
|---|---|---|
| **0** | Dominios `tienda.vendemias.com` y `agenda.vendemias.com` (código y Vercel el 15-oct; faltan los CNAME) | Alvaro |
| **1** | Envíos completo: formulario, panel, etiquetas | Nada: las tablas nacen en la nube |
| **2** | Página + plantillas + catálogo + opciones + carrito → WhatsApp | Leer: nada. Que un negocio **sin bot** edite su catálogo: etapa 2 de la arquitectura |
| **3** | Reservar e inscribirse | Etapa 4 de la arquitectura (servicio de reservas) |
| Después | Pedido de Pide convertido en `orders` real, pago con seña, dominio propio del negocio | |

Las fases 1 y 2 van en paralelo con las etapas 0–2 de la arquitectura.

## 8 · Decidido

- Nombre: **«Tu página»**; hosts **tienda** y **agenda**, la misma página en los dos (Alvaro, 15-oct;
  sustituye a «Pide» / `pide.vendemias.com`, decidido esa misma mañana). En el panel: `/panel/tu-pagina`.
  La pestaña «Mi página» de Fideliza (el Linktree) pasó a «Mis enlaces» para no chocar.
- **Unir «Mis enlaces» con Tu página** en la fase 2 (Alvaro, 15-oct): una sola página por negocio, con
  los botones de Fideliza como sección; `fideliza.vendemias.com/<slug>` (placas ya impresas) redirige
  siempre, y un solo slug por negocio. No antes: hoy Tu página solo tiene envíos.
- Arquitectura completa, sin atajos (Alvaro, 15-oct).
- Las preguntas obligatorias de Mia no aplican a Pide.
- Lo del voucher → cita (`prompt-bot-voucher-y-caja.md`) sigue en pausa.

## 9 · Abierto

- **«El primero libre»** en reservas: ¿por orden o repartido?
- **Slugs reservados:** `panel`, `api`, `login`, `admin`, `ayuda`… no se pueden dar a un negocio.
  Hoy `tienda.vendemias.com/panel` muestra una página de negocio llamada «panel» (no el panel, que nunca
  se sirve en estos hosts).
