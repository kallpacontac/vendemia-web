# Vendemia Fideliza · base de datos, despliegue y operación

Tarjetas de cliente (sellos, puntos o visitas), placas NFC/QR, tarjeta web/PWA y
Google Wallet. El panel está en `vendemias.com/panel/fideliza`; lo público, en
`fideliza.vendemias.com`.

## Lo que hay que saber antes de tocar nada

- **Estas tablas no son espejo del bot.** El resto de `public` es copia del
  SQLite del bot y se cambia encolando `commands`. Las `loyalty_*` las escribe
  esta web, y **Postgres es la fuente de verdad del saldo**. El bot no las conoce.
- **Nadie escribe en las tablas directamente.** Todo pasa por funciones
  `SECURITY DEFINER` que comprueban el permiso por dentro (`loyalty_require`).
  `authenticated` solo tiene `SELECT` (filtrado por RLS); `anon`, nada.
- **No hay `service_role` en Vercel.** Lo público y el worker llaman a las
  funciones `loyalty_srv_*` con la clave anon más la cabecera `x-fideliza-key`.
  En la base solo se guarda el SHA-256 de esa clave. Abre esas funciones y nada
  más; si se filtra, se rota (ver 0006).
- **Google Wallet nunca es el libro.** Cada cambio escribe en `loyalty_outbox`
  en la misma transacción; el worker se lo cuenta a Google después, con
  reintentos. Si Google falla, la compra sigue siendo válida.

## Migraciones

Van **aquí** y no en `../vendemia/supabase/migrations` (el repo del bot) para no
tocar ese repositorio. No chocan: todo usa el prefijo `loyalty_`.

| Fichero | Qué hace |
|---|---|
| `0001_tablas.sql` | 28 tablas `loyalty_*`, claves compuestas por compañía, ledger inmutable (trigger) |
| `0002_permisos_rls.sql` | Roles de Fideliza sobre `memberships`, RLS, `REVOKE` de los grants por defecto de Supabase |
| `0003_operaciones.sql` | RPC del panel: programa, miembros, compra/visita, canje, devolución, placas, enlaces, campañas |
| `0004_servidor.sql` | RPC `loyalty_srv_*`: resolutor, alta, tarjeta, Wallet, outbox, push, mantenimiento |
| `0005_metricas.sql` | `loyalty_metrics()` |
| `0006_grants.sql` | Quién puede ejecutar qué. **Contiene el paso manual de la clave** |
| `0007_placa_sin_activar.sql` | La placa nueva sin dueño responde «aún no está activada» (con camino al panel) en vez de «no disponible» |
| `0008_estilo_y_redes.sql` | Plantillas de la página (`page_style`) y, en cada enlace, icono, subtítulo y si es red social o botón |

**Aplicar:** SQL Editor de Supabase, en orden (0001 → 0008), cada fichero entero. Primero en
staging, y allí pegar `tests/pruebas.sql` (no deja nada escrito: acaba en
`ROLLBACK`). Tiene que terminar con «TODAS LAS PRUEBAS PASARON».

Dependen de lo que ya existe del bot: `companies`, `memberships`,
`platform_admins` (0020) y `auth.users`. No modifican ninguna de esas tablas.

**Comprobar después** con `scripts/verificar-seguridad.sql`: todas las
`loyalty_*` deben salir con RLS activo y sin `INSERT/UPDATE/DELETE` para
`authenticated`.

**Rollback:** no hay datos de otras tablas implicados. Para retirar el módulo:

```sql
drop table if exists public.loyalty_server_keys, public.loyalty_settings, public.loyalty_locations,
  public.loyalty_staff, public.loyalty_programs, public.loyalty_program_versions, public.loyalty_members,
  public.loyalty_contacts, public.loyalty_consents, public.loyalty_transactions, public.loyalty_rewards,
  public.loyalty_redemptions, public.loyalty_ledger, public.loyalty_wallet_classes, public.loyalty_wallet_passes,
  public.loyalty_link_profiles, public.loyalty_links, public.loyalty_published_link_versions, public.loyalty_devices,
  public.loyalty_device_claims, public.loyalty_public_events, public.loyalty_campaigns, public.loyalty_campaign_events,
  public.loyalty_push_subscriptions, public.loyalty_outbox, public.loyalty_webhook_receipts, public.loyalty_audit_log,
  public.loyalty_rate_limits cascade;
-- y las funciones: select 'drop function ' || oid::regprocedure || ';' from pg_proc where proname like 'loyalty\_%';
```

⚠️ Con clientes reales dentro, eso borra sus saldos. Exporta antes.

## Variables de entorno (Vercel → Production y Preview)

| Variable | Secreta | Valor |
|---|---|---|
| `NEXT_PUBLIC_FIDELIZA_URL` | no | `https://fideliza.vendemias.com` |
| `FIDELIZA_SERVER_KEY` | **sí** | 32 bytes aleatorios en base64url; su hash va en `loyalty_server_keys` |
| `GOOGLE_WALLET_ISSUER_ID` | no | `3388000000023213846` |
| `GOOGLE_WALLET_DEMO_CLASS_ID` | no | `3388000000023213846.vendemia_fideliza_v1` |
| `GOOGLE_WALLET_CREDENTIALS_JSON_BASE64` | **sí** | el JSON de `vendemia-wallet@vendemia-505020.iam.gserviceaccount.com` en base64 |
| `GOOGLE_WALLET_PROGRAM_LOGO_URL` | no | `https://vendemias.com/wallet/logo-vendemia-1024.png` |
| `GOOGLE_WALLET_MODE` | no | `demo` mientras el emisor esté en revisión; `production` después |
| `CRON_SECRET` | **sí** | 16+ caracteres; Vercel lo manda solo al cron |
| `WEB_PUSH_VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` | la privada **sí** | `npx web-push generate-vapid-keys` |
| `WEB_PUSH_SUBJECT` | no | `mailto:contacto@vendemias.com` |
| `GOOGLE_PLACES_API_KEY` | **sí** | Places API (New), restringida a esa API. Sin ella, «Tu negocio en Google» pide pegar el enlace a mano |
| `FIDELIZA_IP_SALT` | sí (opcional) | sal para el hash de IP de los límites; si falta, usa la clave del servidor |

Para la credencial de Google, en tu máquina: `base64 -w0 clave.json` (Linux) o
`[Convert]::ToBase64String([IO.File]::ReadAllBytes("clave.json"))` (PowerShell),
y pegar el resultado en Vercel. El código comprueba que `client_email` sea la
cuenta autorizada y normaliza los `\n` de la clave privada. Nunca la registra.

## Dominio

1. Vercel → Domains → añadir `fideliza.vendemias.com` al MISMO proyecto.
2. DNS: `CNAME fideliza → cname.vercel-dns.com`.
3. `middleware.ts` hace el resto: en `fideliza.*` solo existen `/t`, `/n`, `/m`
   y su API pública; lo demás redirige a `vendemias.com`. En el dominio
   principal, `/t /n /m` redirigen a `fideliza.*`.

## Cron

`vercel.json` lo programa **una vez al día** (14:00 UTC = 09:00 Lima), porque
el plan Hobby de Vercel no permite más y un cron más frecuente haría fallar el
despliegue. No es la vía principal: el panel drena la cola de su compañía
después de cada operación y con «Sincronizar ahora». En Pro, cambiar a
`*/5 * * * *`. Alternativa gratis: `pg_cron` + `pg_net` en Supabase llamando a
`/api/fideliza/cron` con la cabecera `Authorization: Bearer <CRON_SECRET>`.

## Google Wallet

- **Una clase por programa** (`<issuer>.vf_<programa>`), con nombre, color y
  logo del comercio. El logo del comercio solo se usa si pasó la comprobación
  (PNG/JPEG, https, cuadrado, ≥ 660×660); si no, el de Vendemia.
- **La clase de demo** (`vendemia_fideliza_v1`) solo la usa un negocio que el
  admin de plataforma marque en Fideliza → Ajustes. Lleva la marca de Vendemia:
  no se marca nunca a un comercio real.
- **Un objeto por miembro** (`<issuer>.vf_<id de la emisión>`), con el código
  VDM-… y el QR con un token opaco. Crear/actualizar es PATCH → si 404 INSERT →
  si 409 PATCH: reintentar nunca crea un segundo objeto.
- Las clases se crean con `reviewStatus: UNDER_REVIEW` (en `DRAFT` Google no
  deja crear objetos). Con el emisor en modo demo, solo funcionan las cuentas
  añadidas como *test accounts* en la Google Pay & Wallet Console.
- Emitir el enlace de guardado **no** es «guardado». No hay callback de Google
  todavía; `loyalty_webhook_receipts` queda preparada para cuando se verifiquen
  sus firmas.

**Checklist para pedir producción del emisor (salir de demo):**
1. Logo del comercio aprobado (sin marcas de terceros) y nombre ≤ 20 caracteres.
2. Página pública y política de privacidad accesibles (`/privacidad`).
3. Una clase real en `UNDER_REVIEW` con un objeto de prueba guardado por una
   test account (capturas de pantalla).
4. En la Wallet Console → *Request publishing access*.
5. Al aprobarse: `GOOGLE_WALLET_MODE=production` y redesplegar.

## Concurrencia (prueba manual, dos sesiones)

`tests/pruebas.sql` va en una sola sesión. Para comprobar que dos cajas no
canjean el mismo premio, abre DOS pestañas del SQL Editor con el mismo miembro
(con 1 premio):

```sql
-- Pestaña 1
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uid propietario>"}';
select public.loyalty_redeem('<compañía>', '<miembro>', null, null, 'concurrencia-1');
-- NO hagas commit todavía

-- Pestaña 2 (se queda esperando al bloqueo del miembro)
begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<uid>"}';
select public.loyalty_redeem('<compañía>', '<miembro>', null, null, 'concurrencia-2');

-- Pestaña 1:  commit;
-- Pestaña 2 termina con «loyalty:no_reward_available».   Luego: rollback;
```

Lo mismo con dos `loyalty_record` con el mismo `external_ref` y claves
distintas: la segunda acaba en `duplicate_reference`.

## Prueba manual de punta a punta (pendiente: necesita credenciales y una test account)

```
crear programa (Programa, pasos 1–6) → publicar
→ Ajustes: «Tarjeta de Google Wallet del programa: al día»
→ Clientes → Añadir cliente → escanear el QR del enlace con el móvil
→ en la tarjeta web: «Agregar a Google Wallet» con una test account
→ Caja: buscar VDM-…, registrar compra
→ en el móvil, el pase cambia de saldo (segundos; si no, Ajustes → Sincronizar ahora)
→ registrar hasta el premio → Canjear
→ Clientes → ficha: saldo, libro y premio canjeado cuadran
```

## Pruebas automáticas

- `npm run test:fideliza` — sin base de datos: payloads de Wallet, importes,
  errores, y que ningún secreto (ni su nombre) llegue al JavaScript del
  navegador. Ejecutar después de `npm run build`.
- `tests/pruebas.sql` — en staging: idempotencia, canje único, devolución,
  versionado, aislamiento A/B, cajero sin exportar, QR que no acredita, 0/1/N,
  suspendido sin Wallet, outbox reintentable, baja que vacía la cola.

## Lo que queda fuera (a propósito)

Apple Wallet, Smart Tap, canjes offline, reseñas, integración con el bot/CRM,
niveles. Recuperación de tarjeta por OTP: no hay proveedor de SMS/correo
configurado en esta web, así que la recuperación es **en el local** (el
empleado verifica a la persona y pulsa «Nuevo enlace de tarjeta») o en el mismo
teléfono (la página de alta ofrece abrir la tarjeta guardada).
