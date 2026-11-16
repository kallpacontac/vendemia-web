# Pruebas de boletas y facturas (Lucode y APIsPerú)

Nada de esto se probó todavía contra los proveedores: el código sigue su documentación (11-nov-2026). Estas pruebas confirman si aceptan nuestro JSON. Todo se hace en **pruebas**: no llega a SUNAT de verdad.

## 0 · Antes

- [ ] SQL `modules/facturacion/sql/0001_facturacion.sql` aplicada.
- [ ] Desplegado (o `npm run dev`) con `FIDELIZA_SERVER_KEY` puesta.
- [ ] Panel › **Boletas y facturas** › Ajustes: proveedor «Prueba local», RUC y razón social de prueba, activar. Emitir una boleta y **imprimirla**: debe salir con «DOCUMENTO DE PRUEBA».

## 1 · Lucode (sandbox.apisunat.pe)

- [ ] Crear cuenta en lucode.pe, crear la empresa en «Organizaciones» y copiar el token.
- [ ] Ajustes: proveedor Lucode, ambiente Pruebas, pegar el token, guardar.
- [ ] Boleta sin documento, 1 línea de S/35 → **Aceptado**, con hash y enlace al PDF.
- [ ] Boleta con DNI, 2 líneas con decimales (S/12,50 × 3) → Aceptado. ¿El total de Lucode coincide al céntimo?
- [ ] Factura a un RUC real → Aceptado. Mandamos `fecha_de_vencimiento` = fecha de emisión (su tabla la pide; su ejemplo no la trae). Si la rechaza, quitarla en `proveedores/lucode.ts`.
- [ ] Ajustes › IGV «Restaurante u hotel MYPE» → debe decir «Hoy sale con 10,5 %» y que el 1 de enero de 2027 pasa a 15 %. Emitir → Aceptado. ¿Su PDF dice IGV 10,5 %? (Ninguna fuente oficial dice cómo va en el XML; mandamos un solo porcentaje, IGV + IPM.)
- [ ] Exonerado Amazonía (servicios) → Aceptado y la leyenda sale en su PDF.
- [ ] Anular la boleta → «Anulando» (su resumen responde PENDIENTE). Pulsar Consultar más tarde. ⚠️ Su documentación no dice cómo consultar una baja: anotar qué `estado` devuelve /status para la boleta anulada.
- [ ] Anular la factura → igual.
- [ ] Pedirle a Lucode su **número de resolución de PSE** y que confirme cuál es la ruta del resumen diario (`/api/v3/daily-summary` o `/api/test/...`).

## 2 · APIsPerú (facturacion.apisperu.com)

- [ ] Crear cuenta. Dar de alta la empresa en **beta** con el certificado de prueba que ellos generan (`/companies/certificate/free`) y un usuario SOL cualquiera. Copiar el **token de la empresa**.
- [ ] Ajustes: proveedor APIsPerú, ambiente Pruebas, token, y **ubigeo, departamento, provincia y distrito**.
- [ ] Las mismas emisiones que con Lucode.
- [ ] ⚠️ Boleta **sin documento**: mandamos el tipo de documento `0` con el número `00000000`. Si SUNAT beta lo rechaza, probar con `-` en `proveedores/apisperu.ts` (función `cliente`).
- [ ] Anular boleta (resumen diario) y factura (comunicación de baja) → «Anulando» → Consultar → «Anulado».

## 3 · Antes de producción con un local real

- [ ] Que su contador confirme el régimen: 18 %, restaurante u hotel MYPE (MYPE ≤ 1.700 UIT, ≥ 70 % de ingresos de restaurante/hotel/hospedaje, sin vinculadas) o exonerado Amazonía (Iquitos). La tasa MYPE la cambia Vendemia sola por fecha: 10,5 % en 2026, 15 % en 2027, 18 % desde 2028.
- [ ] Serie nueva (B002/F002) si el local ya emite con otro sistema, o poner el último número que emitió.
- [ ] Lucode: el local autoriza a Lucode como PSE en su clave SOL. APIsPerú: alta en **producción** con su certificado real y un usuario SOL secundario.
- [ ] Imprimir en su ticketera real (58 u 80 mm) y escanear el QR con la app de SUNAT.
