# Pruebas · The 24/7 · Caja, inicio, horas y boletas (18-nov-2026)

Para hacerlo en la **tablet Blackview** y en un **celular**, con la cuenta del dueño salvo donde se diga.
Cada paso dice qué tocar y **qué tienes que ver**. Si algo no se ve así, anota el número del paso.

> **Datos de prueba:** todo lo de ahora es prueba. Carga el negocio lleno con
> `scripts/the247-prueba-cargar.sql` y, al terminar, déjalo en cero con `scripts/the247-prueba-cero.sql`
> (primero córrelo tal cual para ver qué borraría; luego `v_confirmo = 'SI'`).

---

## 0 · Antes de empezar

1. En Supabase › SQL corre **`scripts/the247-prueba-cargar.sql`** en horario de atención: las horas
   de hoy se ponen alrededor de la hora en que lo corres. Deja de todo: 2 por cobrar, 2 sin marcar,
   2 pagos por verificar, un adelanto por reprogramar, gastos, adelantos, un pago de comisión y 7 días
   de historia en las dos sedes.
2. Abre **vendemias.com/panel** y recarga una vez (en la tablet: deslizar hacia abajo).
3. Para las boletas, en Supabase › SQL, en este orden:
   1. `modules/facturacion/sql/0002_servicios_y_productos.sql`
   2. `modules/facturacion/sql/0003_boleta_al_cobrar.sql`
   3. `scripts/the247-boletas.sql`: **antes de correrlo, llena arriba RUC, razón social y dirección fiscal**.
      Al final debe salir una fila con `activo = true` y `proveedor = simulado`.

---

## 1 · Inicio: «Lo que necesita atención»

| # | Haz esto | Tienes que ver |
|---|---|---|
| 1.1 | Entra a **Inicio** (con la carga del paso 0.1) | Arriba **«Lo que necesita atención»**: 2 clientes por cobrar, 2 citas sin marcar, 2 pagos por verificar, 1 adelanto por reprogramar y lo que se le debe al equipo. La **campana se balancea** |
| 1.2 | Crea una cita para **hace 1 hora** (paso 4.5) y vuelve a Inicio | Antes de 30 s, sin recargar: **«1 cita pasó sin marcar»**, botón **Marcar**, la **campana se balancea** y suelta ondas |
| 1.3 | En la Agenda marca esa cita **Atendido** y vuelve a Inicio | Cambia a **«1 cliente por cobrar»**, botón **Cobrar**, primero de la lista |
| 1.4 | Toca **Cobrar** | Te lleva a la Caja |
| 1.5 | Mira la parte de abajo de Inicio | Agenda de hoy y «más vendidos» lado a lado; las conversaciones, al final |

## 2 · Caja › Cobrar ticket (la guía que baja sola)

| # | Haz esto | Tienes que ver |
|---|---|---|
| 2.1 | Entra a **Caja** | Carga rápido. Tres botones grandes: **Cobrar ticket · Escanear tarjeta · Gasto o adelanto** |
| 2.2 | Toca **Cobrar ticket** | La pantalla **baja sola** al ticket. El paso **«1 · ¿Quién lo atendió?»** se ve resaltado (fondo naranja suave y un punto que late) |
| 2.3 | Toca un barbero | Baja sola a **«2 · ¿Qué se hizo?»**, que ahora es el resaltado |
| 2.4 | Toca un servicio | Si hay 2 sedes y no hay una elegida arriba, baja a **«¿En qué sede?»**; si no, baja hasta el **Total y Cobrar** |
| 2.5 | Toca otro servicio | La pantalla **no se mueve** (sigues eligiendo) y se suma al ticket |
| 2.6 | Mira **Productos** | Solo un **buscador** y los **4 más pedidos**. Nada de 28 botones |
| 2.7 | Escribe **«cer»** en el buscador | Salen solo las cervezas y las ceras |
| 2.8 | Usa **− y +** en el ticket de abajo | Cambia la cantidad y el total |
| 2.9 | **Cliente (opcional)** → PRUEBA / 999999999 | Se abre el formulario; **Quitar** lo cierra |
| 2.10 | Toca **Cobrar S/ …** → Efectivo | Aviso verde «Cobrado con efectivo…». La pantalla **sube sola** al inicio del ticket, con **«Último: …»** arriba |
| 2.11 | Con boletas activas (paso 0.3): en «Último» toca **Emitir boleta** | Sale **B001-1** con WhatsApp e **Imprimir** (ver 6) |

## 3 · Caja › cola, gastos y cierre

| # | Haz esto | Tienes que ver |
|---|---|---|
| 3.1 | Otro dispositivo: el barbero marca **Atendido** en Mi agenda | En la Caja, **antes de 20 s y sin recargar**, el cliente aparece en «Listos para cobrar» con su nombre |
| 3.2 | **Gasto o adelanto** → S/ 1 · Adelanto · un barbero | «Descontar de su comisión» marcado → **Guardar S/ 1** |
| 3.3 | Pestaña **Cierre del día** | Lo que entró por método, gastos y adelantos del día |
| 3.4 | Deja la Caja abierta 2 minutos | No se traba ni parpadea |

## 4 · Nueva cita (Agenda)

| # | Haz esto | Tienes que ver |
|---|---|---|
| 4.1 | Agenda → **Nueva cita** | Ventana con **solo servicios** (sin bebidas ni ceras) |
| 4.2 | Toca un servicio | Baja sola al siguiente campo (sede o «¿Con quién?») |
| 4.3 | Toca un barbero | Baja sola a **«¿A qué hora?»** |
| 4.4 | Mira las horas | Pestañas **Mañana · Tarde · Noche** con cuántas horas libres hay en cada una; se abre en la **franja de ahora**; horas **cada 30 min**; botón **Ahora · hh:mm** con la hora exacta |
| 4.5 | **«¿Ya lo atendiste? Ver las horas que ya pasaron»** | Vuelven las horas de antes (para regularizar); las pestañas dejan elegir cualquier franja |
| 4.6 | Elige una hora | Baja sola a **«¿Para quién?»** |
| 4.7 | **Agendar** sin servicio | El botón se ve **apagado** (gris), no se puede tocar |

## 5 · Comisiones

| # | Haz esto | Tienes que ver |
|---|---|---|
| 5.1 | Dueño → **Caja › Comisiones** | Arriba **«Por pagar a tu equipo»** con cada barbero, su monto y **Pagar** |
| 5.2 | **Pagar** → Efectivo → **Pagué S/ …** | Aviso «Pagado…»; el barbero sale de la lista; aparece como gasto de hoy en el Cierre |
| 5.3 | «Últimos pagos» → **Deshacer** | Vuelve a «por pagar» y se borra el gasto |
| 5.4 | Entra con la **cuenta de un barbero** (su celular y su contraseña) → **Mi comisión** | Arriba, en grande, **«Por cobrar S/ …»**: el **mismo número** que el dueño ve para él en 5.1 |
| 5.5 | Si el barbero tiene una cita pasada sin marcar | Aviso con enlace **«Márcalas en Mi agenda»** |

## 6 · Boletas e impresión (modo prueba)

| # | Haz esto | Tienes que ver |
|---|---|---|
| 6.1 | **Caja › Boletas** sin haber corrido el paso 0.3 | Aviso **«Las boletas electrónicas aún no están activadas»** con **Activar en Ajustes**, no botones muertos |
| 6.2 | Después del paso 0.3 | Botones **Nueva boleta / Nueva factura** que sí abren el formulario; arriba dice **Pruebas** |
| 6.3 | **Nueva boleta** → Corte S/ 20 → Emitir | Sale **aceptada** (simulada) |
| 6.4 | **Imprimir** | Se abre la impresión con el ticket de 80 mm que dice **«DOCUMENTO DE PRUEBA · SIN VALOR TRIBUTARIO»** |
| 6.5 | En la tablet, con la ticketera Bluetooth | Android pide elegir impresora: instala antes el **servicio de impresión** de la ticketera (la app de la marca o **RawBT**) y emparéjala por Bluetooth. Si el papel sale cortado, cambia a **58 mm** en Ajustes › Boletas |
| 6.6 | **WhatsApp** | Abre WhatsApp con el enlace de la boleta para el cliente |

**Para que valgan ante SUNAT:** Ajustes › Boletas y facturas → proveedor **Lucode** (el dueño lo
autoriza una vez en su Clave SOL), pegar el token, ambiente **Producción**, Guardar.

---

### Si algo falla

Toma captura y anota: el número del paso, si fue en la **tablet** o en el **celular**, y la hora.
