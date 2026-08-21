/**
 * GENERADOR DE ILUSTRACIONES · node scripts/ilustraciones.mjs
 *
 * Escribe los SVG de public/ilustraciones/. Son un GENERADOR y no quince
 * ficheros sueltos por un motivo concreto: lo que hace que una página parezca
 * diseñada y no montada con piezas de sitios distintos es que todas las
 * ilustraciones compartan vocabulario. Aquí ese vocabulario son funciones
 * —`burbuja`, `panel`, `chip`, `lineas`— y por tanto no se puede desviar por
 * descuido. Si mañana el naranja de marca cambia, se cambia en UNA constante y
 * las quince se rehacen iguales.
 *
 * ── DECISIONES QUE PARECEN ARBITRARIAS Y NO LO SON ────────────────────────
 *
 * 1 · NADA DE TEXTO LARGO. Un SVG servido dentro de <img> NO puede cargar la
 *     tipografía de la página: el navegador lo aísla y Plus Jakarta Sans no
 *     llega. Cae en la del sistema, que es distinta en cada equipo. Por eso
 *     aquí solo hay cifras y palabras muy cortas ("30s", "24h", "10:00"), y
 *     todo lo demás son barras: una barra gris se lee como "texto" en
 *     cualquier idioma y no se descuadra nunca.
 *
 * 2 · LO IMPORTANTE, ARRIBA. Las de bentoB se pintan dentro de una ventana de
 *     150px sobre un elemento de 200px, o sea que el cuarto inferior del lienzo
 *     NO SE VE: la tarjeta lo recorta. Ahí abajo solo va relleno.
 *
 * 3 · LAS OSCURAS SANGRAN. En BentoA/BentoB la ilustración se sale de la
 *     tarjeta por los bordes (-mx-7 -mb-7), así que su fondo tiene que ser
 *     exactamente el de la tarjeta (--surface-800) o se ve un escalón.
 *
 * ── LO QUE NO SE GENERA AQUÍ, Y POR QUÉ ───────────────────────────────────
 * `footer.badges` (sellos de certificación) y `footer.payments` (logos de
 * medios de pago). Los primeros serían certificaciones inventadas y los
 * segundos, marcas registradas de terceros redibujadas. Ninguna de las dos
 * cosas se dibuja: los sellos hay que tenerlos, y los logos hay que pedirlos a
 * Yape/Visa y usar sus originales.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = resolve(AQUI, '..', 'public', 'ilustraciones');

/* ── Paleta · los mismos valores que globals.css ─────────────────────── */
const NARANJA = '#FF4900';
const BRASA = '#FF7A18';
const TARJETA = '#0A0A0A'; // --surface-800, el fondo de DarkCard
const SUPERFICIE = '#141414'; // --surface-700
const BORDE = '#242424';
const GRIS = '#8A8A8A';
const GRIS_TENUE = '#2E2E2E';
const CREMA = '#F1F1EE';
const BORDE_CLARO = '#E4E4DE';
const TINTA = '#0A0A0A';
const GRIS_CLARO = '#D8D8D2';

/* ══════════════════════════════════════════════════════════════════════
   VOCABULARIO COMÚN
   ══════════════════════════════════════════════════════════════════════ */

const rr = (x, y, w, h, r, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;

/** Una barra que representa una línea de texto. Ver la nota 1 de arriba. */
const linea = (x, y, w, fill, h = 7) => rr(x, y, w, h, h / 2, fill);

const lineas = (x, y, anchos, fill, { h = 7, sep = 13 } = {}) =>
  anchos.map((w, i) => linea(x, y + i * sep, w, fill, h)).join('');

/**
 * Burbuja de conversación. `lado` decide de quién es el mensaje:
 * izquierda = el cliente, derecha = Mia. Es la convención de cualquier app de
 * mensajería y por eso no hace falta explicarla en ningún sitio.
 * La esquina cuadrada (la del "pico") es lo que la hace leerse como burbuja y
 * no como una tarjeta.
 */
function burbuja({ x, y, w, h, lado = 'izq', fondo, borde = null, r = 14 }) {
  const pico = 4;
  const d =
    lado === 'izq'
      ? `M${x + r},${y} h${w - r * 2} a${r},${r} 0 0 1 ${r},${r} v${h - r * 2} a${r},${r} 0 0 1 -${r},${r} h-${w - r - pico} a${pico},${pico} 0 0 1 -${pico},-${pico} v-${h - pico - r} a${r},${r} 0 0 1 ${r},-${r} z`
      : `M${x + r},${y} h${w - r - pico} a${pico},${pico} 0 0 1 ${pico},${pico} v${h - pico - r} a${r},${r} 0 0 1 -${r},${r} h-${w - r * 2} a${r},${r} 0 0 1 -${r},-${r} v-${h - r * 2} a${r},${r} 0 0 1 ${r},-${r} z`;
  return `<path d="${d}" fill="${fondo}"${borde ? ` stroke="${borde}" stroke-width="1"` : ''}/>`;
}

/** Píldora con texto corto. Para estados: "Confirmado", "30s", "24h". */
function chip(x, y, texto, { fondo = NARANJA, color = '#1A0A00', fs = 15, pad = 14, h = 30 } = {}) {
  const w = texto.length * fs * 0.62 + pad * 2;
  return (
    rr(x, y, w, h, h / 2, fondo) +
    `<text x="${x + w / 2}" y="${y + h / 2}" fill="${color}" font-size="${fs}" font-weight="700"
       font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
       text-anchor="middle" dominant-baseline="central">${texto}</text>`
  );
}

const texto = (x, y, t, { fill = '#fff', fs = 16, peso = 600, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-size="${fs}" font-weight="${peso}"
     font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
     text-anchor="${anchor}" dominant-baseline="central">${t}</text>`;

/** El tic doble de "mensaje leído". Detalle pequeño que ancla el motivo. */
const visto = (x, y, color = BRASA) =>
  `<path d="M${x},${y + 4} l4,4 l8,-9 M${x + 7},${y + 4} l4,4 l8,-9" fill="none" stroke="${color}"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

/**
 * Envoltorio: viewBox, fondo y un resplandor naranja de marca.
 *
 * ⚠️ `fondo: null` = TRANSPARENTE, y hay que usarlo siempre que la ilustración
 * NO viva dentro de una tarjeta. Pintar un fondo opaco sobre el negro de la
 * página no se nota en el SVG suelto pero en pantalla dibuja un RECTÁNGULO
 * visible: el #0A0A0A de la tarjeta es más claro que el #000 de la sección.
 * Le pasaba a la esfera de 24 h, que se veía metida en una caja gris.
 */
function lienzo(w, h, cuerpo, { fondo = TARJETA, brillo = true, claro = false } = {}) {
  const halo = brillo
    ? `<circle cx="${claro ? w * 0.18 : w * 0.82}" cy="${h * 0.16}" r="${w * 0.42}" fill="url(#halo)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
  <defs>
    <radialGradient id="halo">
      <stop offset="0" stop-color="${NARANJA}" stop-opacity="${claro ? 0.14 : 0.22}"/>
      <stop offset="1" stop-color="${NARANJA}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${fondo ? `<rect width="${w}" height="${h}" fill="${fondo}"/>` : ''}
  ${halo}
  ${cuerpo}
</svg>`;
}

/* ══════════════════════════════════════════════════════════════════════
   CASOS DE USO · 600x380, fondo claro
   Plantilla común: un glifo grande del sector a la izquierda y, a la derecha,
   la conversación que ese sector tiene de verdad. Lo que cambia entre las seis
   es el glifo y el remate; el esqueleto es el mismo para que la fila de seis se
   lea como una serie y no como seis imágenes distintas.

   ⚠️ 600x380 Y NO 600x400. La caja donde se pintan mide 379x240, o sea 1.579
   de proporción. Con un lienzo 3:2 (1.5) el `object-cover` recortaba por los
   lados: se comía el disco del glifo por la izquierda y el pico de la burbuja
   naranja por la derecha. 600/380 = 1.579 clavado, así que ya no recorta nada.
   Si cambias el alto de la caja en UseCases.tsx, cambia también este lienzo.
   ══════════════════════════════════════════════════════════════════════ */

function casoDeUso({ glifo, remate, acentoRemate = NARANJA }) {
  const hilo =
    burbuja({ x: 262, y: 46, w: 226, h: 60, lado: 'izq', fondo: '#FFFFFF', borde: BORDE_CLARO }) +
    lineas(284, 66, [150, 104], GRIS_CLARO, { h: 8, sep: 16 }) +
    burbuja({ x: 300, y: 130, w: 258, h: 80, lado: 'der', fondo: NARANJA }) +
    lineas(322, 152, [196, 148], 'rgba(255,255,255,.62)', { h: 8, sep: 17 }) +
    visto(524, 188, '#FFD9C4');
  return lienzo(
    600,
    380,
    `<g opacity="0.9">${glifo}</g>
     ${hilo}
     <g transform="translate(262,268)">${remate(acentoRemate)}</g>`,
    { fondo: CREMA, claro: true }
  );
}

/** Marco redondo claro para el glifo del sector. */
const disco = (contenido) =>
  `<circle cx="136" cy="176" r="92" fill="#FFFFFF"/>
   <circle cx="136" cy="176" r="92" fill="none" stroke="${BORDE_CLARO}" stroke-width="1.5"/>
   <g transform="translate(136,176)" fill="none" stroke="${TINTA}" stroke-width="6"
      stroke-linecap="round" stroke-linejoin="round">${contenido}</g>`;

/** Remate: fila de horas con una elegida. Sirve para todo lo que es "agenda". */
const remateHoras = (horas, elegida) => (acento) =>
  horas
    .map((hh, i) => {
      const activa = i === elegida;
      return (
        rr(i * 78, 0, 66, 40, 13, activa ? acento : '#FFFFFF', activa ? '' : `stroke="${BORDE_CLARO}"`) +
        texto(i * 78 + 33, 20, hh, { fill: activa ? '#1A0A00' : GRIS, fs: 14, peso: 700, anchor: 'middle' })
      );
    })
    .join('');

/** Remate: barra de progreso con etiqueta. Para lo que es "estado". */
const remateBarra = (etiqueta, pct) => (acento) =>
  `<rect x="0" y="0" width="290" height="14" rx="7" fill="#FFFFFF" stroke="${BORDE_CLARO}"/>` +
  rr(2, 2, (290 - 4) * pct, 10, 5, acento) +
  texto(0, 36, etiqueta, { fill: GRIS, fs: 15, peso: 600 });

const CASOS = {
  // Barberías · tijeras
  'useCases.it': casoDeUso({
    glifo: disco(`<circle cx="-26" cy="26" r="13"/><circle cx="26" cy="26" r="13"/>
                  <path d="M-16,17 L30,-34 M16,17 L-30,-34"/>`),
    remate: remateHoras(['10:00', '11:30', '16:00', '18:30'], 2),
  }),
  // Clínicas · cruz médica dentro de un escudo
  'useCases.retail': casoDeUso({
    glifo: disco(`<path d="M0,-42 L38,-24 V6 C38,30 20,42 0,48 C-20,42 -38,30 -38,6 V-24 Z"/>
                  <path d="M0,-14 V22 M-18,4 H18"/>`),
    remate: remateHoras(['Lun', 'Mar', 'Mié', 'Jue'], 1),
  }),
  // E-commerce · bolsa de compra
  'useCases.auto': casoDeUso({
    glifo: disco(`<path d="M-34,-14 H34 L28,44 H-28 Z"/><path d="M-16,-14 V-28 A16,16 0 0 1 16,-28 V-14"/>`),
    remate: remateBarra('Pagado con Yape', 1),
  }),
  // Gimnasios · mancuerna
  'useCases.gaming': casoDeUso({
    glifo: disco(`<path d="M-40,-18 V18 M-24,-30 V30 M24,-30 V30 M40,-18 V18 M-24,0 H24"/>`),
    remate: remateBarra('Membresía renovada', 0.82),
  }),
  // Restaurantes · tenedor y cuchillo
  'useCases.hospitality': casoDeUso({
    glifo: disco(`<path d="M-24,-42 V-8 A10,10 0 0 0 -4,-8 V-42 M-14,-8 V42 M22,-42 C34,-30 34,-8 22,-2 V42"/>`),
    remate: remateHoras(['19:00', '20:00', '21:30', '22:00'], 1),
  }),
  // Inmobiliarias · casa con llave
  'useCases.manufacturing': casoDeUso({
    glifo: disco(`<path d="M-42,-2 L0,-40 L42,-2 V42 H-42 Z"/><path d="M-12,42 V12 H12 V42"/>`),
    remate: remateHoras(['Sáb 11', 'Sáb 13', 'Dom 10', 'Dom 12'], 0),
  }),
};

/* ══════════════════════════════════════════════════════════════════════
   BENTO B · 600x400 (y una de 900x300). Oscuras y sangran.
   ══════════════════════════════════════════════════════════════════════ */

/** Reloj de aguja. La aguja marca poco recorrido = "ha pasado nada de tiempo". */
const reloj = (cx, cy, r, angulo) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${GRIS_TENUE}" stroke-width="8"/>
   <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${NARANJA}" stroke-width="8"
     stroke-linecap="round" stroke-dasharray="${2 * Math.PI * r}"
     stroke-dashoffset="${2 * Math.PI * r * (1 - angulo)}"
     transform="rotate(-90 ${cx} ${cy})"/>`;

const BENTO_B = {
  // "Responde en 30 segundos" · el cronómetro apenas ha avanzado
  'bentoB.privacy': lienzo(
    600,
    400,
    `${burbuja({ x: 40, y: 40, w: 250, h: 60, lado: 'izq', fondo: SUPERFICIE, borde: BORDE })}
     ${lineas(62, 60, [170, 118], GRIS_TENUE)}
     ${burbuja({ x: 250, y: 122, w: 310, h: 74, lado: 'der', fondo: NARANJA })}
     ${lineas(272, 144, [250, 190], 'rgba(255,255,255,.6)')}
     ${visto(524, 172, '#FFD9C4')}
     ${reloj(112, 268, 44, 0.085)}
     ${texto(112, 268, '30s', { fill: '#fff', fs: 26, anchor: 'middle', peso: 700 })}
     ${texto(180, 254, 'respondido', { fill: GRIS, fs: 17 })}
     ${lineas(180, 276, [150], GRIS_TENUE)}`
  ),

  // 'Rescata al que dijo "ya te aviso"' · línea de tiempo con el regreso a 24h
  'bentoB.storage': lienzo(
    600,
    400,
    `${burbuja({ x: 40, y: 34, w: 230, h: 54, lado: 'izq', fondo: SUPERFICIE, borde: BORDE })}
     ${lineas(62, 52, [150, 96], GRIS_TENUE)}
     <path d="M70,110 V210" stroke="${GRIS_TENUE}" stroke-width="3" stroke-dasharray="7 9" stroke-linecap="round"/>
     <circle cx="70" cy="110" r="9" fill="${GRIS_TENUE}"/>
     <circle cx="70" cy="210" r="11" fill="${NARANJA}"/>
     ${chip(96, 144, '24 h', { fondo: 'rgba(255,73,0,.16)', color: BRASA, fs: 14, h: 26 })}
     ${burbuja({ x: 104, y: 186, w: 320, h: 74, lado: 'der', fondo: NARANJA })}
     ${lineas(126, 208, [260, 200], 'rgba(255,255,255,.6)')}
     ${texto(40, 306, 'vuelve una sola vez', { fill: GRIS, fs: 17 })}`
  ),

  // "Sabe de tu negocio desde el primer día" · tres perfiles, uno activo
  'bentoB.models': lienzo(
    600,
    400,
    [0, 1, 2]
      .map((i) => {
        const y = 40 + i * 92;
        const activo = i === 1;
        return (
          rr(40, y, 500, 72, 18, activo ? 'rgba(255,73,0,.10)' : SUPERFICIE, `stroke="${activo ? NARANJA : BORDE}"`) +
          rr(64, y + 18, 36, 36, 12, activo ? NARANJA : GRIS_TENUE) +
          lineas(120, y + 22, [activo ? 210 : 160], activo ? '#FFFFFF' : GRIS_TENUE, { h: 9 }) +
          lineas(120, y + 42, [120], GRIS_TENUE, { h: 7 }) +
          (activo ? `<path d="M486,${y + 32} l7,7 l14,-15" fill="none" stroke="${NARANJA}" stroke-width="4"
             stroke-linecap="round" stroke-linejoin="round"/>` : '')
        );
      })
      .join('')
  ),

  // "Sabes cómo va el negocio sin abrir nada" · resumen nocturno, formato ancho
  'bentoB.autoscale': lienzo(
    900,
    300,
    `${rr(40, 34, 820, 200, 22, SUPERFICIE, `stroke="${BORDE}"`)}
     ${rr(40, 34, 820, 52, 22, 'rgba(255,73,0,.08)')}
     <circle cx="72" cy="60" r="10" fill="${NARANJA}"/>
     ${lineas(96, 56, [190], GRIS, { h: 9 })}
     ${texto(824, 60, '22:00', { fill: GRIS, fs: 15, anchor: 'end' })}
     ${[
       ['escribieron', 0.92],
       ['agendaron', 0.64],
       ['cerraron', 0.41],
     ]
       .map(([, pct], i) => {
         const x = 76 + i * 262;
         return (
           lineas(x, 118, [110], GRIS_TENUE, { h: 8 }) +
           rr(x, 140, 220, 12, 6, GRIS_TENUE) +
           rr(x, 140, 220 * pct, 12, 6, i === 0 ? NARANJA : i === 1 ? BRASA : '#FFB067') +
           rr(x, 172, 60 + i * 8, 20, 6, 'rgba(255,255,255,.06)')
         );
       })
       .join('')}`
  ),

  // "Listo en 10 minutos" · tres pasos, dos hechos, y el contador
  'bentoB.gpu': lienzo(
    600,
    400,
    `${[0, 1, 2]
      .map((i) => {
        const y = 44 + i * 76;
        const hecho = i < 2;
        return (
          `<circle cx="72" cy="${y + 22}" r="20" fill="${hecho ? NARANJA : 'none'}"
             stroke="${hecho ? 'none' : GRIS_TENUE}" stroke-width="4"/>` +
          (hecho
            ? `<path d="M63,${y + 22} l6,6 l13,-14" fill="none" stroke="#1A0A00" stroke-width="4"
                 stroke-linecap="round" stroke-linejoin="round"/>`
            : '') +
          lineas(112, y + 12, [hecho ? 250 : 180], hecho ? '#FFFFFF' : GRIS_TENUE, { h: 9 }) +
          lineas(112, y + 32, [150], GRIS_TENUE, { h: 7 }) +
          (i < 2 ? `<path d="M72,${y + 46} V${y + 76}" stroke="${GRIS_TENUE}" stroke-width="3"/>` : '')
        );
      })
      .join('')}
     ${/* El contador va a media altura, NO arriba del todo. La tarjeta solo
           enseña la banda central del lienzo (ver la nota 2 de la cabecera), y
           puesto en y=66 el "10:00" quedaba por encima del recorte: se veía
           "minutos" suelto y sin la cifra, que es justo lo que dice el título. */ ''}
     ${texto(468, 168, '10:00', { fill: NARANJA, fs: 40, peso: 800, anchor: 'end' })}
     ${texto(468, 200, 'minutos', { fill: GRIS, fs: 16, anchor: 'end' })}`
  ),
};

/* ══════════════════════════════════════════════════════════════════════
   BENTO A · el mecanismo
   ══════════════════════════════════════════════════════════════════════ */

const BENTO_A = {
  /**
   * "Maneja la objeción sin pasártela a ti" · la objeción entra y sale cerrada.
   *
   * ⚠️ TODO TIENE QUE CABER ENTRE y=45 e y=390. La tarjeta enseña 280px de un
   * elemento de 360 y el object-cover ya se ha comido 37px por arriba, así que
   * del lienzo de 540 solo se ve esa banda. La versión anterior remataba con
   * una cuarta burbuja en y=400: quedaba ENTERA fuera, y con ella el "Cerrado"
   * — o sea que la ilustración contaba la objeción y se callaba el final, que
   * es lo único que la sección quiere demostrar.
   * Ahora son tres burbujas y el cierre lo da el chip, que ocupa una quinta
   * parte y entra de sobra.
   */
  'bentoA.globe': lienzo(
    960,
    540,
    `${/* La primera burbuja arranca en 76 y no en 54: a 54 su borde superior
           caía justo en la línea del recorte y se leía pegada al párrafo de la
           tarjeta, como si el texto se le montara encima. */ ''}
     ${burbuja({ x: 70, y: 76, w: 330, h: 74, lado: 'izq', fondo: SUPERFICIE, borde: BORDE })}
     ${texto(96, 113, '"déjame pensarlo"', { fill: '#FFFFFF', fs: 22 })}
     ${burbuja({ x: 380, y: 168, w: 510, h: 96, lado: 'der', fondo: NARANJA })}
     ${lineas(408, 194, [440, 370], 'rgba(255,255,255,.62)', { h: 9, sep: 18 })}
     ${visto(848, 238, '#FFD9C4')}
     ${burbuja({ x: 70, y: 282, w: 286, h: 60, lado: 'izq', fondo: SUPERFICIE, borde: BORDE })}
     ${lineas(96, 301, [190, 128], GRIS_TENUE)}
     ${chip(70, 356, 'Cerrado', { fs: 17, h: 36 })}
     ${visto(214, 370, BRASA)}`
  ),

  // "Agenda y confirma sola" · rejilla de horas con una elegida y confirmada
  'bentoA.endpoint': lienzo(
    600,
    600,
    `${rr(70, 70, 460, 400, 26, SUPERFICIE, `stroke="${BORDE}"`)}
     ${rr(70, 70, 460, 66, 26, 'rgba(255,73,0,.08)')}
     ${lineas(102, 96, [150], GRIS, { h: 10 })}
     <circle cx="486" cy="103" r="9" fill="${NARANJA}"/>
     ${Array.from({ length: 12 }, (_, i) => {
       const c = i % 4;
       const f = Math.floor(i / 4);
       const x = 102 + c * 102;
       const y = 168 + f * 84;
       const elegida = i === 6;
       return (
         rr(x, y, 84, 60, 16, elegida ? NARANJA : 'rgba(255,255,255,.04)', elegida ? '' : `stroke="${BORDE}"`) +
         linea(x + 22, y + 26, 40, elegida ? 'rgba(26,10,0,.55)' : GRIS_TENUE, 8)
       );
     }).join('')}
     ${chip(102, 402, 'Confirmado', { fs: 15 })}
     ${visto(240, 415, BRASA)}`
  ),
};

/* ══════════════════════════════════════════════════════════════════════
   RESTO
   ══════════════════════════════════════════════════════════════════════ */

const OTRAS = {
  // "Tu negocio cierra a las 8. Mia no cierra nunca." · esfera de 24 h siempre
  // encendida. Sustituye al globo giratorio: el argumento es el horario, no la
  // geografía — Vendemia vende en Perú, no en el mundo.
  /**
   * ⚠️ FONDO TRANSPARENTE Y CENTRO ALTO. Dos cosas, las dos medidas en pantalla:
   *
   *  · va suelta sobre el fondo de la sección, no dentro de una tarjeta, así
   *    que un fondo opaco dibuja un rectángulo gris clarito sobre el negro
   *    puro. Se veía perfectamente, como una caja alrededor del dibujo.
   *  · la sección la baja un 12 % (`translate-y-[12%]`) para que se hunda por
   *    abajo, que es el efecto buscado. Con el centro a media altura, ese
   *    hundimiento se comía el "24/7". Centrada en y=520 en vez de 600, se
   *    hunde el aro y la cifra se queda dentro.
   */
  'global.globe': lienzo(
    1200,
    1200,
    `<circle cx="600" cy="520" r="430" fill="none" stroke="${GRIS_TENUE}" stroke-width="2"/>
     <circle cx="600" cy="520" r="352" fill="none" stroke="${GRIS_TENUE}" stroke-width="2"/>
     ${Array.from({ length: 24 }, (_, i) => {
       const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
       const x1 = 600 + Math.cos(a) * 352;
       const y1 = 520 + Math.sin(a) * 352;
       const x2 = 600 + Math.cos(a) * 430;
       const y2 = 520 + Math.sin(a) * 430;
       // Las 24 marcas están TODAS encendidas: ese es literalmente el argumento
       // de la sección. Las de las 0, 6, 12 y 18 h más gruesas para que se lea
       // como un reloj y no como un sol.
       return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${NARANJA}"
         stroke-width="${i % 6 === 0 ? 10 : 5}" stroke-linecap="round" opacity="${i % 6 === 0 ? 1 : 0.5}"/>`;
     }).join('')}
     <circle cx="600" cy="520" r="300" fill="url(#halo)"/>
     <circle cx="600" cy="520" r="230" fill="${SUPERFICIE}" stroke="${BORDE}" stroke-width="2"/>
     ${texto(600, 490, '24/7', { fill: '#FFFFFF', fs: 132, peso: 800, anchor: 'middle' })}
     ${rr(492, 576, 216, 4, 2, GRIS_TENUE)}
     ${texto(600, 626, 'siempre abierto', { fill: GRIS, fs: 40, anchor: 'middle' })}
     <circle cx="600" cy="290" r="22" fill="${NARANJA}"/>`,
    { brillo: false, fondo: null }
  ),

  /**
   * Media de la calculadora · la cuenta que el negocio no ve: las
   * conversaciones que llegaron y nunca se contestaron.
   *
   * ⚠️ LIENZO CUADRADO Y ZONA SEGURA ESTRECHA. La caja mide 403px de ancho por
   * un alto ELÁSTICO —`clamp(260px, 44vh, 503px)`— o sea que su proporción va
   * de 1.55 a 0.80 según la ventana. No hay un lienzo que le venga bien a las
   * dos, así que se dibuja cuadrado y se respeta la zona que sobrevive a los
   * dos extremos del recorte: x ∈ [90, 810], y ∈ [160, 740].
   *
   * Y no lleva texto. Lo llevaba —"5 de 7 sin responder", abajo del todo— y en
   * la caja ancha caía fuera del recorte; además esa esquina la tapa el
   * degradado del pie de foto. El mensaje lo dan las cruces.
   */
  'benefit.mediaCard': lienzo(
    900,
    900,
    Array.from({ length: 6 }, (_, i) => {
      const y = 176 + i * 94;
      const perdida = i > 1;
      const w = 400 + (i % 3) * 54;
      return (
        burbuja({
          x: 110,
          y,
          w,
          h: 72,
          lado: 'izq',
          fondo: perdida ? 'rgba(255,255,255,.03)' : SUPERFICIE,
          borde: perdida ? '#1E1E1E' : BORDE,
        }) +
        lineas(138, y + 22, [w - 130, w - 230], perdida ? '#1C1C1C' : GRIS_TENUE, { h: 9, sep: 22 }) +
        (perdida
          ? `<g><circle cx="${110 + w + 46}" cy="${y + 36}" r="19" fill="none" stroke="${NARANJA}" stroke-width="3"/>
             <path d="M${110 + w + 38},${y + 28} l16,16 M${110 + w + 54},${y + 28} l-16,16"
               stroke="${NARANJA}" stroke-width="3" stroke-linecap="round"/></g>`
          : visto(110 + w + 34, y + 46, BRASA))
      );
    }).join(''),
    { brillo: false }
  ),
};

/* ══════════════════════════════════════════════════════════════════════ */

const TODAS = { ...CASOS, ...BENTO_B, ...BENTO_A, ...OTRAS };

mkdirSync(SALIDA, { recursive: true });

let n = 0;
for (const [id, svg] of Object.entries(TODAS)) {
  const nombre = id.replace('.', '-') + '.svg';
  writeFileSync(resolve(SALIDA, nombre), svg.replace(/\n\s+/g, '\n') + '\n', 'utf8');
  console.log(`  ✓ ${nombre.padEnd(30)} ${(svg.length / 1024).toFixed(1)} KB`);
  n++;
}
console.log(`\n${n} ilustraciones en public/ilustraciones/`);
console.log('Recuerda: footer.badges y footer.payments NO se generan (ver cabecera).');
