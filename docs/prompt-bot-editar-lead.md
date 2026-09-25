# Prompt para la sesión del bot: editar los datos de un cliente (y un fallo en los gastos)

Pégalo tal cual. Viene de lo que pidió el dueño el 25-sep-2026: *«permíteme modificar los datos del
lead»*.

**El panel ya está hecho** (Mensajes → panel derecho → «Editar»). Encola `actualizar_lead` con **solo
lo que cambió**. Hoy el bot solo guarda `notas_salon`, y el panel lo detecta y avisa: *«No se
guardó: nombre, correo… El bot todavía no admite editar esos datos»*.

> Revisado el 25-sep-2026 leyendo `commands.service.ts` en la rama `feat/media-productos`.

---

## 1 · `actualizar_lead` con más campos

### El payload que ya manda el panel

```ts
actualizar_lead {
  lead_id,                       // obligatorio
  name?:             string,     // '' = borrar el nombre
  customer_email?:   string,     // el panel ya valida la forma
  customer_address?: string,
  custom_data?:      Record<string, string>,   // el objeto ENTERO, con los valores editados
  notas_salon?:      string,
}
```

Solo vienen las claves que cambiaron. **Una clave ausente no se toca**; una presente con `''`
significa «vaciar».

### Lo que hace falta

- **`notas_salon` deja de ser obligatorio.** Hoy el handler lanza si no viene
  (`payload.notas_salon requerido`), así que editar solo el nombre fallaría.
- Aplicar los campos presentes con `db.updateLead` (ya filtra por `leadDeLaCompania`, que sigue siendo
  la reja).
- **`custom_data`: fusionar, no reemplazar.** El panel solo deja editar los VALORES de las claves que
  ya existen, pero entre que el dueño abre el editor y guarda, Mia puede haber añadido una clave
  nueva. Mezcla: `{ ...actual, ...payload.custom_data }`, con los valores pasados a string.
- Limpiar y acotar: `trim()`, `name` ≤ 120, `customer_email` ≤ 200 (y rechazar si no parece un
  correo: `payload.customer_email inválido`), `customer_address` ≤ 300, `notas_salon` ≤ 4000.
- **Devolver `{ lead_id, actualizados: string[] }`** con los campos que realmente se escribieron. El
  panel usa esa lista para no decir «guardado» de algo que no se guardó; sin ella asume un bot viejo
  que solo guarda `notas_salon`.
- Campos desconocidos en el payload (`phone`, `status`, `bot_active`…): ignorarlos, no lanzar. Pero
  **nunca** escribirlos: el teléfono es la identidad en WhatsApp, y el estado lo reescribe el bot en
  cada turno.

### Lo que conviene decidir: que Mia no pise lo que corrigió una persona

`save_customer_info` escribe `name` (y `custom_data`) cuando el cliente los dice en la conversación.
Si el dueño corrige el nombre a «Martina Reyes» y luego el cliente escribe «soy Marti», el bot lo
sobrescribe. Opciones:

1. Aceptarlo: lo último que dijo el cliente manda.
2. Que lo editado a mano gane: guardar qué campos tocó el panel (p. ej. `leads.editado_por_panel`,
   JSON con los nombres de los campos) y que `save_customer_info` no los pise.

Yo haría la 2 solo para `name`, que es el que se ve en todas las pantallas. Si prefieres la 1, déjalo
escrito en el comentario del handler.

### Y que Mia lea las notas del negocio

`notas_salon` («alérgica al amoniaco», «prefiere a Marco») es justo lo que Mia debería saber antes de
contestar. Hoy no entra en el prompt. Meterla en el bloque volátil del turno, con una línea que diga
que es información interna del negocio y **no se le repite al cliente**, es poco trabajo y cambia
cómo atiende.

---

## 2 · Un fallo que rompe los gastos: la fecha nunca valida

En `upsert_gasto`:

```ts
if (!/^d{4}-d{2}-d{2}$/.test(fecha)) throw new Error("payload.gasto.fecha requerido con formato 'YYYY-MM-DD'")
```

Faltan las barras invertidas: `d{4}` busca la letra «d» cuatro veces, no cuatro dígitos. **Rechaza
cualquier fecha real**, así que no se puede apuntar ni un solo gasto. Debe ser:

```ts
/^\d{4}-\d{2}-\d{2}$/
```

Busca el mismo patrón en el resto del fichero; si se escribió así una vez, puede que haya más.

---

## Cómo comprobarlo

1. Desde el panel, cambia solo el nombre de un cliente: el comando devuelve
   `actualizados: ['name']` y el nombre aparece en la bandeja tras el espejo.
2. Cambia solo las notas: sigue funcionando como hoy, y ahora devuelve `actualizados: ['notas_salon']`.
3. Edita un valor de `custom_data` mientras en otra pestaña el cliente le da a Mia un dato nuevo
   (otra clave): se conservan los dos.
4. Encola a mano `{ lead_id, phone: '51999999999' }`: el teléfono no cambia, y `actualizados` sale
   vacío.
5. `upsert_gasto` con `fecha: '2026-09-25'` se guarda; con `fecha: '25/09/2026'` falla con el
   mensaje de formato.
