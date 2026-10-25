# Prompt para la sesión del bot: Mia Gerente dice cuánto comprar (`que_comprar`)

Pégalo tal cual en la sesión del bot (`vendemia`). Es la fase 2, punto 1, del consolidado
(`vendemia-web/docs/mia-gerente-consolidado.md`). La explicación para el dueño, con el ejemplo del
Polo negro, está en `prompt-bot-mia-gerente-consejos.md`, parte 3: esto es el contrato.

**La regla de siempre:** la cuenta la hace el código. El modelo dice la cantidad que le llega y la
explica con las piezas que le llegan; no suma, no resta, no redondea.

---

## 0 · Lo que ya está del lado de la web (24-oct-2026)

- **SQL** `vendemia-web/modules/datos/sql/0009_datos_de_compra.sql` (prueba `tests/pruebas_0009.sql`):
  - `catalogo_compras (catalog_id, company_id, dias_reposicion, cada_cuanto, por_caja)`: lo que
    tarda en llegar, cada cuánto compra y por cuántas viene la caja. Dueño y administrador.
  - `catalogo_costos (catalog_id, company_id, costo)`: solo el dueño (RLS).
  - `compras_srv_de(p_company) → [{ catalog_id, costo, dias_reposicion, cada_cuanto, por_caja }]`
    con la clave de servicio.
  - `costos_srv_subir(p_company, p_costos jsonb) → n`: sube `[{catalog_id, costo}]` sin pisar lo que
    el dueño ya puso en la web.
- **Panel**: en la ficha de cada producto con stock, el bloque «Para que Mia te diga cuánto pedir»
  (tarda en llegarte, compras cada, viene por caja de, y el costo solo para el dueño).

## 1 · El costo pasa a vivir en la nube

Hasta hoy el costo estaba solo en el SQLite (`catalog_costos`, `store.ts`, `npm run asistente --
costo`). A partir de ahora la fuente es `catalogo_costos` de Postgres, que el dueño edita en la ficha.

1. Al arrancar, una vez por negocio: `costos_srv_subir(company, [...filas de catalog_costos])`. No
   pisa lo que ya puso el dueño en la web.
2. Donde hoy se lee `catalog_costos` (`negocio.ts → productosEntre`, `contacto.ts` para el tope del
   descuento) se lee lo de la nube. Cómo bajarlo es decisión tuya: con `compras_srv_de` al pedirlo
   (una consulta, ~200 ms, aceptable en una pregunta del dueño) o con el mismo mecanismo de bajada de
   la v2 (`sync_version`). Lo que no puede pasar es que haya dos costos distintos para el mismo
   producto.
3. El comando de `npm run asistente -- costo` escribe en la nube (o se retira).

## 2 · La herramienta `que_comprar`

Para dueño y administrador (al administrador, sin el costo del pedido). Entrada opcional
`{ producto? }`: sin producto, todo lo que tiene stock; con producto, solo ese.

### Los datos, por producto con stock (`catalog.stock` no nulo)

| Pieza | De dónde |
|---|---|
| `vendido_28` | unidades vendidas en los últimos **28 días** (`productosEntre`, pedidos con ingreso) |
| `perdido_28` | unidades que pidieron y no había: eventos `STOCK_OUT` de 28 días, `pedida − disponible`, **la mayor por persona** (quien insiste tres veces no son tres ventas) |
| `al_dia` | `(vendido_28 + perdido_28) / 28` |
| `dias_reposicion` | `catalogo_compras`; si no hay, **7 y `supuesto = true`** |
| `cada_cuanto` | `catalogo_compras`; si no hay, **14 y `supuesto = true`** |
| `por_caja` | `catalogo_compras`; si no hay, sin redondeo |
| `stock` | `catalog.stock` (y por opción, `catalog_variantes.stock`) |
| `en_camino` | 0 por ahora (no hay dónde apuntar un pedido al proveedor); dilo así si preguntan |

### La cuenta

```
mientras_llega = al_dia × dias_reposicion
colchon        = mientras_llega × 0,5
aviso          = ceil(mientras_llega + colchon)            ← «cuando queden N, pide»
necesita       = al_dia × (dias_reposicion + cada_cuanto) + colchon − stock − en_camino
pedir          = max(0, ceil(necesita)); si por_caja → ceil(pedir / por_caja) × por_caja
dias_alcanza   = stock / al_dia
toca_pedir     = stock <= aviso
```

Con el ejemplo del Polo negro (24 vendidas en 28 días, tarda 7, compra cada 15, quedan 5, docena):
aviso 9, pedir 17, por caja 24. **Ese caso tiene que salir exacto en un test.**

⚠️ Con decimales, `24/28 × 7` puede dar 6,0000000001 y el `ceil` lo sube a 10. Multiplica antes de
dividir (`vendido × dias / 28`) o redondea a 6 decimales antes de cada `ceil`.

### Cuándo NO hay cantidad (y se dice por qué)

| Caso | Qué devuelve |
|---|---|
| `vendido_28 + perdido_28 < 4` | «vende poco: si lo repones, pide lo mínimo» |
| el producto tiene menos de 14 días en el catálogo | «es nuevo: todavía no hay ritmo» |
| `stock = 0` más de la mitad del periodo y sin `STOCK_OUT` | «estuvo agotado casi todo el mes: lo vendido se queda corto y no sé cuánto más se habría vendido» |

### Por talla o color

Si tiene opciones con stock (`catalog_variantes`): `pedir` se reparte según lo vendido de cada opción
en los 28 días (`orders.items[].variant`), por el método del mayor resto para que la suma sea
exacta, y cada opción dice su stock. Una opción con 0 vendidas y stock no recibe nada.

### Orden y tope

1. Primero los **imprescindibles**: los que suman el 80 % de las unidades vendidas en 28 días.
2. Dentro, `toca_pedir` antes, y entre ellos el que menos días alcanza.
3. Como mucho 5 en la respuesta; si hay más, «y N más: pregúntame por uno».

### La frase que recibe el modelo, por producto

```
Polo negro: quedan 5 · vendes unos 6 por semana (y 2 personas lo pidieron sin haber) · tarda 7 días
(supuesto) · compras cada 15 · alcanza para 6 días · PIDE 24 (17, redondeado a 2 docenas).
Por talla: M 10 · L 8 · S 4 · XL 2.  Costo del pedido: S/ 444.  Avisar cuando queden: 9.
```

- «(supuesto)» solo si lo es. Al final, si alguno lo es: «Supuse 7 días de entrega y compras cada
  15: si es distinto, ponlo en la ficha del producto y la cuenta cambia».
- «Costo del pedido» = `pedir × costo`, solo si hay costo y quien pregunta es el dueño.
- «Avisar cuando queden: N» es para que Mia **ofrezca** el aviso («¿quieres que te avise cuando
  queden 9?»). Si dice que sí, `poner_aviso` con ese N. No lo pone sola.

## 3 · El prompt

En COMPRAS Y AVISOS (consejos, parte 8), las líneas de `que_comprar` que estaban guardadas:

- Para «¿qué compro?», «¿cuánto pido de X?», «¿qué se me acaba?»: llama a `que_comprar`. Da la
  cantidad que trae, tal cual, y explícala en una línea con sus piezas (lo que queda, lo que vendes
  por semana, lo que tarda en llegar). Nunca la recalcules ni la redondees tú.
- Si trae «supuse…», dilo y di que se cambia en la ficha del producto.
- Si un producto no tiene cantidad (vende poco, es nuevo, estuvo agotado), di el motivo que trae.
- Al final, si cabe, ofrece el aviso con el número que trae. Solo si dicen que sí, `poner_aviso`.

La pregunta «¿Qué tengo que comprar esta semana?» ya le llega escrita al dueño cuando toca el aviso
de stock agrupado en el celular (`/panel/asistente?pregunta=…`): tiene que responderse con esta
herramienta.

## 4 · Lo que cambia en lo que ya existe

- `textoProductos`: «Se te acaba pronto» deja de comparar contra 14 días fijos y compara contra
  `dias_reposicion + colchón` de cada producto, con la misma función que `que_comprar`.
- `productosEntre` y el margen: el costo, de la nube (punto 1).

## 5 · Criterios de aceptación

- [ ] Test con el Polo negro: aviso 9, pedir 17, con docena 24. Con 2 personas que pidieron 2 sin
      haber, `al_dia` sube y la cantidad también.
- [ ] Sin datos en la ficha → «tarda 7 días (supuesto)» y la frase para cambiarlo.
- [ ] Un producto con 2 ventas en el mes → «vende poco», sin cantidad.
- [ ] Reparto por talla que suma exacto lo pedido.
- [ ] Como administrador: cantidades sí, «Costo del pedido» no, ni ninguna cifra de costo.
- [ ] El dueño cambia «tarda en llegarte» en la ficha y la siguiente respuesta ya usa el nuevo.
- [ ] Ningún número de la respuesta que no venga de la herramienta.
