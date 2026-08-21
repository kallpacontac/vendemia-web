#!/usr/bin/env node
/**
 * Auditoría estática contra el spec. No sustituye a `tsc`, pero sí caza los
 * errores que más se cuelan en una maqueta larga: radios fuera de escala,
 * colores hardcodeados, ids de asset inventados y el ritmo de fondos roto.
 *
 *   node scripts/audit.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const files = [];

(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', 'scripts'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.tsx', '.ts', '.css'].includes(extname(p))) files.push(p);
  }
})(ROOT);

const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => p.replace(ROOT, '');

let errors = 0;
let warnings = 0;
const fail = (msg) => { errors++; console.log(`  ✗ ${msg}`); };
const warn = (msg) => { warnings++; console.log(`  ! ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ── 1 · Escala de radios cerrada ───────────────────────────
console.log('\n1 · Escala de radios (full · 8 · 12 · 16 · 24 · 28 · 32)');
{
  const ALLOWED = new Set(['8', '12', '16', '24', '28', '32', '9999', '4', '2']);
  let bad = 0;
  for (const f of files.filter((f) => f.endsWith('.tsx'))) {
    const src = read(f);
    for (const m of src.matchAll(/rounded-\[(\d+)px\]|border-radius:\s*(\d+)px/g)) {
      const v = m[1] ?? m[2];
      if (!ALLOWED.has(v)) { fail(`${rel(f)} usa radio ${v}px, fuera de la escala`); bad++; }
    }
  }
  if (!bad) ok('ningún radio fuera de la escala');
}

// ── 2 · Colores hardcodeados ───────────────────────────────
console.log('\n2 · Colores: todo debe venir de las CSS vars');
{
  const TOKENS = read(join(ROOT, 'app/globals.css'))
    .match(/--[\w-]+:\s*(#[0-9a-fA-F]{6})/g)
    ?.map((s) => s.split(':')[1].trim().toLowerCase()) ?? [];
  // Excepciones legítimas declaradas en el spec
  const ALLOWED = new Set([
    ...TOKENS,
    '#ffffff', '#fff', '#000',
    '#ffd9b0', '#7a2300',                       // paradas del gradiente del CTA
    '#dcf0dc', '#f8edd4', '#d9e6f7', '#f5dcec', // pasteles del playground
    '#dce9f5', '#f1f1ee', '#333', '#6ee7a0',    // semicírculo, placeholder, hover, ok
    '#ff4900',                                   // box-shadow del plan destacado
  ]);
  let bad = 0;
  for (const f of files.filter((f) => f.endsWith('.tsx'))) {
    for (const m of read(f).matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      if (!ALLOWED.has(m[0].toLowerCase())) { warn(`${rel(f)} color suelto ${m[0]}`); bad++; }
    }
  }
  if (!bad) ok('sin colores fuera del sistema');
}

// ── 3 · Ids de asset válidos ───────────────────────────────
console.log('\n3 · AssetSlot: los ids existen en lib/assets.ts');
{
  const assetsSrc = read(join(ROOT, 'lib/assets.ts'));
  const declared = new Set([...assetsSrc.matchAll(/^\s{2}'([\w.]+)':\s*\{/gm)].map((m) => m[1]));
  const used = new Set();
  for (const f of files.filter((f) => f.endsWith('.tsx'))) {
    for (const m of read(f).matchAll(/id="([\w.]+)"/g)) {
      if (m[1].includes('.')) used.add(m[1]);
    }
    for (const m of read(f).matchAll(/id=\{[^}]*'([\w.]+)'/g)) {
      if (m[1].includes('.')) used.add(m[1]);
    }
  }
  for (const u of used) if (!declared.has(u)) fail(`id inexistente: ${u}`);

  // assetId referenciados desde content.ts
  const contentSrc = read(join(ROOT, 'lib/content.ts'));
  for (const m of contentSrc.matchAll(/assetId:\s*'([\w.]+)'/g)) {
    used.add(m[1]);
    if (!declared.has(m[1])) fail(`content.ts referencia un id inexistente: ${m[1]}`);
  }

  ok(`${declared.size} declarados, ${used.size} referenciados`);
  const unused = [...declared].filter((d) => !used.has(d));
  if (unused.length) warn(`declarados pero sin usar: ${unused.join(', ')}`);
}

// ── 4 · Ritmo de fondos ────────────────────────────────────
console.log('\n4 · Ritmo dark → cream → dark …');
{
  const EXPECTED = [
    ['Hero', 'bg-850'], ['Benefit', 'bg-cream'], ['BentoA', 'bg-900'],
    ['BentoB', 'bg-900'], ['GlobalNetwork', 'bg-900'], ['Playground', 'bg-cream'],
    ['UseCases', 'bg-cream'], ['Pricing', 'bg-900'], ['Faq', 'bg-900'],
    ['FinalCta', 'bg-900'], ['Related', 'bg-900'], ['Footer', 'bg-900'],
  ];
  for (const [name, token] of EXPECTED) {
    const src = read(join(ROOT, 'components/sections', `${name}.tsx`));
    if (!src.includes(`var(--${token})`)) fail(`${name} debería usar --${token}`);
  }
  ok('las 12 secciones respetan el orden de fondos');
}

// ── 5 · Tiempos medidos ────────────────────────────────────
console.log('\n5 · Tiempos que no se tocan');
{
  const motion = read(join(ROOT, 'lib/motion.ts'));
  const checks = [
    // Valores medidos fotograma a fotograma sobre la referencia, no los del
    // brief. Ver los comentarios en lib/motion.ts.
    ['curtain: 0.7', 'telón 0.70s'],
    ['wordReveal: 0.8', 'reveal por palabra 0.80s'],
    // El stagger de palabra ya no es un número fijo: es un presupuesto que se
    // reparte entre las palabras que haya. Medido en la referencia, un titular
    // de 4 palabras va a 0.18s/palabra y uno de 10 a 0.083s. Lo que se
    // conserva es el tiempo total, no el paso.
    ['wordBudget: 0.78', 'presupuesto del titular 0.78s'],
    ['wordStaggerFor', 'reparto adaptativo del stagger'],
    ['lineStagger: 0.1', 'M6 · stagger por líneas 0.10s'],
    ['directional: 0.8', 'entrada direccional 0.80s'],
    ['navCollapse: 0.4', 'colapso del navbar 0.40s'],
    ['marquee: 30', 'marquee 30s'],
  ];
  for (const [needle, label] of checks) {
    if (!motion.includes(needle)) fail(`falta o cambió: ${label}`);
  }

  const intro = read(join(ROOT, 'components/BrandIntro.tsx'));
  for (const [needle, label] of [
    // El acto 1 ya no "forma" el isotipo: Mia entra volando desde fuera de
    // cuadro y aterriza. Lo que se vigila es que siga habiendo una entrada
    // con desaceleración y que el lockup se recomponga después.
    ["ease: 'power3.out'", 'acto 1 · entrada con frenado'],
    ["ease: 'expo.out'", 'acto 4 · recomposición del lockup'],
    // La cadencia se reparte según el nº de letras, pero 0.085 sigue siendo
    // el tope (el valor medido del original con 5 letras).
    ['Math.min(0.085', 'cascada del wordmark, tope 0.085s'],
    ['CURTAIN_START = 2.3', 'telón a los 2.30s'],
  ]) {
    if (!intro.includes(needle)) fail(`intro · falta o cambió: ${label}`);
  }
  ok('timeline de la intro y primitivas intactas');
}

// ── 6 · Higiene de la intro ────────────────────────────────
console.log('\n6 · Higiene de la intro');
{
  const intro = read(join(ROOT, 'components/BrandIntro.tsx'));
  const layout = read(join(ROOT, 'app/layout.tsx'));
  if (!layout.includes("sessionStorage.getItem('intro_seen')")) fail('no comprueba intro_seen');
  if (!intro.includes("sessionStorage.setItem('intro_seen'")) fail('no marca intro_seen');
  if (!layout.includes('prefers-reduced-motion')) fail('no comprueba prefers-reduced-motion');
  if (!intro.includes('Saltar')) fail('falta el botón de salto');
  if (!intro.includes('data-intro-locked')) fail('no bloquea el scroll durante la intro');
  if (!intro.includes('mark-rebirth')) fail('falta el detalle de continuidad del navbar');
  ok('sessionStorage · skip · reduced-motion · scroll lock · renacimiento');
}

// ── 7 · Limpieza de ScrollTrigger ──────────────────────────
console.log('\n7 · Cada useEffect con GSAP limpia lo suyo');
{
  for (const f of files.filter((f) => f.endsWith('.tsx'))) {
    const src = read(f);
    if (src.includes('gsap.context(') && !src.includes('.revert()')) {
      fail(`${rel(f)} crea un gsap.context sin revert en el cleanup`);
    }
  }
  ok('sin contextos huérfanos');
}

// ── 8 · Accesibilidad mínima ───────────────────────────────
console.log('\n8 · Accesibilidad');
{
  const faq = read(join(ROOT, 'components/sections/Faq.tsx'));
  if (!faq.includes('aria-expanded')) fail('el acordeón no expone aria-expanded');
  if (!faq.includes('grid-template-rows') && !faq.includes('accordion-panel')) {
    fail('el acordeón no usa grid-template-rows');
  }
  const pricing = read(join(ROOT, 'components/sections/Pricing.tsx'));
  if (!pricing.includes('aria-label="Moneda"')) fail('el toggle de moneda no tiene aria-label');
  const css = read(join(ROOT, 'app/globals.css'));
  if (!css.includes(':focus-visible')) fail('no hay estilo de focus visible');
  if (!css.includes('prefers-reduced-motion')) fail('falta la regla global de reduced-motion');
  ok('aria-expanded · aria-label · focus-visible · reduced-motion');
}

// ── 9 bis · Regresiones ya cazadas una vez ─────────────────
// Cada una de éstas fue un bug real que costó un vídeo detectar.
console.log('\n9 · Regresiones conocidas');
{
  // Contador local: si usara el global, un fallo de otra sección haría que
  // ésta se quedara muda en vez de dar su propio veredicto.
  const before = errors;
  // Sin comentarios: si no, la propia nota que explica el bug lo dispara.
  const css = read(join(ROOT, 'app/globals.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  const intro = read(join(ROOT, 'components/BrandIntro.tsx'));
  const mark = read(join(ROOT, 'components/Mark.tsx'));
  const reveal = read(join(ROOT, 'components/RevealHeading.tsx'));
  const page = read(join(ROOT, 'app/page.tsx'));

  // F1 · el telón medía el 100 % de la PÁGINA (~15 000 px), no del viewport
  if (/transform:\s*translateY\(100%\)/.test(css)) {
    fail('F1 · .page-curtain usa translateY(100%) — debe ser 100vh');
  }
  if (!/transform:\s*translateY\(100vh\)/.test(css)) {
    fail('F1 · falta el translateY(100vh) del telón');
  }
  if (/curtain[\s\S]{0,200}yPercent:\s*100/.test(intro)) {
    fail('F1 · el telón usa yPercent (porcentaje del propio elemento)');
  }

  // F2 · estados iniciales de la intro fuera de CSS → flash del logo terminado
  if (!css.includes(".brand-intro .letter")) {
    fail('F2 · falta el estado inicial de .letter en CSS');
  }
  if (!css.includes(".brand-intro .dot")) {
    fail('F2 · falta el estado inicial de .dot en CSS');
  }

  // F3 · el espacio dentro del span inline-block se colapsa.
  //
  // La invariante NO es "el span contiene exactamente {word}" — eso se rompe
  // en cuanto el componente crece (slots, resaltados, lo que sea). La
  // invariante es: DENTRO del span no puede haber un literal de espacio.
  for (const file of ['components/RevealHeading.tsx', 'components/RevealParagraph.tsx']) {
    const src = read(join(ROOT, file));
    for (const m of src.matchAll(/className="word"[^>]*>([\s\S]*?)<\/span>/g)) {
      if (/'\s+'|"\s+"|\{' '\}/.test(m[1])) {
        fail(`F3 · ${file}: hay un espacio literal DENTRO del <span class="word">`);
      }
    }
    // Y fuera sí tiene que haberlo, o las palabras salen pegadas.
    if (!/<\/span>,?\s*\n?\s*i < arr\.length - 1 \? ' '/.test(src)) {
      fail(`F3 · ${file}: no encuentro el espacio ENTRE spans`);
    }
  }

  // F4 · GSAP ignora transform-box:fill-box en SVG
  if (/className="(bar|disc)"[\s\S]{0,220}transformBox/.test(mark)) {
    fail('F4 · .bar/.disc vuelven a depender de transform-box en SVG');
  }
  if (/'\.bar',\s*\{\s*scaleX/.test(intro)) {
    fail('F4 · la barra se anima con scaleX en vez de atributos');
  }

  // F5 · ScrollTrigger midiendo con la página desplazada
  if (!page.includes('nexor:intro-settled')) {
    fail('F5 · el apilado no espera a que la página esté asentada');
  }

  // F7 · la restauración de scroll del navegador rompía navbar, hero y sticky
  const layout7 = read(join(ROOT, 'app/layout.tsx'));
  if (!layout7.includes("history.scrollRestoration = 'manual'")) {
    fail('F7 · falta scrollRestoration = manual en el script bloqueante');
  }
  if (!intro.includes('window.scrollTo(0, 0)')) {
    fail('F7 · la intro no fuerza el scroll a 0');
  }
  const smooth = read(join(ROOT, 'components/SmoothScroll.tsx'));
  if (!smooth.includes('lenis.stop()')) {
    fail('F7 · Lenis no se para durante la intro y pisa el reset de scroll');
  }

  if (errors === before) ok('las 6 regresiones del vídeo siguen cerradas');
}

// ── 10 · Flags de desarrollo que no deben llegar a producción ─
console.log('\n10 · Flags de desarrollo');
{
  const layout = read(join(ROOT, 'app/layout.tsx'));
  const m = layout.match(/const REPLAY_INTRO_ON_RELOAD\s*=\s*([^;]+);/);
  if (!m) {
    warn('no encuentro REPLAY_INTRO_ON_RELOAD — ¿ya se quitó?');
  } else if (!m[1].includes('NODE_ENV')) {
    fail(`REPLAY_INTRO_ON_RELOAD está fijado a "${m[1].trim()}" en vez de atado a NODE_ENV`);
  } else {
    ok('la repetición de la intro solo vive en desarrollo');
  }

  // Cualquier otro TODO/FIXME marcado como bloqueante
  for (const f of files) {
    for (const line of read(f).split('\n')) {
      if (/QUITAR ANTES DE PRODUCCI[OÓ]N/i.test(line)) {
        warn(`${rel(f)} tiene un flag marcado para quitar`);
      }
    }
  }
}

console.log(`\n${errors ? '✗' : '✓'} ${errors} errores · ${warnings} avisos\n`);
process.exit(errors ? 1 : 0);
