# Plan · Qué ve y qué hace cada persona de un negocio

> **Retomado el 13-oct-2026.** Alvaro contestó todas las decisiones abiertas; están en «Lo decidido».
> El corte va **una semana después** de que los dueños vean el aviso (ver «La transición»). El prompt
> para el bot es `docs/prompt-bot-roles.md`.

## El problema

Hoy el panel casi no distingue quién entra. Cualquier persona dada de alta en un negocio ve la
caja, las comisiones de todos y las métricas, y puede cambiar precios y métodos de pago. Solo dos
cosas van por rol: el Asistente (dueño y administrador) y el Acceso del equipo (dueño).

No es un fallo del menú. Son tres capas, y las tres dicen «si eres del negocio, pasa»:

| Capa | Qué comprueba hoy |
|---|---|
| El menú y las pantallas | el rol, solo en Asistente y Acceso del equipo |
| La base (RLS) | `is_member(company_id)` en las 24 tablas; ninguna mira el rol |
| El bot (comandos) | el rol en 4 de 27 comandos: el asistente y los tres del equipo |

Por eso esconder pantallas no arregla nada: quien tiene sesión puede leer la tabla directamente.

## Quién hay

| | Quién es | `memberships.role` |
|---|---|---|
| **Dueño** | el dueño del negocio. Uno por negocio, siempre | `owner` |
| **Administrador** | lleva el día a día sin ser el dueño | `admin` |
| **Empleado** | barbero, estilista, profesor (según el negocio) | `member` (y `agent`, antiguo) |
| **Superadmin** | el equipo de Vendemia | aparte: `platform_admins` |

## Lo decidido (Alvaro, 13-oct-2026)

**El administrador**
- **Dinero:** lleva la caja —apunta ingresos y gastos— y ve las comisiones **en solo lectura**. No ve
  métricas de ingresos ni ganancia.
- **Equipo:** da de alta y de baja **solo a empleados**. Nombrar o quitar administradores, solo el dueño.
- **Métodos de pago y teléfonos del negocio:** no los cambia. Solo el dueño.

**El empleado**
- **Agenda:** sus citas, y las que no tienen a nadie asignado. Una cita o una clase sin empleado la
  ven TODOS los empleados, marcada como «Sin asignar», hasta que se asigne.
- **Clientes:** de los clientes de sus citas ve el nombre, las notas del salón, las notas de Mia y
  los campos propios del negocio (edad, etc.). **Nada de contacto:** ni teléfono, ni WhatsApp, ni
  correo, ni dirección. **No entra al chat.**
- **Cobrar:** no. Marca «vino / no vino» en sus citas; el cobro lo apunta la caja.
- **Academia:** es la misma regla, no una aparte. Hoy los grupos no tienen profesor asignado, así
  que todos salen como «Sin asignar» y los ven todos los profesores —horarios, cupos, alumnos—, sin
  importes. El día que se puedan asignar, cada profesor verá los suyos y los que sigan sin dueño.

**La transición:** el dueño clasifica a su gente antes de la fecha. Quien quede sin marcar, empleado.

## Qué ve cada uno

Las celdas con ° no las decidió Alvaro: llevan mi valor por defecto y están listadas abajo.

| | Empleado | Administrador | Dueño |
|---|---|---|---|
| Agenda / clases | las suyas y las «Sin asignar» | todas | todas |
| Marcar «vino / no vino» | en las suyas y en las «Sin asignar» ° | sí | sí |
| Crear, mover y cancelar citas | no | sí | sí |
| Clientes | los de las citas que ve, sin contacto | todos | todos |
| Mensajes (chat), retargeting, escalaciones | no | sí | sí |
| Caja: ver, cobrar, apuntar gastos | no | sí | sí |
| Comisiones | solo la suya ° | todas, solo lectura | todas, y fijar el % |
| Métricas, ingresos y ganancia | no | no | sí |
| Catálogo y precios | ver ° | editar ° | editar |
| Fichas del equipo, horarios, ausencias | su ficha, sin tocarla ° | editar, menos el % de comisión | editar |
| Ajustes de Mia y horario del negocio | no | sí ° | sí |
| Métodos de pago y teléfonos del negocio | no | no | sí |
| Dar acceso y quitarlo | no | solo a empleados | a cualquiera menos al dueño |
| Nombrar o quitar administradores | no | no | sí |
| Asistente | no | sí, sin importes | sí |
| Plan, consumo y recargas | no | ver ° | ver y comprar |
| Avisos al celular | no ° | sí ° | sí |
| Fideliza | cajero ° | encargado ° | todo |

**Mis valores por defecto (°). Si alguno no te cuadra, dilo y se cambia antes de construir:**
- El empleado ve su propia comisión, y solo la suya.
- El empleado marca «vino / no vino» también en las citas «Sin asignar»: en una academia son todas,
  y pasar lista es justo lo que hace el profesor. Asignárselas a sí mismo, no: asigna el
  administrador o el dueño.
- El empleado ve el catálogo con precios, sin el coste ni la comisión de cada servicio.
- El administrador edita catálogo, precios, los ajustes de Mia y el horario del negocio.
- «Solo lectura» en comisiones incluye que el administrador **no cambia el porcentaje** de nadie.
- Fideliza: el administrador entra como encargado; el empleado, como cajero (ya es así).
- Avisos al celular: solo dueño y administrador.

## Lo que hay que construir que hoy no existe

1. **El enlace empleado ↔ usuario.** Un barbero con sesión no está unido a su ficha de `employees`.
   Sin eso no hay «sus citas» ni «su comisión». Va en `memberships.employee_id`, y se elige al dar
   acceso a un empleado.
2. **Una matriz de permisos en la base**, en un solo sitio, como la de Fideliza (`loyalty_role_can`).
3. **La misma matriz en el bot**, para los comandos: cada tipo, quién lo puede encolar.
4. **Una vista de clientes sin contacto** para el empleado. El RLS filtra filas, no columnas: sin
   esto, quien lee una fila de `leads` se lleva el teléfono.
5. **Las pantallas del empleado:** «Mi agenda» y «Mi comisión».

## Fases

Cada una se puede desplegar sola. Las dos primeras no le cambian nada a nadie.

**Fase 1 · Cimientos.** Nadie nota nada.
- Bot y base: `memberships.employee_id`, las funciones de permisos, la vista de clientes sin
  contacto, y la tabla «comando → quién puede» en modo aviso (apunta lo que rechazaría, no rechaza).
- Panel: `useSesion()` expone el rol; al dar acceso a un empleado se elige su ficha.

**Fase 2 · El administrador gana lo suyo.** Solo añade.
- Bot: el administrador puede dar acceso y quitárselo a empleados, y ve el equipo.
- Panel: «Acceso del equipo» visible para el administrador, con botones solo en los empleados.
- Fideliza: el administrador pasa a encargado por defecto.

**Fase 3 · El dueño clasifica.** Ver «La transición».

**Fase 4 · El corte.** Este es el día que se nota.
- Base: las políticas pasan de «es miembro» a «puede». Bot: la tabla de comandos empieza a rechazar.
- Panel: el menú y las pantallas por permiso; «Mi agenda» y «Mi comisión» para el empleado; métodos
  de pago y porcentajes de comisión, solo para el dueño.

**Fase 5 · Alta por invitación.** Sustituye la contraseña temporal por el enlace acordado el
7-oct-2026. Es también la vía para los negocios que solo tienen Fideliza, que no tienen bot.

## La transición

Los `member` de hoy son empleados y lo ven todo. El día del corte dejan de ver la caja, las
métricas y los ajustes. Para que nadie se quede sin poder trabajar:

1. Desde la fase 3, el dueño ve en «Acceso del equipo» un aviso: qué va a cambiar, cuándo, y su
   lista de gente para marcar a cada uno como empleado o administrador, y a cada empleado su ficha.
2. Le avisamos también fuera del panel (lo mandas tú).
3. El día del corte, quien siga como `member` es empleado. Un empleado sin ficha ve solo las citas
   «Sin asignar».

**El corte va una semana después de que el aviso de la fase 3 esté en producción** (Alvaro,
13-oct-2026). El aviso está construido y anuncia el **21 de octubre de 2026**: da la semana si llega
a producción el 13 o el 14. La fecha es `CORTE_DE_ROLES` en `lib/panel/roles.ts`; si el despliegue se
retrasa, hay que moverla.

El aviso sale en dos sitios: una píldora en la barra de arriba de todo el panel, solo para el dueño
que tiene a alguien más en el negocio (se puede cerrar), y el texto completo en «Acceso del equipo»,
para el dueño y el administrador. Llegar la fecha no hace nada por sí solo: el corte se despliega a
mano, y entonces el aviso se quita.

Antes de la fase 3, contar a cuánta gente afecta:
`select role, count(*) from memberships group by role;`

## El día del corte (21 de octubre de 2026)

**Antes del día, ya:** aplicar la `0043` del bot (le da al empleado las comisiones por servicio en
`catalogo_del_equipo`; no le quita nada a nadie).

El día, en este orden (el porqué, en `docs/prompt-bot-roles-fase4.md`; lo confirmó el bot el
14-oct-2026):

1. Alvaro pone `NEXT_PUBLIC_ROLES_EN_VIGOR=1` en Vercel y redespliega. El panel pasa a repartir por
   rol y el aviso se quita solo.
2. Se aplica `0044_roles_corte.sql` (repo del bot). Se niega a entrar antes del 21.
3. Se aplica `modules/avisos/sql/0002_avisos_por_rol.sql` (este repo): los avisos al celular, solo
   al dueño y al administrador. Sin ella, un empleado que activó los avisos antes del corte sigue
   recibiendo pagos con importe y el nombre o teléfono del cliente. También se niega antes del 21.
4. En el `.env` de cada bot, `ROLES_MODO=corte`, y se reinicia cada uno.
5. `npm run smoke:equipo` (repo del bot) comprueba con sesiones de verdad lo que lee cada rol.

Si algo sale mal, se deshace en el orden contrario: quitar `ROLES_MODO=corte` de los bots,
`0002_avisos_por_rol_deshacer.sql`, `supabase/deshacer/0044_roles_corte_deshacer.sql` (bot), y quitar
la variable del panel y redesplegar.

Lo que dijo el bot y conviene saber:

- El empleado **sí** puede leer `catalog` (no hay nada que esconderle desde la 0043). La pantalla de
  Catálogo sigue cerrada para él porque es la de editar.
- Lo que no le toca al empleado le devuelve **cero filas, sin error**; lo mismo al administrador con
  las vistas y RPC de métricas. Repasado el 14-oct: solo las leen el Dashboard y Métricas, que el
  administrador no tiene.
- Un empleado **sin ficha enlazada** solo ve las citas «sin asignar». En cuanto una se le asigna a
  otro, deja de verla.

### Lo que ya hace el panel con el interruptor encendido

- El menú, las pestañas y una guardia por pantalla, los tres desde la misma tabla
  (`lib/panel/rutas.ts`). Quien entra por la URL a una pantalla que no es suya ve «no es para tu
  rol», con el camino a lo suyo.
- Cada uno entra por su portada: el dueño, el Dashboard; el administrador, la Agenda (o Pedidos en
  una tienda); el empleado, Mi agenda.
- «Mi agenda» (`app/(panel)/panel/mi-agenda`): sus citas y las «Sin asignar», las notas del
  cliente sin contacto, y «vino / no vino». En una academia, los grupos con sus alumnos.
- «Mi comisión» (`app/(panel)/panel/mi-comision`), con el mismo cálculo que el dueño.
- El empleado ya no depende de `companies`: el nombre y el tipo de negocio le llegan por
  `mi_negocio`.

- Lo que solo cambia el dueño (métodos de pago, teléfonos, % de comisión en Empleados y Catálogo) le
  sale en solo lectura al administrador (`soloLeeLoDelDueno` en `lib/panel/roles.ts`).
- El empleado tiene «Catálogo» (`app/(panel)/panel/mi-catalogo`): precios y duración, sin editar.

### Lo que falta antes del 21

- **Aplicar la `0043` del bot.** El panel no tiene credencial de base para hacerlo él.
- **Probarlo todo con cuentas reales** de los tres roles. Hasta ahora, solo con Supabase simulado;
  el día del corte lo cubre `npm run smoke:equipo` del bot.

## Qué toca cada fase en este repo

| Fase | Dónde | Qué |
|---|---|---|
| 1 | `components/panel/Sesion.tsx` | exponer `rol` además de `esDueno` |
| 1 | `components/panel/Equipo.tsx` | elegir la ficha al dar acceso a un empleado |
| 2 | `components/panel/Equipo.tsx`, Ajustes | la sección para el administrador, con botones solo en empleados |
| 2 | `modules/fideliza/sql` | `loyalty_role`: administrador → encargado por defecto |
| 3 | `components/panel/Equipo.tsx`, `Topbar.tsx`, `lib/panel/roles.ts` | el aviso de clasificación, con la fecha. **Hecho** |
| 4 | `components/panel/Sidebar.tsx`, `Topbar.tsx`, `lib/panel/rutas.ts`, `app/(panel)/layout.tsx` | el menú y la guardia por permiso. **Hecho, detrás del interruptor** |
| 4 | `app/(panel)/panel/*` | «no es para ti» donde hoy saldría una tabla vacía |
| 4 | `mi-agenda`, `mi-comision` | las dos pantallas del empleado. **Hecho, detrás del interruptor** |
| 4 | `configuracion`, `equipo` | métodos de pago, teléfonos y % de comisión: solo el dueño |
| 4 | `app/api/cloudinary/firma` | subir fotos de catálogo y marca: administrador o dueño |
| 4 | `modules/avisos/sql` | suscribirse a los avisos: administrador o dueño |

## Lo que queda fuera

- **Asignar clases a un profesor** en las academias. Hasta entonces todas salen «Sin asignar» y las
  ven todos.
- **Decidir qué campos propios ve el empleado.** Hoy vería todos los de `custom_data`; si un negocio
  guarda ahí un correo o un teléfono de contacto, se le colaría. Ver el §4 del prompt del bot.
- **Traspasar un negocio a otro dueño.** Sigue siendo una operación nuestra, a mano.
