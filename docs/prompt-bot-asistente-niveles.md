# Prompt para la sesión del bot: el asistente nombra los niveles como niveles

Pégalo tal cual. Sale de una respuesta real del asistente en Kallpa (14-oct-2026).

---

## Qué pasó

El dueño leyó esto:

> Lo que pierdes cada mes: 168 personas querían **Pollito** y no había cupo. […]
> 1. **Duplica Pollito**: es 199 personas interesadas vs. 29 en **Tiburón**. […]
> Horario que sugiero: **Pollito tarde** (4–5pm o 5–6pm L-M-V) o **Pollito sábado mañana**.

«Pollito» y «Tiburón» son **niveles** de la academia. Escritos sueltos no se entiende qué son: «duplica
Pollito» suena a cualquier cosa, y a quien no conoce el negocio (un administrador nuevo) no le dice
nada. Alvaro lo quiere así: **«el nivel Pollito»**, nunca «Pollito» a secas.

## De dónde sale

El modelo repite lo que le dan los datos, y los datos le dan el nombre pelado:

- `datos.ts` (`demandaPerdida`): `Quisieron hora para "Pollito" y estaba lleno: N personas.`
  En una academia, además, nadie pide «hora»: pide plaza en un grupo.
- `negocio.ts` (cupos por grupo): cada bloque empieza por `${it.name}:`.
- Probablemente más: cualquier sitio que pinte `catalog.name` para el modelo.

## Lo que hay que cambiar

1. **En los datos, el nombre con su tipo.** Cada vez que una tool o la foto del negocio nombre un
   ítem del catálogo, que vaya con lo que es, según el modo:

   | `business_mode` | Cómo se escribe |
   |---|---|
   | `recurring_appointment` | `el nivel "Pollito"`, y un grupo: `el grupo de Mañanas L-M-V del nivel "Pollito"` |
   | `appointment` | `el servicio "Corte clásico"` |
   | `ecommerce` | `el producto "Polo negro"` |

   Hazlo en UNA función (p. ej. `nombreDeItem(item, mode)`) y no frase por frase.

2. **La frase de la demanda perdida, por modo.** En una academia: «Quisieron inscribirse en el nivel
   "Pollito" y estaba lleno: N personas». «Quisieron hora» queda para los negocios de citas.

3. **Una regla en el prompt del asistente** (`prompt.ts`), por si el modelo resume por su cuenta:
   «Nunca escribas el nombre de un nivel, servicio o producto suelto: di "el nivel Pollito", "el
   servicio Corte clásico". En una academia, un horario se nombra con su nivel: "el grupo de 7 a 8
   del nivel Pollito"».

   Con la regla sola no basta: si el dato llega pelado, el modelo lo copia pelado. Por eso el 1 va
   primero.

## Revisa también esto, de la misma respuesta

Dice «Lo que pierdes **cada mes**: 168 personas». Comprueba de qué periodo salía ese 168
(`demandaPerdida` se llama con 7 días en la foto y con el periodo pedido en `resumen_periodo`). Si
no era un mes, el modelo convirtió un periodo en «cada mes», que es justo lo que prohíben las
reglas 3 y 4b del prompt. Si es eso, que la línea de datos diga su periodo dentro de la frase
(«en los últimos 7 días, …»), para que no se pierda al resumir.

## Criterios de aceptación

- [ ] En Kallpa, «¿qué me piden más?» → la respuesta dice «el nivel Pollito», no «Pollito».
- [ ] Ninguna salida de las tools ni de la foto del negocio nombra un ítem del catálogo sin su tipo.
- [ ] En una barbería sigue diciendo «el servicio …»; en una tienda, «el producto …».
- [ ] La demanda perdida de una academia habla de inscribirse en un nivel, no de «hora».
- [ ] Las cifras de demanda perdida llevan su periodo dentro de la frase.
