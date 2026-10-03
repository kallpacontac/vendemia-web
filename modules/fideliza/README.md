# Módulo Fideliza

Tarjetas de cliente (sellos, puntos o visitas), placas NFC/QR, tarjeta web/PWA y
Google Wallet. **Todo el código del módulo vive en esta carpeta.** Fuera solo
quedan los puntos de enganche que Next obliga a tener en sitios fijos.

## Estructura

| Carpeta | Qué hay | Regla |
|---|---|---|
| `dominio/` | Modelo y lógica pura: formato de unidades e importes, errores, definiciones de métricas, payloads de Google Wallet, URLs públicas | Sin red, sin secretos, sin React. Se puede importar desde cliente, servidor y pruebas |
| `servidor/` | Todo lo `server-only`: clientes de Supabase, HTTP y límites, Google Wallet, Web Push, worker del outbox, acciones del panel, hosts | Nunca importarlo desde un componente de cliente: `server-only` rompe el build si pasa |
| `servidor/rutas/` | La lógica de cada Route Handler (`GET`/`POST`) | Las rutas de `app/` solo los re-exportan |
| `cliente/` | `api.ts`: lecturas por RLS y llamadas a `/api/fideliza/panel/*` desde el navegador | |
| `ui/` | Contexto (rol + ajustes), estados comunes y las pantallas del panel (`ui/paginas/`) | |
| `publico/` | La tarjeta web `/m/<token>` | |
| `estilos/` | `panel.css` (pestañas, caja) y `tarjeta.css` (página pública) | |
| `sql/` | Migraciones 0001–0006, pruebas en Postgres y la guía de despliegue | **Léela antes de tocar la base:** [sql/README.md](sql/README.md) |
| `pruebas/` | `unitarias.mjs` (`npm run test:fideliza`) | |
| `cabeceras.mjs` | Cabeceras HTTP de `/m/*`, del service worker y la cámara en `/panel` | |

## Lo que queda fuera de la carpeta (y por qué)

Next exige estos sitios. Son una línea, o re-exportaciones sin lógica:

| Fichero | Contenido |
|---|---|
| `app/(panel)/panel/fideliza/**` | `export { default } from '@/modules/fideliza/ui/paginas/…'` |
| `app/(fideliza)/t`, `n`, `m/**` | Rutas públicas: `runtime`, `dynamic` y re-export |
| `app/api/fideliza/**` | API del panel, pública y cron: igual |
| `middleware.ts` | Llama a `hostsFideliza()` |
| `next.config.mjs` | `...cabecerasFideliza(CABECERAS_PRIVADAS)` |
| `components/panel/Sidebar.tsx` | La entrada «Fideliza» del menú |
| `public/m/sw.js` | El service worker (tiene que servirse desde `/m/` para quedar acotado ahí) |
| `public/wallet/es419_add_to_google_wallet_wallet-button.svg` | Botón oficial de Google, sin modificar |
| `vercel.json` | El cron diario |
| `package.json` | Dependencias (`zod`, `qrcode`, `web-push`, `server-only`, `jiti`) y `test:fideliza` |

## Lo que el módulo usa del resto del panel

Sesión y compañía activa (`components/panel/Sesion`), `Topbar`, `useCargar`,
avisos (`useAvisar`), el cliente de Supabase (`lib/supabase/client`), el modo
demo (`lib/panel/demo`) y los tokens de `app/panel.css`. Si alguno de esos
cambia de forma en la rama principal, aquí es donde hay que mirar al fusionar.

En la base, depende de `companies`, `memberships`, `platform_admins` y
`auth.users`, que son del bot. No las modifica.

## Trabajar en paralelo

Fideliza está en la rama `fideliza`; `main` sigue sin él. Para traer lo nuevo
de `main` sin esperar a terminar:

```bash
git switch fideliza
git merge main
```

Los únicos ficheros que comparten las dos ramas son los de la tabla de arriba.
Si hay conflicto, será ahí, y casi siempre de una línea.
