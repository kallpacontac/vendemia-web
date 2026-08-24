# Vendemia · web

**Un solo proyecto.** Aquí vive todo lo que se publica: la landing y las páginas
del panel. Si buscas dónde tocar algo, es aquí.

## Qué es cada cosa

| | dónde | cómo se edita |
|---|---|---|
| **La landing** | `app/(landing)/`, `components/`, `lib/content.ts` | React + Tailwind. Todo el copy está en `lib/content.ts`, nada suelto en el JSX. |
| **El panel** | `app/(panel)/panel/*`, `app/(acceso)/login`, `components/panel/`, `app/panel.css` | React. Los datos salen de Supabase (`lib/supabase/`). |
| **El contrato con el bot** | `docs/contrato-backend.md` | **Copia**, sincronizada el 2026-08-19. El original vive en el repo del bot y gana siempre. Ya está desfasada en un punto: recomienda `sync_state.last_mirror_at`, y esa tabla se eliminó — ver la regla 3 más abajo. |
| **El sitio publicado** | `out/` | **Generado**, y solo la landing. El sitio de verdad se despliega en Vercel. |

El panel era una carpeta de HTML sueltos en `public/` con datos de mentira.
Ahora son rutas de esta misma aplicación y los datos son reales: el panel lee
las tablas espejadas de Supabase y, para cambiar algo, **inserta una fila en
`commands`** — nunca hace `update`. El porqué de esa regla, y el catálogo
entero de comandos, está en [docs/contrato-backend.md](docs/contrato-backend.md).

El diseño no se ha rehecho: `app/panel.css` es el `public/assets/app.css` de
antes, con los `<style>` de cada página añadidos al final y solo dos reglas
acotadas (las que al dejar de estar dentro de su HTML se pisaban entre sí).

## Comandos

```bash
npm install
cp .env.example .env.local   # y pon las claves de Supabase
npm run dev          # http://localhost:3000 — landing Y panel a la vez
npm run typecheck    # tsc --noEmit
npm run build        # lo mismo que ejecuta Vercel
npm run publicar     # construye out/ = SOLO la landing, para un estático suelto
npm run publicar -- --ver   # además lo sirve en http://localhost:4173
npm run logo         # regenera los assets de marca desde el logo original
```

En `npm run dev`, `http://localhost:3000/login` y `/panel` también funcionan: el
producto completo se ve con un solo servidor. Sin `.env.local`, la landing va
igual y el login lo dice con todas las letras en vez de romperse.

## Desplegar

### El sitio (Vercel)

Es un proyecto de Next normal: Vercel lo detecta solo, sin `vercel.json` ni
ajustes raros.

1. **Importa el repositorio** en Vercel. Framework: Next.js. Build `npm run
   build`, output por defecto — no toques nada.
2. **Variables de entorno** (Settings › Environment Variables), en Production,
   Preview y Development:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clave **anon** (`sb_publishable_…`) |
   | `NEXT_PUBLIC_SITE_URL` | el dominio final, para la imagen de Open Graph |

   ⚠️ **Nunca la `service_role`.** Se salta el RLS entero: con ella en el bundle
   cualquiera lee y escribe todas las compañías. Esa clave es solo del bot.

   `NEXT_PUBLIC_*` se incrusta al construir, así que **después de cambiarlas hay
   que volver a desplegar**; no basta con guardar.
3. **En Supabase**, Authentication › URL Configuration:
   - *Site URL*: tu dominio.
   - *Redirect URLs*, las cuatro:

     ```
     https://<tu-dominio>/nueva-clave
     https://<tu-dominio>/callback
     http://localhost:3000/nueva-clave      ← solo desarrollo
     http://localhost:3000/callback         ← solo desarrollo
     ```

     Sin `/nueva-clave` no funciona «olvidé mi contraseña»; sin `/callback` no
     funciona entrar con Google. **Nada de comodines**
     (`https://*.vercel.app/**`): eso convierte cualquier preview en un destino
     válido al que mandar una sesión.
   - **Configura un SMTP propio.** El de Supabase manda unos pocos correos por
     hora para todo el proyecto y cae en spam: con él, la recuperación de
     contraseña falla justo cuando hace falta.
4. **Entrar con Google** (opcional pero recomendado, evita el correo entero):
   - Google Cloud Console › APIs & Services › Credentials › *OAuth client ID* ›
     **Web application**. Authorized redirect URI, exactamente una:
     `https://<tu-proyecto>.supabase.co/auth/v1/callback`
   - Supabase › Authentication › Providers › **Google**: activar y pegar el
     *Client ID* y el *Client Secret*.
   - Con los scopes `email` y `profile` **no hace falta que Google verifique la
     app**: son no sensibles.
4. Despliega y entra en `tudominio.com/login`.

### La landing sola (servidor estático)

`npm run publicar` deja en `out/` **la landing y nada más** — el panel se borra
de ese artefacto a propósito. Se sube tal cual a cualquier sitio: todas sus
rutas son relativas, así que funciona en la raíz de un dominio, en un
subdirectorio o abierta desde el disco.

El panel no puede salir por ahí: necesita las claves incrustadas en el bundle, y
con rutas anidadas (`/panel/leads`) el prefijo relativo `./` que hace posible lo
anterior deja de valer. Los detalles están en el encabezado de
`scripts/publicar.mjs`.

## Seguridad

Está en **[SEGURIDAD.md](SEGURIDAD.md)**, y se resume en una frase: *el front no
protege nada; la frontera es el RLS de Postgres*. Todo el panel corre en el
navegador, así que cualquiera puede saltarse nuestras pantallas y llamar a
Supabase a mano.

**Verificado contra el proyecto real el 2026-08-23** con
[`scripts/verificar-seguridad.sql`](scripts/verificar-seguridad.sql): RLS activo
en las 18 tablas, las cinco vistas `v_*` son `security_invoker` (no se saltan el
RLS), y la política de `INSERT` en `commands` comprueba la membresía.

Los dos avisos que salieron —permisos de más en `instances` /
`v_instance_health`, y el `search_path` de `is_member`— quedaron cerrados ese
mismo día. Y el aislamiento entre empresas se **probó en vivo**: una cuenta
autenticada sin membresía no lee ni una fila de ninguna de las 23 tablas y
vistas, y no puede encolar comandos contra un negocio ajeno.

## El panel y Supabase, en cinco reglas

El contrato completo está en [docs/contrato-backend.md](docs/contrato-backend.md).
Esto es lo que hay que tener en la cabeza para tocar el panel sin romperlo:

1. **El panel LEE tablas y vistas. Para CAMBIAR algo, inserta una fila en
   `commands`.** No hay `update` posible: los `GRANT` solo permiten `select`, y
   si algún día no fallaran, el siguiente barrido del espejo pisaría el cambio.
   Todo eso vive en `lib/supabase/commands.ts` — usa `encolar()` o, mejor, el
   `useComando()` de `components/panel/Avisos.tsx`.
2. **Lo que el panel enseña ya ocurrió.** Son las filas que las tools del bot
   escribieron y el espejo subió. Por eso los cambios tardan 1-2 s en verse: es
   lo que el bot tiene de verdad, no un optimismo que puede revertirse. No
   pintes nada como hecho antes de que vuelva.
3. **El bot puede estar apagado** — vive en un portátil. Entonces `encolar()`
   lanza `BotNoResponde`, y eso **no** es un fallo: el comando queda en
   `pending` y se drena al arrancar. Decir "no se guardó" sería mentira.

   Para saber si está en línea, `v_instance_health` (ver
   `components/panel/Salud.tsx`), nunca `sync_state`: esa tabla **se eliminó**,
   y aunque existiera sería peor señal — el latido y el volcado del espejo
   salen del mismo proceso, así que si uno falla el otro ya falló, y la vista
   además dice por qué. Ojo con sus tres estados: sin fila es **desconocido**
   (compañía sin instancia registrada), no "caído"; y `vivo` y `wa_connected`
   son dos problemas distintos con dos arreglos distintos.
4. **Tres rarezas del espejo**, resueltas en `lib/supabase/parse.ts`: los
   booleanos son `0/1`, los campos JSON son `text` (hay que parsear y
   serializar) y toda fecha viene dos veces — usa siempre `*_ts`.
5. **`update_company` puede ignorar campos.** Mira `result.ignored` y avísalo,
   o el usuario creerá que guardó algo que no se guardó.

Y dos cosas que el panel **no** hace, a propósito: no enseña un QR de WhatsApp
(quien lo escanea se lleva la sesión del negocio; el emparejamiento es en
persona) y no edita la intención ni el estado de un lead (no hay comando para
eso, y son campos que el bot deduce solo).

## Historia, para que nadie se pierda

Esto eran dos proyectos: `nexor-landing` (el fuente de la landing) y
`kallpabot-backoffice` (el HTML del panel, donde además se copiaba el resultado
del build). Tener el fuente y el sitio publicado en carpetas distintas hacía
imposible saber cuál mandaba, y editar el `index.html` publicado se perdía en la
siguiente publicación.

Se unieron aquí. Las carpetas viejas siguen a mano, sin borrar, por si hiciera
falta rescatar algo:

- `../kallpabot-backoffice.anterior/` — el panel antes de la unión, con sus
  huérfanos (los dos `.mp4`, `landing.css`, `landing.js`, las `login_foto`…:
  unos 9,5 MB que ya no referenciaba ninguna página).
- `../nexor-landing.anterior/` — el fuente antes de la última sincronización.
- `../inspo/` — proyecto Vite de referencia de diseño. No es parte del sitio.

Las dos `.anterior` ya se pueden borrar: todo lo que sigue vivo está en el
primer commit de este repositorio.

## Control de versiones

Este proyecto tiene **su propio repositorio**, igual que `../vendemia`.

`vendemia-root` es solo una carpeta paraguas que agrupa proyectos
independientes —el bot, la web, la referencia de diseño— y **no lleva git, ni
debe llevarlo**. Un repositorio ahí se tragaría los tres en una sola historia:
un cambio de copy en la landing y un arreglo del bot compartirían commits, y no
podrías versionar, etiquetar ni desplegar ninguno por separado.

`out/` está en `.gitignore`. Es el sitio construido: se regenera entero con
`npm run publicar`, y los nombres dentro de `_next/` llevan hash, así que
versionarlo solo produciría conflictos en cada build sin aportar nada que no se
pueda reconstruir en un minuto.

## ⚠️ Antes de publicar

| | Qué | Dónde |
|---|---|---|
| 1 | **La intro se repite en cada recarga.** En producción debe verse una vez por sesión. Está atado a `NODE_ENV`, así que `npm run build` lo apaga solo — pero si alguien lo fija a `true`, `audit.mjs` (comprobación 9) lo caza. | `REPLAY_INTRO_ON_RELOAD` en `app/layout.tsx` |
| 2 | Ejecutar `npm run typecheck`. | — |
| 3 | Resolver los 5 assets de prioridad alta. | `lib/assets.ts` |

Para probar el comportamiento real de la intro sin hacer build:
`?intro=0` la salta, `?intro=1` la fuerza.

---

## Estructura

```
app/
  layout.tsx            <html>, fuentes, metadatos y el script de la intro
  globals.css           tokens de la LANDING · M1/M2, reduced-motion
  panel.css             sistema de diseño del PANEL (el antiguo app.css)
  (landing)/
    layout.tsx          intro + Lenis + telón · solo para la landing
    page.tsx            orden de secciones y activación de M4
    dev/assets/page.tsx checklist de producción de assets
  (acceso)/login/       entrar y crear cuenta (Supabase Auth)
  (panel)/
    layout.tsx          sesión, guardia de entrada y barra lateral
    panel/              dashboard · mensajes · leads · agenda · métricas · ajustes
lib/supabase/
  client.ts             el único cliente (clave anon, nunca service_role)
  types.ts              los tipos del contrato
  parse.ts              0/1 → boolean, JSON en text, fechas
  queries.ts            TODA la lectura
  commands.ts           TODA la escritura: la cola de comandos
lib/panel/
  format.ts             etiquetas, colores, teléfonos y fechas
  charts.ts             SVG a mano · líneas, donut, sparkline
  agenda.ts             la rejilla semanal, calculada en el navegador
components/panel/       Sesión · Sidebar · Topbar · Avisos · useCargar
components/
  BrandIntro.tsx        sección 0 · el corte comercial
  Mark.tsx              el isotipo · avión de papel, Mia y avatar
  Navbar.tsx            barra completa ⇄ píldora flotante
  RevealHeading.tsx     M1 declarativo
  CascadeText.tsx       M1b declarativo · la cascada del wordmark
  Reveal.tsx            M2 declarativo
  AssetSlot.tsx         sistema de placeholders
  SmoothScroll.tsx      Lenis conduciendo el ticker de GSAP
  ui.tsx                Badge · DarkCard · RichParagraph · Starfield
  sections/             una por sección, 1 a 12
lib/
  content.ts            TODO el copy, tipado
  assets.ts             los 23 slots
  brand-assets.ts       GENERADO por scripts/logo.mjs
  motion.ts             M1–M5 y los tiempos medidos
public/brand/           GENERADO · los assets de marca
scripts/
  audit.mjs             auditoría contra el spec
  logo.mjs              genera public/brand/* y lib/brand-assets.ts
```

---

## Las 5 primitivas de movimiento

Todo el movimiento de la página sale de aquí. **No inventes animaciones fuera
de este set** — es lo único que mantiene coherentes 12 secciones.

| | Qué hace | Dónde |
|---|---|---|
| **M1** | Reveal de título por palabra: `opacity 0 · translateY(.4em) · scale(.96) · blur(8px)` → estado final. `0.70s · expo.out · stagger 0.06s` | todos los H1 y H2 |
| **M2** | Entrada direccional: cada elemento entra desde el borde **más cercano** a su posición final. `0.80s · cubic-bezier(.16,1,.3,1)` | todo lo demás |
| **M3** | Telón: un panel sube desde `translateY(100%)` y **cubre** lo de abajo, que no se mueve ni se desvanece. `1.1s · cubic-bezier(.4,0,.2,1)` | intro y transiciones |
| **M4** | Secciones apiladas con `sticky` + `scale .95` + `brightness .5` | solo secciones 1, 2 y 3 |
| **M5** | Marquee horizontal infinito, filas alternas, `30s linear` | chips de la sección 2 |

Con `prefers-reduced-motion: reduce` se desactivan las entradas y se paran los
loops. La intro directamente no corre.

---

## La intro (sección 0)

| Acto | t | Qué pasa |
|---|---|---|
| 1 · Llegada | 0.00 – 0.62 | el avión entra volando desde fuera de cuadro por la izquierda, inclinado −16° |
| 2 · Aterrizaje | — | **retirado.** Había un rebote de rotación con `elastic.out(1, .55)` que se leía como una sacudida |
| 3 · Reposo | 0.62 – 1.20 | silencio visual · 0.58 s |
| 4 · Lockup | 1.20 – 2.00 | el isotipo se encoge al 55 % y se va a la izquierda; desde 1.25 las 8 letras suben de opacidad en cascada, 64 ms entre cada una |
| — · Sostén | 2.00 – 2.30 | el lockup completo, quieto |
| 5 · Entrega | 2.30 – 3.00 | el telón sube y entierra el lockup |
| — · Relevo | 2.79 | al 70 % del telón arranca el hero |

**El avión se ve solo durante 1.25 s**, poco menos de la mitad del overlay. Era
1.55 s hasta que se recortó el reposo.

**El sostén no es tiempo sobrante, es el que faltaba.** Los 0.30 s que se
quitaron del reposo no acortaron la intro: se movieron al final. Antes la
cascada de 8 letras terminaba exactamente en 2.30 — justo cuando arranca el
telón—, así que el lockup completo solo se veía mientras la página ya lo estaba
tapando. Con el acto 4 en 1.20 vuelve a haber un instante de marca formada y
quieta, que es lo que el diseño pedía desde el principio y llevaba perdido
desde que el wordmark pasó de 5 letras a 8.

**Dónde me aparté de la tabla y por qué.** Medí la referencia fotograma a
fotograma a 30 fps. El telón real dura **0.26 s** — es rápido y crispado, no
lento. Lo que hace que la entrada se sienta elegante NO es un telón lento: es
el revelado posterior, que se toma más de un segundo y medio solo para el
titular, con un stagger entre palabras de **~0.18 s** (el brief decía 0.06 s;
con 0.06 las palabras aparecen casi a la vez y el efecto se pierde).

Valores actuales: telón `0.7s · cubic-bezier(0.4, 0, 0.2, 1)`, revelado por
palabra `0.8s` con stagger `0.16s`. El 0.26 s del original es sobre el viewport
pequeño del mockup; a pantalla completa el equivalente perceptivo son ~0.7 s.

**GSAP no parsea `cubic-bezier()`.** Eso lo hace el plugin CustomEase; sin él,
`gsap.parseEase('cubic-bezier(...)')` devuelve `undefined` y GSAP cae en
silencio a `power1.out`. Nunca te enteras. Por eso `lib/motion.ts` incluye su
propio solver (`cubicBezier()`, Newton-Raphson con bisección de respaldo, 20
líneas) y las curvas se pasan como funciones.

**El relevo al hero ocurre al 70 % del telón, no al final** (`CURTAIN_HANDOFF`).
Si esperas a que el panel se pare del todo, queda un instante de página quieta y
vacía antes de que aparezca nada, y ese hueco es la mitad de la sensación de
corte. Solapándolo, se lee como un solo gesto continuo: la página entra y el
contenido ya viene respirando dentro.

**Sobre los "2.70 s".** La tabla sitúa el arranque del telón en 2.30 s. Los
2.70 s son el momento en que el hero ya ocupa casi toda la pantalla y la intro
deja de leerse como intro. Si prefieres 2.70 s literales de overlay, baja
`CURTAIN_START` en `BrandIntro.tsx`.

**Tres cosas que parecen detalles y no lo son:**

1. El fondo de la intro es `#171717`, **no** negro puro. El hero es `#060200`.
   Ese salto de valor es lo único que hace visible el corte del telón. En negro
   puro la transición desaparece.
2. La salida no es fade ni zoom. El lockup se queda **quieto y a plena
   opacidad** mientras la página lo entierra. Tiene que verse un corte
   horizontal recto avanzando hacia arriba.
3. Cuando el telón va por la mitad, el isotipo del navbar repite en miniatura
   la llegada de la intro. La marca grande muere abajo y renace pequeña
   arriba. Es opcional; es lo que la hace memorable. Arriba es el avatar y
   abajo el dibujo completo: lo que el ojo sigue es el movimiento, no la
   silueta.

**Higiene** (ya implementada): una vez por sesión vía `sessionStorage`, botón
"Saltar" desde los 0.5 s, cualquier click o tecla la aborta, `prefers-reduced-motion`
la desactiva, y el hero se renderiza **debajo** del overlay desde el primer
paint para no destrozar el LCP.

---

## La marca · Mia

El logo es Mia, la mascota, y **no se edita a mano**: se genera desde el
original (`uploads/logo-principal.png`, azul sobre blanco) con

```bash
npm run logo        # node scripts/logo.mjs
```

El script hace cuatro cosas y las cuatro están comentadas en el fichero:

1. **quita el fondo** con flood fill desde los bordes — no con un umbral
   global de "casi blanco", que se comería la palabra "mia" que Mia lleva
   escrita en blanco en el pecho;
2. **recupera el borde**: los píxeles de antialias no llegan al umbral y se
   quedarían como halo blanco opaco, así que se les calcula alfa y se les
   deshace la mezcla contra el blanco;
3. **reentinta** el azul de marca `#0167F9` al naranja del sitio `#FF4900` con
   una rotación de matiz constante (−198.1°), que conserva saturación y
   luminosidad y por tanto los degradados del avión. La tinta navy de ojos,
   boca y contorno se queda como está, igual que en el logo de referencia;
4. **vectoriza**.

### Cómo se vectoriza

Trazar la imagen de una pasada no sirve: potrace es binario y daría una
silueta negra sin ojos ni contorno. Lo que hace que salga limpio es que el
dibujo, pese a parecer ilustrado, son **cuatro tintas planas** — medido con
k-means sobre los píxeles opacos: naranja 68 %, sombra del avión 14 %, tinta
navy 9 %, blanco 3 %; el resto son píxeles de antialias, no colores propios.
Así que se cuantiza a esas cuatro, se saca una máscara por tinta y se traza
cada una por separado.

Cuatro decisiones sostienen la calidad y el peso, y ninguna es obvia:

| | Por qué |
|---|---|
| Trazar al **doble** de resolución con reescalado suave | potrace umbraliza; sobre un borde duro de 1 px eso da curvas escalonadas |
| Máscaras **dilatadas** (umbral 168, no 128) | sin solape queda una costura de fondo de 1 px entre regiones vecinas: un pelo blanco recorriendo el contorno |
| **Filtro de minoría** antes de trazar | cuantizar manda cada píxel de antialias a la tinta más cercana y siembra miles de motas. Sin filtro el SVG pesaba 338 kB y el 40 % era la capa blanca — que en el dibujo es solo la palabra "mia" y los brillos de los ojos |
| **Redondear** las coordenadas a entero | potrace escribe 3 decimales; a escala 2, un entero son 0.5 px del original. Ahorra casi la mitad del fichero |

Resultado: **68 kB** el isotipo y **19 kB** el avatar (24 y 7 kB con gzip). El
avatar se traza aparte en vez de recortarse con el `viewBox`, que sería más
barato de generar pero le metería en el navbar los paths del avión entero.

Al ser vector, la variante azul de marca sale gratis: son los mismos paths con
otro mapa de relleno. Si aplicas la paleta de `PALETA.md`, usa los
`*-azul.svg` o cambia `SITE_ORANGE` por `BRAND_BLUE` y reejecuta.

### Qué genera

| Fichero | Para qué |
|---|---|
| `public/brand/mia.svg` | Mia sobre el avión. **Lo que usa la web.** Solo a partir de ~48 px |
| `public/brand/mia-avatar.svg` | Chispas + cabeza + mano. Legible desde 24 px |
| `public/brand/*-azul.svg` | Las dos anteriores en el azul de marca |
| `public/brand/mia*.png` | Rásteres para prensa, firmas de correo y foto de perfil |
| `public/brand/lockup*.webp` | Logo + wordmark (oscuro, claro y azul). Ráster: el wordmark no se vectoriza |
| `app/icon.svg` · `icon.png` · `apple-icon.png` · `opengraph-image.png` | Next los coge por convención |
| `lib/brand-assets.ts` | **Generado.** Las medidas de cada recorte |

### Dos reglas al usarlo

**Avatar en el cromo, dibujo completo cuando hay sitio.** Navbar, píldora,
menú móvil y footer van con el avatar; la intro con Mia entera. Por debajo de
48 px el avión de papel es una mancha naranja y la cara desaparece.

**`size` es la ALTURA, no el lado.** Ninguno de los dos recortes es cuadrado.
Cuadrarlos con relleno transparente hacía que el logo se viera pequeño y
descolgado junto al wordmark, porque el aire vacío contaba como tamaño. El
ancho lo calcula `<Mark>` con la proporción de `lib/brand-assets.ts`, que
escribe el mismo script que las imágenes — así no se pueden desincronizar.

`<Mark>` usa `<img>` y no `next/image` a propósito: `next/image` sirve para
elegir el tamaño de un ráster, y un SVG no tiene tamaño. Pasarlo por el
optimizador obligaría a activar `dangerouslyAllowSVG` sin ganar un byte.

---

## Assets pendientes

23 slots declarados, 0 resueltos. `<AssetSlot />` los pinta como placeholders
presentables — la maqueta se puede enseñar a cliente tal cual. Abre
`/dev/assets` en desarrollo para ver el checklist con las medidas reales a las
que se está renderizando cada uno.

| Prioridad | Slot | Formato |
|---|---|---|
| **Alta** | `hero.lightRay` | PNG alfa 1600×900, blend screen |
| **Alta** | `bentoA.globe` | WebM alfa loop 8 s, 800×800 |
| **Alta** | `global.globe` | WebM alfa loop 12 s, 1200×1200 |
| Media | `benefit.mediaCard` | JPG/WebP 880×1100 (4:5) |
| Media | `benefit.chipLogos` | 8 SVG a color 20px |
| Media | `bentoA.endpoint` | SVG diagrama de nodos |
| Media | `bentoB.privacy` · `.storage` · `.models` · `.gpu` | SVG/WebM 600×400 |
| Media | `bentoB.autoscale` | SVG circuito ancho 900×300 |
| Media | `useCases.*` (6) | PNG/WebP 600×400 |
| Baja | `playground.icons` | 4 SVG pastel 20px *(hoy con Lucide)* |
| Baja | `footer.nebula` · `.badges` · `.payments` | PNG alfa / SVG |

El globo animado es el activo más caro de la página. Alternativas por coste
descendente: WebM con alfa → canvas Three.js con `Points` sobre una esfera →
PNG estático con rotación CSS (se nota menos de lo que parece).

Para resolver uno: pon la `url` en `lib/assets.ts` y ya está. Ningún componente
hay que tocarlo.

---

## Decisiones que conviene conocer

**Tipografía.** Plus Jakarta Sans, variable (200–800), servida por
`next/font/google`. Toda la página cuelga de `--font-sans`, así que la familia
se cambia en un único sitio: el bloque de `next/font` en `layout.tsx`.

Hubo antes Inter con `ss01`/`cv11`, dos alternativas de glifo puestas para
imitar a Satoshi (la sans que pedía el diseño original, que no está en Google
Fonts). Al cambiar de familia esos ejes dejaron de significar nada y se
retiraron de `globals.css`. **No los devuelvas**: son ejes de Inter, y en otra
fuente o no existen o activan otra cosa. No dan error, simplemente dejan de
hacer lo que su nombre dice.

**Escala de radios cerrada.** `full · 8 · 12 · 16 · 24 · 28 · 32`. Nada
intermedio. Si dudas entre 18 y 20, es 24. Esa disciplina es la mitad de por
qué se ve limpio, y `scripts/audit.mjs` la comprueba.

**Botones.** Los del hero son píldoras de 40 px. Los de pricing son de 48 px
con radio 12. La distinción es deliberada: en el hero exploras, en pricing
decides.

**El playground rompe la paleta a propósito.** Verde, ámbar, azul y rosa
pastel en una página naranja y negra. Comunica "esto es un juguete, pruébalo".
No lo uniformes.

**El ritmo de fondos.** `dark → cream → dark → dark → dark → cream → cream →
dark → dark → gradiente → dark → dark`. Ese contraste es el 70 % del impacto
visual. Convertir esto en "una landing toda oscura" la mata.

**El hero es solo tipografía sobre el rayo de luz.** Hubo un diagrama de
circuito con un chip "MIA", seis nodos y pulsos recorriendo los trazos. Se
retiró: el hero es titular, párrafo y botones, y nada más. Si alguien propone
volver a llenar esa mitad inferior, que sea una decisión, no una inercia.

**El isotipo es el avión de papel, y su geometría vive en `lib/plane.ts`.** La
consumen tres sitios en formatos distintos: `Mark.tsx` (inline en React),
`app/icon.svg` (documento cuadrado) y `scripts/logo.mjs` (que rasteriza ese
SVG a los PNG). Un solo módulo para que mover un vértice se propague a los
tres. Y `logo.mjs` **ya no genera** el icono: solo lo rasteriza — antes lo
sobrescribía con el avatar en cada ejecución, revirtiendo en silencio una
decisión de diseño que a 16 px nadie revisa.

---

## Seis bugs que costó un vídeo detectar

Están cerrados, y `scripts/audit.mjs` (comprobación 9) falla si alguno vuelve.
Los dejo escritos porque son trampas nada obvias:

**F1 · `translateY(100%)` en un wrapper de página entera.** Es el 100 % de la
altura *del propio elemento*, y `.page-curtain` envuelve toda la página: unos
15 000 px. El telón recorría 15 000 px en el tiempo de uno — ~14 000 px/s. Eso
no se ve como un deslizamiento, se ve como un parpadeo. **Era la causa real del
"corte brusco"**, no la curva de easing. Ahora es `100vh`, y en GSAP `y` en
píxeles en vez de `yPercent` (que tiene el mismo problema).

**F2 · Estados iniciales en el `useEffect` en vez de en CSS.** Entre el primer
paint y la ejecución del efecto hay una ventana — en desarrollo, medio segundo
largo — en la que se veía el lockup **ya terminado**. Es decir, se veía el final
de la animación antes del principio, y luego arrancaba desde cero.

**F3 · Espacios comidos en los titulares.** `.word` es `display: inline-block`
y un espacio final dentro de una caja inline-block se colapsa. El H1 se
renderizaba literalmente como `Inferenciaqueocurredondeestátuusuario`. El
espacio tiene que ir *entre* los spans, no dentro.

**F4 · GSAP ignora `transform-box: fill-box` en SVG.** Gestiona los transforms
de SVG por su cuenta. La barra del isotipo se escalaba respecto a un origen que
no era el suyo y acababa fuera de vista: **el monograma nunca llegaba a formar
la G**. Ahora la barra y el disco se animan por atributos (`x`/`width` y `r`),
que no dependen del origen de transformación.

**F5 · ScrollTrigger midiendo con la página desplazada.** Los triggers se
creaban durante la intro, con la página un viewport más abajo, así que cacheaban
posiciones erróneas. Al quitar el transform, el apilado (M4) creía estar más
avanzado de lo que estaba y aplicaba `brightness(0.5)` sobre el hero — que
aparecía **negro y vacío**, como si no hubiera renderizado. Ahora el apilado
espera al evento `nexor:intro-settled` y refresca antes de crearse.

**F6 · Restauración de scroll del navegador.** Tres síntomas que parecían bugs
distintos y eran el mismo: (a) el navbar asomando por encima de la intro,
(b) las secciones apiladas viéndose *fusionadas* — una franja oscura arriba y
la sección crema debajo — y (c) la intro terminando en mitad de la página en
lugar de en el hero.

Causa única: al recargar, el navegador restaura `scrollY`. Y como el navbar es
`position: fixed` **dentro** de `.page-curtain`, que durante la intro está
trasladado 100vh, su bloque contenedor es la cortina: con `scrollY ≈ 100vh` el
navbar aterriza exactamente en el borde superior del viewport. Lo mismo explica
lo demás — al levantarse el telón estabas donde estabas antes, con dos sticky
solapadas.

Arreglo: `history.scrollRestoration = 'manual'` en el script bloqueante (tiene
que ir antes de que el navegador restaure), `window.scrollTo(0, 0)` al empezar
y al terminar la intro, y **Lenis parado durante la intro** — mantiene su propia
posición interna y, si sigue vivo, deshace el reset y te devuelve a donde
estabas.

> Efecto secundario a tener en cuenta: con `scrollRestoration: 'manual'` toda
> recarga empieza arriba, también en producción. En una landing de una sola
> página es lo que se quiere; si algún día esto crece a varias rutas, habrá que
> acotarlo.

---

## Pendiente / puntos flojos conocidos

- **`npm run typecheck` sin ejecutar.** Ver arriba.
- **Sub-nav de anclas de la sección 2.** Es `sticky` dentro de una sección
  `.stacked`, que tiene `overflow: hidden`. Eso rompe el sticky del
  descendiente y cae a flujo normal. Se ve bien, pero no se pega. Si lo quieres
  pegado de verdad, sácalo del contenedor apilado.
- **Las micro-animaciones en loop de las tarjetas bento** (destellos, pulsos)
  están solo en la tarjeta de autoescalado; el resto espera a su asset.
- **`content-visibility: auto`** está en las secciones bajo el fold. Si notas
  saltos en la barra de scroll, ajusta `contain-intrinsic-size` en
  `globals.css`.

---

## Orden sugerido para seguir

1. Resolver los assets de prioridad alta — es lo que cambia la percepción.
2. Escribir el copy definitivo en `lib/content.ts` (la estructura ya está;
   respeta el número de palabras de cada H2 para que la maqueta no se
   descuadre).
4. Pasar Lighthouse y ajustar el LCP del hero.
