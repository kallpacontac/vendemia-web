# Seguridad del panel

Quién puede ver qué, y dónde se decide. Léelo antes de tocar `lib/supabase/` o
la guardia de `app/(panel)/layout.tsx`.

---

## La idea, en una frase

> **El front no protege nada. La frontera es el RLS de Postgres.**

Todo el panel corre en el navegador y habla con Supabase con la clave `anon` más
la sesión del usuario. Cualquiera puede abrir la consola del navegador y llamar
a `supabase.from('leads').select('*')` a mano, sin pasar por ninguna de nuestras
pantallas. Que no vea los datos de otro negocio **no depende de nuestro código**:
depende de que las políticas de Postgres estén bien puestas.

Por eso este documento tiene dos mitades. La primera —lo que hace el front— es
comodidad y prevención de errores. La segunda —lo que hay que comprobar en
Supabase— es la seguridad de verdad.

---

## 1 · Lo que hace el front (comodidad, no barrera)

| Control | Dónde | Qué evita |
|---|---|---|
| Guardia de sesión | `app/(panel)/layout.tsx` | Que el panel se pinte sin sesión. Redirige a `/login`. |
| Compañía activa validada | `components/panel/Sesion.tsx` | Que un `localStorage` manipulado, o una llamada desde la consola, ponga como activa una compañía que no está en `memberships`. |
| `?lead=` validado | `app/(panel)/panel/mensajes/page.tsx` | Que un id de lead puesto a mano en la URL abra una conversación. Solo se acepta si está en los leads ya cargados de la compañía activa. |
| Datos tirados al cambiar de empresa | `components/panel/useCargar.ts` | Ver las cifras de la empresa A bajo el nombre de la B durante la carga. |
| Sesión y compañía limpiadas al salir | `components/panel/Sesion.tsx` | Que en un ordenador compartido quede el rastro del anterior. |
| Gestión de usuarios oculta a los `member` | `app/(panel)/panel/configuracion/page.tsx` | Ofrecer un botón que el bot va a rechazar. El bot revalida: esto es cortesía. |
| Sin `update`/`insert`/`delete` directos | `lib/supabase/` | Toda escritura va por `commands`. Ver `docs/contrato-backend.md`. |

**Nada de esto detiene a alguien que quiera saltárselo, y no pretende hacerlo.**
Están para que el panel no pida datos ajenos por error y para no enseñar
información equivocada, no para contener a un atacante.

### Cabeceras HTTP

En `next.config.mjs`. Solo se aplican sirviendo desde Vercel; en el export
estático (`npm run publicar`) no hay quien las mande.

- `frame-ancestors 'none'` + `X-Frame-Options: DENY` en `/panel` y `/login`.
  Esto sí para un ataque real: **clickjacking**. Sin ello, cualquiera puede meter
  `/panel/mensajes` en un iframe invisible sobre su página y lograr que un dueño
  con la sesión abierta pulse «pausar bot» creyendo que pulsa otra cosa. El RLS
  no lo evita: la petición la hace su navegador, con su sesión, y es legítima.
- `Referrer-Policy: strict-origin-when-cross-origin`. Desde
  `/panel/mensajes?lead=<id>` se abre wa.me en otra pestaña; sin esto, esa URL
  entera —con el id dentro— viaja como `Referer` a un tercero.
- `X-Robots-Tag: noindex, nofollow` en el panel, el login y `/nueva-clave`.
- `X-Content-Type-Options: nosniff`, `Permissions-Policy` sin cámara, micrófono
  ni ubicación.

**No hay `Cache-Control: no-store`**, aunque parezca que debería. Se puso y se
comprobó que **Next lo ignora**: en las páginas preconstruidas impone la suya y
la nuestra no llega. Dejarla escrita habría sido peor que no ponerla. Tampoco
hace falta: el HTML del panel no lleva ni un dato —está comprobado con `curl`,
solo devuelve el «Cargando tu panel…»—, porque todo se pide desde el navegador
con la sesión del usuario. Si algún día una pantalla pasa a renderizarse en
servidor con datos dentro, esto deja de ser cierto.

Verificado sirviendo el build de producción (`npm run build && npm start`):

```
/                    X-Frame-Options: SAMEORIGIN
/panel/mensajes      X-Frame-Options: DENY · frame-ancestors 'none' · noindex
/nueva-clave         X-Frame-Options: DENY · noindex
/dev/assets          404
```

**No hay CSP de scripts, a propósito.** Next inyecta scripts en línea y una CSP
estricta necesita nonces por petición: mal puesta deja la aplicación en blanco, y
con `'unsafe-inline'` es una cabecera que no protege de nada. Si se hace, con
nonces de Next y probándola.

---

## 2 · Lo que hay que comprobar en Supabase

Esto es lo que de verdad decide quién ve qué, y **no se puede verificar desde el
panel**.

> **Atajo:** pega [`scripts/verificar-seguridad.sql`](scripts/verificar-seguridad.sql)
> entero en el SQL Editor de Supabase. Es una sola consulta de solo lectura que
> hace todas las comprobaciones de esta sección y marca con `REVISAR` lo que
> haya que mirar. Lo de abajo son las mismas consultas por separado, con la
> explicación de qué significa cada una.

### 2.1 · ¿Está el RLS activo en todas las tablas de negocio?

```sql
select c.relname as tabla, c.relrowsecurity as rls_activo
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relrowsecurity, c.relname;
```

Cualquier tabla de negocio con `rls_activo = false` es un agujero: el `GRANT`
por sí solo no filtra por empresa.

### 2.2 · ¿Qué políticas hay, y sobre qué rol?

```sql
select tablename, policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
 order by tablename, cmd;
```

Lo que tiene que salir:

- **Lectura** (`SELECT`) en cada tabla de negocio, acotada a la membresía del
  usuario — algo del estilo `company_id in (select company_id from memberships
  where auth_user_id = auth.uid())`.
- **`messages`** no tiene `company_id`: su política debe resolver el permiso a
  través de `leads`.
- **`commands`**: la política de `INSERT` es la más delicada de todas. Su
  `with_check` tiene que exigir **las tres cosas**: que el `company_id` sea de
  una empresa del usuario, que `status` sea `'pending'` y que `created_by` sea
  `auth.uid()`. Si no comprueba la membresía, cualquier usuario autenticado
  puede encolar un `update_company` **sobre el negocio de otro** — y el panel no
  pinta nada ahí, porque la petición la hace directamente contra la API.

### 2.3 · ¿Qué puede hacer cada rol por `GRANT`?

```sql
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
 order by grantee, table_name, privilege_type;
```

Lo esperado:

- `anon`: **nada** sobre tablas de negocio. Ya está verificado desde fuera —todas
  responden `42501 permission denied`— pero conviene verlo también aquí.
- `authenticated`: `SELECT` en las tablas y vistas que el panel lee, `INSERT`
  solo en `commands`. **Ni `UPDATE` ni `DELETE` en ninguna parte**: el panel no
  los usa y el espejo los pisaría de todas formas.

### 2.4 · ⚠️ Las vistas, que es lo que más se escapa

**Una vista normal de Postgres se salta el RLS de las tablas de debajo**: corre
con los permisos de su dueño (normalmente `postgres`), no con los de quien
consulta. Si `v_daily_metrics` no es `security_invoker` y `authenticated` tiene
`SELECT` sobre ella, **cualquier usuario con cuenta puede leer las métricas de
todas las empresas** cambiando el `company_id` del filtro. El panel se ve
perfecto y los datos están abiertos.

```sql
select c.relname as vista, c.reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v'
 order by c.relname;
```

En `reloptions` de **cada** vista tiene que aparecer `security_invoker=true`
(PostgreSQL 15+). Si falta:

```sql
alter view public.v_daily_metrics set (security_invoker = true);
-- y lo mismo con v_leads_by_day, v_orders_by_day, v_intent_by_day,
-- v_instance_health
```

**Lo que ya sabemos por las respuestas del API**, sin entrar a la base:

| Vista | Evidencia | Lectura |
|---|---|---|
| `v_instance_health` | Con `anon` falla con *«permission denied for table companies»* | Llegó a ejecutarse y murió leyendo la tabla de debajo **con los permisos de quien llama**: es `security_invoker`. Correcto. |
| `v_daily_metrics`, `v_leads_by_day` | Con `anon` fallan con *«permission denied for view»* | `anon` no tiene ni acceso a la vista, así que **no se puede saber desde fuera** si se saltan el RLS con un usuario autenticado. **Hay que mirarlo con la consulta de arriba.** |

### 2.5 · La RPC

```sql
select p.proname, p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'analytics_products';
```

Si `security_definer` es `true`, la función **se salta el RLS** y tiene que
comprobar la membresía por dentro; si no, cualquiera puede pasarle el
`p_company` de otro negocio. Con `anon` la llamada falló por permisos de
`catalog`, lo que apunta a que es `SECURITY INVOKER` —lo correcto—, pero
conviene confirmarlo.

### 2.6 · Auth

- **Confirmación de correo activada.** El panel permite darse de alta desde
  `/login`; sin confirmación, cualquiera crea cuentas con correos ajenos. La
  cuenta nueva no ve nada hasta que se le da membresía, así que el daño es
  limitado, pero es basura en `auth.users`.
- **Redirect URLs** (Authentication › URL Configuration). Tienen que estar:

  ```
  https://<tu-dominio>/nueva-clave      ← recuperar contraseña
  https://<tu-dominio>/callback         ← vuelta de Google
  http://localhost:3000/nueva-clave     ← solo mientras se desarrolla
  http://localhost:3000/callback        ← solo mientras se desarrolla
  ```

  Sin ellas, el enlace aterriza en el Site URL y la pantalla correspondiente no
  se abre nunca. Y **solo esas**: una redirect URL con comodín
  (`https://*.vercel.app/**`) convierte cualquier despliegue de vista previa en
  un sitio válido al que mandar una sesión.

- **Google OAuth.** El *Authorized redirect URI* que va en Google Cloud es el de
  Supabase (`https://<proyecto>.supabase.co/auth/v1/callback`), no el del sitio:
  Google habla con Supabase, y Supabase reenvía al sitio usando la lista de
  arriba. Son dos listas distintas y las dos tienen que estar bien.

  El *Client Secret* de Google vive **solo en Supabase**. No es una variable de
  este proyecto y no debe acabar en `.env.local` ni en Vercel.
- **SMTP propio.** El de Supabase por defecto va limitadísimo (unos pocos
  correos por hora, para todo el proyecto) y cae en spam. Con él, la
  recuperación de contraseña falla justo cuando hay alguien delante esperando.
  Es la misma razón por la que `add_member` enseña la contraseña temporal en
  pantalla en vez de mandarla por correo.
- **Duración del token**: por defecto 1 hora con refresco. Para un panel que se
  deja abierto en un mostrador, considera bajarlo.

### 2.7 · El enlace de recuperación ES una sesión

`/nueva-clave` recibe una sesión temporal en la URL: **quien abra ese enlace
está dentro de la cuenta**, sin saber la contraseña vieja. Por eso:

- Caduca y se usa una sola vez (lo gestiona Supabase; la pantalla distingue el
  enlace caducado y ofrece pedir otro).
- Esa pantalla **no enseña ningún dato del negocio**, solo el formulario.
- El aviso al pedirlo no confirma si el correo existe: un «ese correo no está
  registrado» convierte el formulario en una forma cómoda de averiguar quién es
  cliente.

---

## 3 · Riesgos aceptados, a sabiendas

| Riesgo | Por qué se acepta |
|---|---|
| La sesión vive en `localStorage` | Es como funciona supabase-js en el navegador. Implica que un XSS se lleva la sesión — por eso el panel no inyecta HTML en ningún sitio (`dangerouslySetInnerHTML` solo aparece en la landing, con copy propio y escapado). |
| Los errores de Postgres se enseñan tal cual | Un `permission denied for table X` le dice al usuario más de lo necesario sobre el esquema. A cambio, cuando algo falla se puede diagnosticar. Si el panel sale de círculos de confianza, conviene filtrarlos. |
| El filtro de Realtime no es un control | `escucharMensajes` filtra por `lead_id`, pero eso es una comodidad del canal. Lo que impide recibir mensajes ajenos es el RLS aplicado a Realtime: **hay que tener RLS activo en `messages`** (2.1). |
| Sin CSP de scripts | Explicado arriba. |
| La clave `anon` está en el bundle | Es su función. Lo que nunca puede aparecer es la `service_role`: se salta el RLS entero. No está en el repo ni en Vercel — solo en el `.env` del bot. |

---

## 4 · Resultado de la verificación · 2026-08-23

Ejecutado `scripts/verificar-seguridad.sql` contra el proyecto real. Lo que
antes eran supuestos ahora son hechos.

### Verificado y correcto

| | |
|---|---|
| **RLS** | Activo en las 18 tablas. Sin excepciones. |
| **Las cinco vistas `v_*`** | `security_invoker=true` en todas. **No se saltan el RLS** — era el riesgo mayor de esta lista. |
| **`analytics_products`** | `SECURITY INVOKER`. No necesita validar nada por dentro. |
| **`commands` · INSERT** | `is_member(company_id) AND status = 'pending' AND attempts = 0`. Comprueba la membresía: nadie encola comandos sobre el negocio de otro. |
| **Lecturas** | Todas las políticas de `SELECT` van por `is_member(company_id)`. |
| **`messages`** | Resuelve el permiso a través de `leads`, con RLS activo — así que Realtime queda cubierto por lo mismo. |
| **`memberships`** | Solo devuelve las filas de `auth.uid()`. Es lo que sostiene la validación de compañía del front. |
| **`authenticated`** | `SELECT` en lo que el panel lee e `INSERT` solo en `commands`. Ni `UPDATE` ni `DELETE`… salvo lo de abajo. |
| **Sin sesión** | Todas las tablas de negocio responden `42501 permission denied` con la clave `anon`. |

### Resuelto · Permisos de más en `instances` y `v_instance_health`

Las dos tenían `DELETE, INSERT, SELECT, UPDATE` para **`anon` y
`authenticated`**, cuando todo lo demás del esquema tiene un `SELECT` pelado.
Un `grant all` suelto, seguramente.

No era explotable —el RLS de `instances` denegaba las escrituras por no haber
política que las permitiera—, pero dejaba esos datos sostenidos por una sola
capa: bastaba con que alguien desactivara ese RLS para depurar algo.

**Corregido el 2026-08-23** con
[`scripts/arreglar-permisos.sql`](scripts/arreglar-permisos.sql), y comprobado
desde fuera con la clave `anon`:

```
v_instance_health  →  42501 permission denied for view v_instance_health
instances          →  42501 permission denied for table instances
```

Antes, `v_instance_health` con `anon` llegaba a ejecutar la vista y moría leyendo
`companies`; ahora ni entra. `authenticated` conserva su `SELECT`, que es lo
único que el panel necesita.

### Resuelto · El `search_path` de `is_member`

`is_member` es `SECURITY DEFINER`, y **eso está bien**: es el patrón correcto
para un ayudante que lee `memberships` desde una política —si fuera `INVOKER`, la
política de `memberships` se llamaría a sí misma—. El script de verificación lo
marca como `REVISAR` porque no puede distinguir un `DEFINER` legítimo de uno
peligroso; no es un fallo, es una pregunta que hay que contestar a mano.

La respuesta, comprobada el 2026-08-23: **tiene el `search_path` fijado**. Eso es
lo que impide secuestrarla creando una tabla `memberships` en un esquema que vaya
antes en el camino de búsqueda.

Si algún día se reescribe esa función, hay que volver a mirarlo:

```sql
select p.proname, p.proconfig,
       case when p.proconfig::text ~ 'search_path'
            then 'OK · fijado' else 'REVISAR · sin search_path' end as estado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'is_member';
-- Si sale REVISAR:
--   alter function public.is_member(text) set search_path = public, pg_temp;
```

### Probado en vivo · 2026-08-23

Leer una política no es lo mismo que ejecutarla, así que se ejecutó. Con una
cuenta real **confirmada y sin ninguna membresía**, token `role: authenticated`,
contra la API de producción:

**Lecturas — `[]` en las 23**, sin una sola fila:

```
memberships · companies · leads · messages · catalog · appointments
appointment_services · orders · escalations · employees · employee_blocks
pending_payments · conversation_events · blocklist · catalog_media
form_templates · instances · commands
v_daily_metrics · v_leads_by_day · v_orders_by_day · v_intent_by_day
v_instance_health
```

Las cinco vistas devolvieron vacío igual que las tablas: confirma en ejecución lo
que decía el catálogo sobre `security_invoker`.

**Escrituras — todas rechazadas:**

| Intento | Respuesta |
|---|---|
| `INSERT` en `commands` con el `company_id` de otra empresa | `42501 · new row violates row-level security policy` |
| `UPDATE` en `leads` | `42501 · permission denied for table leads` |
| `DELETE` en `companies` | `42501 · permission denied for table companies` |
| `analytics_products` con el `p_company` de otra empresa | `[]` |

La primera fila es la que más importaba: demuestra que el `WITH CHECK` de
`commands` **ejecuta** `is_member`, y que sin membresía no se puede encolar nada
contra el negocio de otro. Las dos siguientes confirman que `authenticated` no
tiene `UPDATE` ni `DELETE` en ninguna parte, ni siquiera sobre sus propios datos:
para cambiar algo hay que pasar por la cola de comandos, como manda el contrato.

**Con esto, el aislamiento entre empresas deja de ser una lectura de las
políticas y pasa a ser un hecho comprobado.**

Para repetirlo cuando cambie algo del esquema: hace falta una cuenta confirmada
sin membresía (el proyecto tiene `mailer_autoconfirm: false` y las altas
anónimas desactivadas, así que se necesita un buzón real o la `service_role`), y
después las mismas llamadas de arriba con su token.
