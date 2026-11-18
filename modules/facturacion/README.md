# Boletas y facturas electrónicas (SUNAT)

Emitir boletas y facturas desde el panel (`/panel/comprobantes`), imprimirlas en ticketera (58/80 mm) o como PDF, mandarlas por WhatsApp y anularlas. Cada local elige su proveedor en **Boletas y facturas › Ajustes**.

## Cómo está armado

```
dominio/        Lo que no depende de nadie: tipos, IGV (montos.ts), validaciones (DNI/RUC, S/700),
                monto en letras, el ticket impreso (impreso.ts) y los códigos de SUNAT.
proveedores/    Un fichero por proveedor, todos con la misma interfaz (tipos.ts):
                  lucode.ts     Lucode / APISUNAT: PSE. El local solo lo autoriza en su clave SOL.
                  apisperu.ts   APIsPerú: firma con el certificado y el usuario SOL secundario DEL LOCAL.
                  simulado.ts   No envía nada. Para probar el panel.
servidor/       La ruta POST /api/facturacion y el cifrado de tokens (AES-256-GCM).
ui/             La pantalla, el formulario, los Ajustes y la impresión.
sql/0001        Tablas y funciones. El número lo da Postgres; «aceptado» solo lo escribe el servidor.
sql/0002        Amazonía «servicios y productos»: cada comprobante lleva la leyenda (2001/2002) de lo vendido.
sql/0003        «Al cobrar» (no / preguntar / automático) y factura_publica para el enlace /comprobante/<id>.
ui/BoletaDelCobro   La boleta de un cobro en Caja (Cobrar ticket, Listos para cobrar).
ui/CompartirBoleta  WhatsApp (al celular del cliente), Compartir o Copiar enlace, Imprimir.
ui/VerComprobante   La página pública del enlace: el ticket con QR y «Guardar en PDF».
```

**Cambiar el proveedor de un local:** en Ajustes. No hay que tocar código. Cada proveedor guarda su propio token, y lo ya emitido se consulta y anula con el proveedor con el que salió.

**IGV de restaurantes y hoteles MYPE:** en Ajustes se elige «Restaurante u hotel MYPE» y la tasa sale de la fecha de emisión (`factura_tasa_mype` en la SQL): 10,5 % en 2026 (8 IGV + 2,5 IPM), 15 % en 2027 (12 + 3), 18 % desde 2028. Si el Congreso lo prorroga, se cambia solo ahí. Postgres rechaza un comprobante calculado con otra tasa antes de darle número (p. ej. la pantalla abierta al pasar el año).

**Añadir un proveedor:** un fichero en `proveedores/` que cumpla `Proveedor` + una línea en `proveedores/index.ts` + el id en `dominio/tipos.ts` (`PROVEEDORES`), en `dominio/proveedoresInfo.ts` y en los `check` de `factura_ajustes` / `factura_credenciales` (SQL).

## Para ponerlo en marcha

1. Aplicar `sql/0001_facturacion.sql` (deshacer: `scripts/facturacion-0001-deshacer.sql`) luego `sql/0002_servicios_y_productos.sql` y `sql/0003_boleta_al_cobrar.sql` (cada una con su `scripts/facturacion-000N-deshacer.sql`).
2. Servidor: usa `FACTURACION_CLAVE` (≥ 32 caracteres) para cifrar los tokens; si no está, usa `FIDELIZA_SERVER_KEY`, que ya existe. Rotar la que se usó obliga a volver a pegar los tokens.
3. Probar con los sandbox: [docs/pruebas-facturacion.md](../../docs/pruebas-facturacion.md).

## Pruebas

- `npm run test:facturacion`: IGV, letras, RUC y los JSON de cada proveedor.
- `pruebas/sql_pglite.mjs`: la SQL contra Postgres (PGlite), 0001 + 0002 + 0003, 56 casos.

## Lo que NO hace todavía

- Nota de crédito (después del plazo de baja: 3–7 días según proveedor). Por ahora se emite en el panel del proveedor.
- Factura a crédito (cuotas), descuentos, ICBPER (bolsas), detracciones, guías de remisión.
- Emitir desde la Caja o Pedidos con un botón: la pantalla ya acepta `?nuevo=boleta&concepto=…&monto=…&ref=cita:ID`, falta poner el enlace.
- Consultar DNI/RUC para autocompletar el nombre.
