# Paleta Vendemia

Extraída de `logo-principal.png` y `logo-azul.webp`. Regenerable con
`python3 scripts/palette.py --check`.

## Los dos colores de origen

| | Hex | De dónde sale |
|---|---|---|
| **Azul de marca** | `#0167F9` | El fondo plano del avatar de Mia — 136 536 px de un solo valor, sin antialias. Es el valor autoritativo. |
| **Tinta** | `#02091C` | El wordmark "vende". Es un navy casi negro, no un negro puro. |

El azul del wordmark "mia" mide `#066FFD`; la diferencia con `#0167F9` es
antialias sobre blanco, no una segunda tinta. Un solo azul.

---

## Rampas

Generadas en OKLCH con **matiz constante** (260.3°) y croma mapeado a gamut.
Deriva máxima de matiz: **1.0°** — por debajo de 4° el ojo no la percibe.

```css
/* ── Marca ── */
--blue-50:  #EDF4FF;
--blue-100: #D9E7FF;
--blue-200: #B5D1FF;
--blue-300: #8BB6FF;
--blue-400: #5A97FF;
--blue-500: #0167F9;   /* ← el azul del logo */
--blue-600: #005CE2;
--blue-700: #0047B2;
--blue-800: #003385;
--blue-900: #00215C;

/* ── Neutros ── */
--ink-950: #02050E;
--ink-900: #070C17;
--ink-850: #0F1520;
--ink-800: #1A212C;
--ink-700: #2C333F;
--ink-600: #48505D;
--ink-500: #6D7583;
--ink-400: #9099A8;
--ink-300: #B5BECE;
--ink-200: #D2DBEB;
--ink-100: #E4EDFE;
--ink-50:  #EEF7FF;
```

Los neutros no son grises puros: llevan un 55 % del matiz de la tinta. Sobre un
fondo así el azul de marca se integra en vez de flotar encima, que es lo que
pasa cuando mezclas un acento saturado con grises neutros.

---

## Reglas de uso (esto es lo que importa)

**El azul de marca no sirve como texto sobre fondo oscuro.** `blue-500` sobre
`ink-950` da **4.18** de contraste — por debajo del 4.5 que pide AA. Es el
error más fácil de cometer con esta paleta.

| Quiero… | Uso | Contraste |
|---|---|---|
| Botón principal | fondo `blue-500`, texto blanco | 4.87 ✓ |
| Botón hover | fondo `blue-600`, texto blanco | 5.79 ✓ |
| Enlace o texto azul **sobre oscuro** | `blue-400` | 7.09 ✓ |
| Enlace o texto azul **sobre claro** | `blue-600` | 5.45 ✓ |
| Texto principal sobre oscuro | `#FFFFFF` | 20.38 ✓ |
| Texto secundario sobre oscuro | `ink-400` | 7.09 ✓ |
| Texto terciario sobre oscuro | `ink-500` | 4.39 ~ solo para texto grande |
| Texto sobre crema | tinta `#02091C` | 18.68 ✓ |
| Resplandores, halos, trazos | `blue-500`/`blue-400` sin texto encima | decorativo |

Regla corta: **`blue-500` para rellenar, `blue-400` para escribir sobre oscuro,
`blue-600` para escribir sobre claro.**

---

## Mapeo contra los tokens actuales

Si decides aplicarla, la sustitución es uno a uno en `app/globals.css` y no
toca ningún componente:

| Token actual | Valor viejo | Valor Vendemia | Nota |
|---|---|---|---|
| `--orange-500` | `#FF4900` | `#0167F9` | acento primario |
| `--orange-400` | `#FF6A1F` | `#5A97FF` | pasa a ser el azul **de texto**, no solo hover |
| `--orange-glow` | `#FF7A18` | `#0167F9` | núcleo de resplandores |
| `--amber-300` | `#FFB067` | `#8BB6FF` | borde de resplandores |
| `--bg-900` | `#000000` | `#02050E` | |
| `--bg-850` | `#060200` | `#00030E` | el tinte del hero pasa de cálido a **frío** |
| `--bg-intro` | `#171717` | `#141A24` | sigue siendo más claro que el hero, que es lo que hace visible el telón |
| `--surface-800` | `#0A0A0A` | `#070C17` | |
| `--surface-700` | `#141414` | `#0F1520` | |
| `--border-dark` | `#1F1F1F` | `#1A212C` | |
| `--bg-cream` | `#F9F9F6` | `#F7F9FD` | crema frío en vez de cálido |
| `--border-light` | `#EAEAE6` | `#E4EAF4` | |
| `--text-mid` | `#A1A1A1` | `#9099A8` | |
| `--text-low` | `#6B6B6B` | `#6D7583` | |

**Ojo con dos:**

`--bg-850` es el fondo del hero. Ahora es negro con tinte cálido porque el
acento era naranja. Con azul tiene que virar a frío (`#00030E`) o el hero se
verá sucio contra el acento.

`--bg-intro` tiene que seguir siendo **más claro** que `--bg-850`. Ese salto de
valor es lo único que hace visible el corte del telón; si los igualas, la
transición desaparece.

---

## Lo que no cubre esta paleta

El logo tiene tres ideas visuales que no son color y que dan más juego que
cualquier acento: **la burbuja de chat**, **la sonrisa** y **el avión de papel**.

El avión ya se usa: la intro de marca no "forma" el isotipo, hace que Mia entre
volando desde fuera de cuadro y aterrice — el mismo gesto direccional que M2,
pero dibujado en el propio logo. Quedan la burbuja y la sonrisa. La sonrisa
funciona sola como separador entre secciones.

**Ojo si aplicas esta paleta:** el logo está reentintado al naranja del sitio
por `scripts/logo.mjs`. Cambiar los tokens de `globals.css` a azul sin
reejecutar el script deja a Mia en naranja sobre una web azul. Atajo: los
ficheros `public/brand/*-azul.svg` ya salen generados en el azul de marca.
Ver README →
"La marca · Mia".
