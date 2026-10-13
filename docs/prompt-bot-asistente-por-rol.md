# Prompt para la sesión del bot: el asistente web, por rol

Pégalo tal cual. Decisión de Alvaro del 13-oct-2026, después de la auditoría del asistente
(`docs/prompt-bot-seguridad-cola-y-asistente.md`).

---

## Quién hay dentro de un negocio

Alvaro lo fijó así. Son tres personas del negocio, y aparte nosotros:

| | Quién es | En `memberships.role` hoy |
|---|---|---|
| **Dueño** | el dueño del negocio | `owner` |
| **Administrador** | lleva el día a día sin ser el dueño | `member` ⚠️ |
| **Empleado** | barbero, estilista, profesor (según el negocio) | `agent` |
| **Superadmin** | el equipo de Vendemia | no es un rol: `platform_admins` |

⚠️ `member → administrador` es una LECTURA, no un dato: `member` es lo que crea «Acceso del equipo»
en Ajustes, y hasta hoy esa persona lo veía todo. Está pendiente de que Alvaro la confirme. El panel
la tiene en UN sitio (`vendemia-web/lib/panel/roles.ts`); pon la tuya también en uno solo, con un
comentario que apunte al otro, para que si cambia, cambie en los dos.

## Qué cambia en `preguntar_asistente`

Hoy el handler hace `quien.role === 'owner' ? 'dueno' : 'admin'`: cualquier rol que no sea `owner`
entra como administrador. Un empleado (`agent`) también.

| Quién encola el comando | Hoy | Desde ahora |
|---|---|---|
| Dueño (`owner`) | responde, con importes | igual |
| Administrador (`member`) | responde, sin importes | igual |
| Empleado (`agent`) o cualquier rol que no conozcas | responde, sin importes | **rechazado** |
| Superadmin que además es miembro | según su membresía | igual |
| Quien no es miembro | rechazado | igual |

En el handler, justo después de comprobar la membresía y **antes** de mirar la caducidad, de
transcribir y de llamar al modelo:

- Si el rol no es dueño ni administrador:
  `throw new SinReintento('El asistente es para el dueño y el administrador del negocio.')`
- El texto, exacto: el panel enseña `commands.error` tal cual.
- Lista BLANCA, no negra: un rol nuevo que nadie haya clasificado se rechaza.
- Que el rechazo no cuente como consulta del día ni deje nada en `owner_messages`.
- Si la pregunta traía audio, bórralo del `payload` igual que en los demás caminos.

Lo que NO cambia: el reparto de herramientas (`veDinero` solo para el dueño), el canal de WhatsApp
(`owner_phone` / `admin_phone`) y el informe programado.

## Por qué tiene que estar en el bot

El panel ya lo esconde: la entrada «Asistente» del menú y la página no se pintan para el empleado
(`puedeUsarAsistente` en `vendemia-web/lib/panel/asistente.ts`). Pero eso es el navegador. Un
empleado con sesión puede insertar el comando por REST sin abrir esa página, y hoy el bot le
contestaría como a un administrador.

## Lo que viene detrás (no lo hagas ahora)

Esto es solo el asistente. El resto del panel no distingue hoy entre administrador y empleado: el
RLS es `is_member` en todas las tablas y solo `add_member` y este handler miran el rol. Alvaro va a
definir qué ve cada uno; cuando lo haga llegará otro prompt. Dos cosas que ya se sabe que harán
falta, por si quieres ir pensándolas:

- Un empleado con sesión no está enlazado a su fila de `employees`: sin eso no existe «su agenda»
  ni «su comisión».
- `add_member` da hoy `member` o `agent`. Quién puede dar de alta a quién también es parte de eso.

## Criterios de aceptación

- [ ] Dueño pregunta → responde con importes, como hoy.
- [ ] Administrador (`member`) pregunta → responde sin ningún «S/», como hoy.
- [ ] Empleado (`agent`) pregunta, insertando el comando a mano → la fila acaba en `error` con
      «El asistente es para el dueño y el administrador del negocio.», sin llamada al modelo ni
      transcripción.
- [ ] Una membresía con un rol inventado (`'x'`) → el mismo rechazo.
- [ ] Tras un rechazo, `consultasHoy` no subió.
