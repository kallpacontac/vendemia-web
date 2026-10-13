# Prompt para la sesión del bot: `member` es un empleado, no un administrador

Pégalo tal cual. Corrige `docs/prompt-bot-asistente-por-rol.md` (13-oct-2026), que ya aplicaste.

---

## Qué estaba mal

Aquel prompt decía `member → administrador` y lo marcaba como «una LECTURA, pendiente de que Alvaro
la confirme». Alvaro la ha contestado, y es al revés: **quien se da de alta en «Acceso del equipo»
es un empleado** (el barbero, la estilista, el profesor). No había ningún sitio donde dijera que era
administrador; se supuso porque esa persona hoy lo ve todo en el panel.

Consecuencia: hoy un empleado puede preguntarle a Mia por el negocio (sin importes), que es justo
lo que no se quería.

## La tabla buena

| Persona | `memberships.role` | En el asistente |
|---|---|---|
| Dueño | `owner` | entra, con importes |
| Administrador | `admin` ⚠️ valor nuevo | entra, sin importes |
| Empleado | `member`, `agent` y cualquier otro | **no entra** |

⚠️ `admin` no lo crea nadie todavía. Hasta que exista el alta, en la práctica el asistente es solo
del dueño. Es lo correcto: mejor que no entre nadie a que entre quien no debe.

## Lo que hay que cambiar

1. `ROL_DE_MEMBRESIA` en `src/services/owner/operadores.ts`: `{ owner: 'dueno', admin: 'admin' }`.
   `member` sale de la tabla; al ser lista blanca, queda fuera solo.
2. El comentario de encima, que explica `member → admin`: ya no es una lectura pendiente.
3. `add_member` (`ROLES_DE_ALTA` en `src/utils/cola-segura.ts`): añadir `admin`. Lo puede dar SOLO
   el dueño, que es quien hoy puede usar `add_member`, así que no hay que tocar el permiso.
   `owner` sigue sin poder darse por la cola.
4. `docs/prompt-panel-asistente.md`, el párrafo **Rol**: `member` pasa a la lista de los que no
   entran; `admin` es el que recibe las respuestas sin cifras.
5. El tope de 20 consultas al día «para quien no es `owner`» ahora solo aplica al administrador.

No cambia: el texto del rechazo, el reparto de herramientas, ni `0038`/`0039`.

## El panel ya está

`vendemia-web/lib/panel/roles.ts` (`rolDeNegocio`) ya dice esto mismo, y la entrada del menú y la
página no se pintan para `member`. Lo que falta en el panel depende de ti: cuando `add_member`
acepte `admin`, «Acceso del equipo» dejará elegir entre empleado y administrador. Avisa cuando esté.

## Criterios de aceptación

- [ ] `member` pregunta, insertando el comando a mano → `error` con «El asistente es para el dueño
      y el administrador del negocio.», sin llamada al modelo ni transcripción.
- [ ] Una membresía con `role = 'admin'` pregunta → responde sin ningún «S/».
- [ ] `owner` → responde con importes, como hoy.
- [ ] `add_member` del dueño con `role: 'admin'` → crea la membresía con ese rol.
- [ ] `add_member` con `role: 'owner'` → sigue rechazado.
