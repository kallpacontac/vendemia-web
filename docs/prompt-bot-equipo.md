# Prompt para la sesión del bot: el equipo de un negocio (ver, cambiar de rol, dar de baja)

Pégalo tal cual. Sale de la auditoría del bot del 13-oct-2026 y de las reglas que fijó Alvaro ese
mismo día.

---

## Qué falta

Hoy el dueño puede dar acceso a alguien (`add_member`) y nada más:

- **No puede quitarlo.** No hay comando de baja: un empleado que se va conserva su acceso al panel.
- **No puede cambiarle el rol.** Si da de alta como administrador a quien ya era empleado,
  `add_member` no toca la membresía y devuelve el rol que tenía.
- **No ve quién tiene acceso.** `p_memberships_read` solo deja leer la fila propia: el panel le
  enseña un número («3 personas tienen acceso»), sin nombres ni roles.

## Las reglas (Alvaro, 13-oct-2026)

1. **Un negocio tiene UN dueño. Ni cero, ni dos.**
2. **Al dueño no se le da de baja ni se le cambia el rol.** A los demás, sí.
3. **Al dar acceso hay que decir el rol.** No hay rol por defecto.
4. Por la cola no se crea un dueño (ya es así: `rolDeAlta`).

Quién puede hacer todo esto: **solo el dueño**. Lo de que el administrador dé de alta empleados
está en espera con el resto del plan de roles (`vendemia-web/docs/PLAN-ROLES.md`, D3).

## 1 · Un solo dueño, de verdad

Antes de tocar nada, mira cómo está producción y díselo a Alvaro:

```sql
select company_id, count(*) filter (where role = 'owner') as duenos
  from public.memberships group by company_id
 having count(*) filter (where role = 'owner') <> 1;
```

Si no devuelve filas, un índice único parcial en SQLite y en Postgres:
`unique (company_id) where role = 'owner'`. Si devuelve alguna, no lo crees: enséñale la lista y que
decida negocio por negocio.

Dos sitios más que pueden crear un segundo dueño y hay que cerrar:

- `POST /api/companies/:id/members` acepta `role: 'owner'` (`z.enum(['owner', 'agent'])` en
  `src/api/routes/index.ts`).
- `npm run membership`: que avise si el negocio ya tiene dueño en vez de añadir otro.

Cambiar de dueño (traspasar un negocio) no entra aquí: es una operación nuestra, a mano.

⚠️ Ojo con una cosa que no es tuya: los negocios que nacen por Fideliza
(`loyalty_business_create`, en `vendemia-web/modules/fideliza/sql`) insertan su membresía de dueño
directamente en Postgres, sin pasar por SQLite. El índice de Postgres también les aplica, y está
bien; pero no asumas que toda membresía existe en tu base.

## 2 · `add_member`: el rol es obligatorio

- Sin `role` en el payload → `SinReintento('Hay que decir con qué rol entra.')`. Hoy cae en
  `'member'`.
- Roles que se pueden dar: `member` (empleado) y `admin` (administrador). `agent` puede seguir
  aceptándose, pero el panel no lo manda.
- Si la persona ya es del negocio, igual que hoy: no se toca y vuelve `ya_era_miembro: true` con el
  rol que TIENE. Para cambiarlo está el comando del §4.

El panel ya manda siempre el rol, elegido a mano.

## 3 · Ver el equipo

Una función en Postgres, no un comando: es una lectura, y tiene que funcionar con el bot apagado.

```sql
public.equipo_listar(p_company text) returns jsonb   -- security definer, search_path fijo
-- [{ "auth_user_id": "...", "email": "...", "role": "owner|admin|member|agent",
--    "desde": "2026-10-13T…", "eres_tu": true|false }]
```

- **Solo el dueño de ESE negocio** (o un admin de plataforma). A cualquier otro, `[]`: sin error,
  para que el panel no tenga que distinguir.
- El correo sale de `auth.users`; por eso es `security definer` y no una política.
- Ordenado: el dueño primero, luego por correo.
- `grant execute … to authenticated` y nada a `anon`.

Fideliza ya tiene una parecida (`loyalty_team_list`, en
`vendemia-web/modules/fideliza/sql/0003_operaciones.sql`): mismo `join` con `auth.users`. No la
reutilices tal cual —exige un permiso de Fideliza y devuelve SUS roles—, pero el patrón es ese.

## 4 · Cambiar el rol

Comando `cambiar_rol_miembro`, payload `{ user_id, role }`.

| Caso | Qué pasa |
|---|---|
| Quien encola no es el dueño | `Solo el dueño puede cambiar el rol de otra persona.` |
| `user_id` no es de este negocio | `Esa persona no tiene acceso a este negocio.` |
| El objetivo es el dueño (él mismo incluido) | `Al dueño del negocio no se le cambia el rol.` |
| `role` no es `member` ni `admin` | `Ese rol no se puede dar desde el panel.` |
| Ya tenía ese rol | no falla: `cambio: false` |

Resultado: `{ user_id, email, antes, ahora, cambio }`. Todos los rechazos, `SinReintento`.

## 5 · Dar de baja

Comando `quitar_miembro`, payload `{ user_id }`.

| Caso | Qué pasa |
|---|---|
| Quien encola no es el dueño | `Solo el dueño puede quitarle el acceso a alguien.` |
| El objetivo es el dueño (él mismo incluido) | `Al dueño del negocio no se le puede dar de baja.` |
| `user_id` no es de este negocio | no falla: `quitado: false` (reintentar es seguro) |

Resultado: `{ user_id, email, quitado }`.

Qué se borra y qué no:

- **Sí:** la membresía de ESE negocio.
- **No:** la cuenta de Supabase. Puede ser de otro negocio, y si no lo es, queda sin acceso a nada.
- **No hace falta** cerrarle la sesión: en cuanto la fila desaparece de Postgres, `is_member` da
  falso y todas sus lecturas vuelven vacías, aunque siga con el panel abierto.

⚠️ Lo que hay que comprobar, porque de ello depende todo: que el borrado **llega a Postgres**. El
RLS mira la copia de allí. Si el espejo no propagara ese `DELETE`, la baja quedaría hecha en SQLite
y la persona seguiría entrando. He visto que el espejo borra (`mirror.service.ts`, la rama
`.delete().match(pk)`), pero no lo he probado con `memberships`.

Y el `DELETE /api/companies/:id/members/:userId` que ya existe tiene que cumplir las mismas reglas.
Hoy no las cumple: `removeMember` comprueba que quien llama es dueño y borra a quien le digan, él
mismo incluido. Con eso un negocio se queda sin dueño.

## 6 · Lo de siempre

- Los dos comandos nuevos NO van en la lista blanca del log si su resultado lleva el correo:
  decídelo tú, pero que conste.
- Añádelos a `docs/integracion-panel.md` y déjame un prompt para el panel con los nombres y las
  formas finales. Si cambias algo de lo de arriba (nombres, mensajes, forma del resultado), dilo
  ahí: el panel se construye contra lo que tú digas, no contra este texto.

## Criterios de aceptación

- [ ] La consulta del §1 no devuelve filas, y un segundo `owner` en el mismo negocio lo rechaza la
      base (SQLite y Postgres).
- [ ] `add_member` sin `role` → error. Con `role: 'owner'` → error, como hoy.
- [ ] `equipo_listar` como dueño → todos, con correo y rol. Como empleado o administrador → `[]`.
      Sobre un negocio ajeno → `[]`.
- [ ] `cambiar_rol_miembro` de empleado a administrador → la persona entra al asistente; de vuelta
      a empleado → deja de entrar.
- [ ] `cambiar_rol_miembro` sobre el dueño, encolado por el propio dueño → rechazado.
- [ ] `quitar_miembro` sobre el dueño → rechazado. Sobre un empleado → `quitado: true`.
- [ ] Tras esa baja, con la sesión del empleado todavía abierta: `select` en `leads`, `gastos` y
      `commands` → cero filas, en segundos. **Probado contra Postgres, no solo contra SQLite.**
- [ ] `quitar_miembro` dos veces seguidas → la segunda, `quitado: false`, sin error.
- [ ] Un empleado o un administrador encolando cualquiera de los dos comandos → rechazado.
- [ ] El `DELETE` del API no puede borrar al dueño.

## Lo que hará el panel cuando esto esté

En Ajustes › «Acceso del equipo»: la lista de quién tiene acceso, con su rol; cambiar entre empleado
y administrador; y «Quitar acceso», con confirmación. El dueño sale el primero, sin botones.
