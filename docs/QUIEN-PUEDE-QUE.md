# Quién puede qué · por acción y por rubro

> 12-nov-2026. Parte de `docs/PLAN-ROLES.md` (lo que decidió Alvaro el 13-oct, agrupado por
> pantalla) y lo pasa a **acciones**, añadiendo lo que ha salido después: canchas, mesas, pedidos,
> boletas, foto del pago, Mia Gerente. Alvaro contestó las dudas el mismo 12-nov; lo que sigue
> abierto lleva ❓ y mi propuesta en la celda.

## Quién hay

- **Dueño**: uno por negocio. Puede todo, y es el único que ve y cambia la configuración crítica.
- **Administrador**: lleva el día a día. No ve la configuración crítica (ver abajo), ni ganancia, ni
  métricas; no nombra administradores.
- **Empleado**: barbero, estilista, profesor, mesero, el que abre la cancha. Atiende; **no toca
  dinero**, no cambia precios, no ve contactos.
- Fideliza tiene sus propios roles: el administrador entra como **encargado** y el empleado como
  **cajero** (ver al final).

**Leyenda.** ✅ puede · 👁 solo mirar · — no puede ni lo ve.
**Columna «Hoy».** **Base** = lo impide Postgres aunque alguien se salte la pantalla · **Bot** = el
bot lo rechaza (`sin_permiso`) · **Pantalla** = solo se esconde · **Construir** = decidido, falta
hacerlo · **❓** = sin decidir.

## Tres reglas de fondo (Alvaro, 12-nov-2026)

1. **El empleado no cobra, salvo que el negocio lo pida.** De serie, el cobro va por nuestros
   medios (pago en la página, Yape validado) o lo apunta la caja; el empleado, como mucho, crea la
   cita. Si el dueño pide que sus empleados cobren, **lo enciende el equipo de Vendemia**
   («Los empleados cobran», datos 0012) y entonces cobran desde Mi agenda: solo lo que falta, sin
   descuento, **siempre con foto** (también en efectivo), y queda a su nombre en la Caja.
   Vale para todos los rubros con agenda (citas, canchas). Alvaro, 12-nov-2026.
2. **Todo se audita.** Quién hizo qué, cuándo, y el valor de antes y el de después.
3. **La configuración crítica es del dueño y el administrador no la ve** (ni en solo lectura):
   - métodos de pago (Yape, cuentas) y teléfonos del negocio;
   - % y montos de comisión;
   - costos de compra;
   - SUNAT: RUC, series, proveedor, token;
   - cómo se cobran los pedidos (contra entrega, todo antes, adelanto);
   - foto del pago apagada / opcional / obligatoria;
   - plan, consumo y recargas.

   Hoy el administrador ve en solo lectura los métodos de pago, los teléfonos y los % de comisión
   (`soloLeeLoDelDueno`). Hay que pasar a esconderlos, y en la base, no solo en la pantalla.

---

## Acciones comunes a todos los rubros

### Agenda y atención

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Ver la agenda de todo el negocio | — (solo la suya y «Sin asignar») | ✅ | ✅ | Base (0044) |
| Marcar «vino / no vino» | ✅ suyas y sin asignar | ✅ | ✅ | Base |
| Añadir lo que consumió el cliente a su cita | ✅ | ✅ | ✅ | Base |
| Crear una cita a quien llega sin reserva | ✅ **solo en su agenda**, al precio del catálogo | ✅ | ✅ | Construir |
| Mover o cancelar una cita | — | ✅ | ✅ | Base |
| Asignar una cita a un empleado | — | ✅ | ✅ | Base |
| Avisos al celular de **su** agenda | ✅ | ✅ | ✅ | falta aplicar la avisos 0004 |
| Avisos al celular de pagos y del negocio | — | ✅ | ✅ | Base (avisos 0002) |

### Clientes y mensajes

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Ver nombre y notas del cliente | ✅ de sus citas | ✅ todos | ✅ todos | Base |
| Ver teléfono, WhatsApp, correo, dirección | — | ✅ | ✅ | Base |
| Entrar al chat y responder | — | ✅ | ✅ | Base |
| Escribir primero a un cliente, aviso rápido, campañas | — | ✅ | ✅ | Base |
| Aprobar los mensajes que propone Mia Gerente | — | ✅ | ✅ | Base (0008) |
| Exportar la lista de clientes | — | — | ✅ | Base en Fideliza · Construir en el resto |

### Dinero

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Cobrar (marcar pagado, registrar adelanto) | — | ✅ | ✅ | Base |
| Validar el comprobante que mandó el cliente | — | ✅ | ✅ | Base |
| Subir la foto del pago al cobrar | — | ✅ | ✅ | Base |
| Apuntar gastos | — | ✅ | ✅ | Base (0044) |
| Descuento en ese cobro | — | ✅ auditado | ✅ auditado | Construir (los pedidos ya tienen `discount`) |
| Anular un cobro o devolver dinero | — | ✅ auditado | ✅ auditado | Construir |
| Emitir boleta o factura | — | ✅ | ✅ | Base |
| Configurar SUNAT | — | — | ✅ | Base (leer: Construir) |
| Ver su propia comisión | ✅ | ✅ | ✅ | Base |
| Ver las comisiones de todos (importes) | — | 👁 | ✅ | Base |
| Fijar el % o monto de comisión | — | — | ✅ | Bot (ocultar al admin: Construir) |
| Dashboard, métricas, ingresos y ganancia | — | — | ✅ | Base |
| Plan, consumo y recargas | — | — | ✅ | Construir (hoy el admin lo ve) |

### Catálogo y precios

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Ver catálogo con precios | ✅ | ✅ | ✅ | Base |
| **Cambiar precios** | — | ✅ auditado | ✅ auditado | Base / Bot |
| Crear, borrar u ocultar servicios y productos | — | ✅ | ✅ | Base / Bot |
| Subir fotos del catálogo | — | ✅ | ✅ | Base |
| Ver y cambiar el **costo** de compra | — | — | ✅ | Base (0009) |
| Datos de compra (proveedor, stock mínimo) | — | ✅ | ✅ | Base (0009) |
| Marcar «agotado» | — | ✅ | ✅ | Base |

### Equipo

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Ver quién es quién en el equipo | ✅ | ✅ | ✅ | Base |
| Editar fichas, horarios y ausencias | — | ✅ (sin ver el %) | ✅ | Base / Bot |
| Dar y quitar acceso a empleados | — | ✅ | ✅ | Bot |
| Nombrar o quitar administradores | — | — | ✅ | Bot |
| Traspasar el negocio a otro dueño | — | — | — | lo hacemos nosotros, a mano |

### Negocio, Mia y Mi página

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Ajustes de Mia (cómo responde, saludo, adjuntos) | — | ✅ | ✅ | Base / Bot |
| Horario del negocio | — | ✅ | ✅ | Base / Bot |
| Métodos de pago (Yape, cuentas) y teléfonos | — | — | ✅ | Bot (ocultar al admin: Construir) |
| Editar y publicar Mi página | — | ✅ | ✅ | Base |
| Cómo se cobran los pedidos | — | — | ✅ | Construir (hoy lo cambia el admin) |
| Foto del pago apagada / opcional / obligatoria | — | — | ✅ | Base |
| Asistente (Mia Gerente) | — | ✅ sin importes | ✅ | Base / Bot |

---

## Por rubro

Lo común de arriba vale para todos. Aquí va solo lo propio de cada uno.

### Barbería, salón, uñas, clínica (citas)

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Ver Mi agenda (semana, tarjetas con estado) | ✅ | — (tiene la Agenda) | — | Pantalla |
| Apartar una cita sin adelanto (24 h) o soltarla | — | ✅ | ✅ | Base |
| Registrar en **su** agenda a quien llega sin cita | ✅ | ✅ | ✅ | Construir |
| Cobrar lo que falta de **su** cita, con foto | — (✅ si Vendemia lo enciende) | ✅ | ✅ | Base (0012, sin aplicar) |
| Bloquear un rato de su agenda (descanso) | ✅ | ✅ | ✅ | ❓ |

### Academia, gimnasio (clases)

| Acción | Profesor | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Pasar lista (vino / no vino) | ✅ todas, mientras no haya profesor asignado | ✅ | ✅ | Base |
| Ver alumnos del grupo, sin contacto | ✅ | ✅ | ✅ | Base |
| Matricular, cambiar de grupo, dar de baja | — | ✅ | ✅ | Base |
| Cobrar mensualidades | — | ✅ | ✅ | Base |

### Canchas

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Ver el tablero del día y marcar «llegaron» | ✅ | ✅ | ✅ | Construir |
| Crear una reserva desde el panel (el que llega a jugar) | ✅ al precio fijado | ✅ | ✅ | ❓ propuesta: sí |
| Ver los turnos fijos en el tablero | ✅ | ✅ | ✅ | Construir |
| Renovar o cancelar un turno fijo | — | ✅ | ✅ | Base |
| Cobrar el adelanto | — | ✅ | ✅ | Base (0018) |
| Cobrar lo que falta, importe exacto, con foto y a su nombre | — (✅ si Vendemia lo enciende) | ✅ | ✅ | Base (0012, sin aplicar) |
| Validar el comprobante subido en la página | — | ✅ | ✅ | Base (0017) |
| Preguntar por WhatsApp a quien tiene el Yape si llegó el pago | ✅ | ✅ | — | Construir |
| Lista «Avísame» | — | ✅ | ✅ | Base |

**Nota del 12-nov sobre el saldo en la cancha.** De noche el saldo se paga en efectivo, en la
cancha, y quien está ahí suele ser el empleado. Si no puede apuntarlo, el dinero se cobra igual,
pero sin registro. Hay dos salidas:
(a) mantener la regla, y que el saldo se pague por Yape a la cuenta del negocio o que quien cuida
la cancha sea administrador;
(b) una excepción estrecha: el empleado apunta «saldo cobrado en efectivo» por el importe exacto
pendiente, sin poder cambiarlo ni hacer descuento, queda auditado y sale en la caja como «cobró
Fulano» para cuadrar al cierre.

**Decidido (b), y configurable** (Alvaro, 12-nov): de serie el empleado no cobra; si el dueño lo
pide, Vendemia enciende «Los empleados cobran» y entonces cobra lo que falta, siempre con foto,
aunque la «Foto del pago» del negocio esté apagada. Construido en
`modules/datos/sql/0012_cobra_el_empleado.sql` (probado en PGlite, 29/29; sin aplicar) y en Mi
agenda. Una cita apartada que no es de cancha no la cobra el empleado: la confirma la caja.

**Botón de WhatsApp a quien tiene el Yape** (Alvaro, 12-nov), para los negocios sin el lector de
Yapes: junto a un pago por validar, o cuando el cliente dice «ya te yapeé», un botón abre WhatsApp
con el mensaje hecho: «Hola, ¿te llegó un Yape de S/ 40,00 hoy a las 21:10? Es de Juan Pérez, por
la cancha 2 de las 21:00». Va al número del Yape configurado en los métodos de pago. El botón no
valida nada: validar sigue siendo del administrador o del dueño.

### Restaurante, cafetería

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Atender mesas | ✅ | ✅ | ✅ | Base |
| Escanear la tarjeta de puntos | ✅ | ✅ | ✅ | Base (Fideliza) |
| Mover un pedido en el tablero (Preparando → Listo), sin importes | ✅ | ✅ | ✅ | Construir |
| Cobrar el pedido | — | ✅ | ✅ | Base |
| Marcar un plato agotado | — | ✅ | ✅ | Base |
| Cambiar la carta y sus precios | — | ✅ | ✅ | Base |

### Tienda (pedidos y envíos)

| Acción | Empleado | Admin | Dueño | Hoy |
|---|---|---|---|---|
| Preparar y empaquetar (mover a «Listo»), sin importes ni dirección | ✅ | ✅ | ✅ | Construir |
| Ver la dirección de envío | — | ✅ | ✅ | Base |
| Cobrar, confirmar el pago, marcar enviado | — | ✅ | ✅ | Base |
| Stock y productos | — | ✅ | ✅ | Base |

### Fideliza (cualquier rubro)

| Acción | Cajero (empleado) | Encargado (admin) | Dueño | Hoy |
|---|---|---|---|---|
| Buscar socio, registrar visita o compra, canjear | ✅ | ✅ | ✅ | Base |
| Dar de alta un socio | ✅ | ✅ | ✅ | Base |
| Ver contactos de los socios | — | ✅ | ✅ | Base |
| Devoluciones | — | ✅ | ✅ | Base |
| Programa, premios, campañas, dispositivos | — | ✅ | ✅ | Base |
| Números (métricas de Fideliza) | — | ✅ | ✅ | Base |
| Exportar y gestionar el equipo de Fideliza | — | — | ✅ | Base |

---

## Auditoría

Hoy solo audita Fideliza (`loyalty_audit_log`). En el resto del panel no queda registro de quién
cambió un precio, anuló un cobro o movió una cita.

Lo mínimo: una tabla por negocio con **quién** (usuario y su rol en ese momento), **cuándo**,
**qué acción**, **sobre qué** (cita, producto, ajuste) y **antes / después**. La escriben las
funciones de Postgres, no la pantalla, para que no se pueda saltar. La lee solo el dueño.

Qué se apunta, como mínimo:
- dinero: cobros, adelantos, descuentos, anulaciones, devoluciones, comprobantes validados, gastos;
- precios, costos y comisiones;
- toda la configuración crítica de arriba;
- equipo: altas, bajas y cambios de rol;
- agenda: citas creadas, movidas y canceladas (sobre todo las que crea el empleado);
- exportaciones de clientes.

## Qué pasa con lo ya cobrado al cambiar un precio, un costo o una comisión

Comprobado en el código el 12-nov-2026:

- **Precio: no toca el pasado.** Cada cita guarda el precio de cada servicio en su línea
  (`appointment_services.price`), y cada pedido el suyo en `orders.items`. Cambiar el catálogo
  solo afecta a lo que se reserve después.
- **Comisión: SÍ recalcula todo el histórico.** `lib/panel/comisiones.ts` toma el % o monto que
  tiene HOY el servicio o el profesional y lo aplica a todas las citas del periodo, incluidas las
  de meses atrás. Si el dueño sube el % de un barbero, sus comisiones de octubre cambian.
- **Costo: también va con el de hoy.** `catalogo_costos` guarda un solo costo por producto, sin
  fecha: cualquier margen de ventas pasadas sale con el costo actual.

**Corregido el 12-nov** («eso no es posible, corrijamos», Alvaro) con
`modules/datos/sql/0011_venta_congelada.sql`, **sin aplicar todavía**. Al completarse una cita, la
base copia la tarifa de comisión y el costo de cada línea; al crearse un pedido, el costo de cada
producto. Las pantallas de comisiones ya leen la copia (y, mientras la 0011 no esté aplicada, siguen
como antes). Lo ya vendido se congela al aplicarla con la tarifa de ese día, así que ninguna cifra
cambia ese día. Probada en PGlite: `modules/datos/sql/tests/pruebas_0011_pglite.mjs` (24/24).
El margen lo calcula el bot: encargo en `docs/prompt-bot-costo-congelado.md`.
