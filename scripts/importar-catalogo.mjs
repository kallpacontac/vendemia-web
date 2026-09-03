/**
 * ══════════════════════════════════════════════════════════════════════════
 * IMPORTAR UN CATÁLOGO DESDE UNA CARPETA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/importar-catalogo.mjs "C:/ruta/al/catalogo" <company_id>
 *
 * Espera una carpeta por producto, y dentro:
 *
 *   descripcion.txt   línea 1 = nombre · línea 2 = precio · el resto, detalles
 *   frente.png        \
 *   espalda_*.png      }  las fotos, en ese orden de importancia
 *   *personalizacion*  /
 *
 * Credenciales por variables de entorno, nunca por argumento — un argumento
 * queda en el historial del shell:
 *
 *   CORREO=... CLAVE=... node scripts/importar-catalogo.mjs ...
 *
 * ── Cómo escribe, y por qué así ───────────────────────────────────────────
 * Igual que el panel: LEE por Supabase y ESCRIBE encolando comandos. Nunca un
 * insert directo en `catalog` — los GRANT no lo permiten, y si lo permitieran
 * el espejo se lo comería en el siguiente barrido.
 *
 * Las fotos van del disco a Cloudinary DIRECTAMENTE, firmadas por
 * /api/cloudinary/firma en producción. El secreto no está aquí.
 *
 * ── ES IDEMPOTENTE, y hace falta que lo sea ───────────────────────────────
 * Un producto que ya existe (por nombre exacto) no se vuelve a crear, y una
 * foto cuyo fichero ya está en `catalog_media` no se vuelve a subir. Así se
 * puede relanzar sin miedo: cuando lleguen las fotos que faltan, se ejecuta
 * otra vez y solo sube lo nuevo.
 *
 * ⚠️ EXIGE EL BOT ENCENDIDO, y no es un capricho. `upsert_catalog_media`
 * necesita el `catalog_id`, y ese id solo existe cuando el bot ha procesado el
 * `upsert_catalog_item`. Con el bot apagado esto encolaría productos sin poder
 * colgarles ninguna foto, y una segunda pasada crearía duplicados porque los
 * nombres todavía no estarían en el espejo. Mejor no empezar.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const SITIO = process.env.SITIO ?? 'https://vendemias.com';
const argv = process.argv.slice(2);
const [CARPETA, COMPANY] = argv.filter((a) => !a.startsWith('--'));

/**
 * `--saltar=01,02`        omite carpetas cuyo nombre empiece por eso.
 * `--saltar-foto=Guerrero` omite ficheros cuyo nombre contenga eso.
 *
 * Lo segundo existe por un caso real de este catálogo: la foto de espalda
 * "Guerrero 34" se asignó por cercanía de horario de captura y el propio índice
 * avisa de que podría pertenecer a otra camiseta. Subir una foto equivocada es
 * peor que dejar el producto sin foto — el cliente compra lo que ve.
 */
const lista = (p) => (argv.find((a) => a.startsWith(p)) ?? '').split('=')[1]?.split(',').filter(Boolean) ?? [];
const SALTAR = lista('--saltar=');
const SALTAR_FOTO = lista('--saltar-foto=');

if (!CARPETA || !COMPANY) {
  console.error('Uso: CORREO=… CLAVE=… node scripts/importar-catalogo.mjs "<carpeta>" <company_id>');
  process.exit(1);
}

/** Líneas del descripcion.txt que NO son del producto sino del negocio. */
const DEL_NEGOCIO = [
  /^entregas en estaciones/i,
  /^delivery/i,
  /^env[ií]os/i,
  /^medios de pago/i,
  /^fotos adicionales/i,
  /^ventas al por mayor/i,
  /^\[sin fotos/i,
];

/** Una línea que es solo un precio: "PEN 63.00", "$55.00", "S/ 60". */
const ES_PRECIO = /^(pen|usd|s\/|\$)\s*[\d.,]+\s*$/i;

/**
 * El texto que se guarda en `catalog.description`.
 *
 * Se quita el nombre (línea 1), el precio (línea 2) y todo lo que sea
 * configuración de la empresa. Eso último ya vive en Ajustes, y repetido en
 * cada ficha se contradice el día que cambie un número de Yape: lo que no se
 * duplica no se puede contradecir.
 */
function descripcionDe(texto) {
  return texto
    .split(/\r?\n/)
    .slice(1) // fuera el nombre
    .map((l) => l.trim())
    .filter((l) => l && !ES_PRECIO.test(l) && !DEL_NEGOCIO.some((r) => r.test(l)))
    .join('\n');
}

/** El precio, en número. Devuelve null si la línea no se entiende. */
function precioDe(texto) {
  const linea = texto.split(/\r?\n/)[1]?.trim() ?? '';
  const n = Number(linea.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Orden de las fotos. IMPORTA de verdad: el bot manda como mucho DOS adjuntos,
 * así que el frente y la espalda tienen que ser las dos primeras. Una foto de
 * personalización en medio desplazaría a la espalda fuera del mensaje.
 */
function ordenDe(fichero) {
  const f = fichero.toLowerCase();
  if (f.includes('personalizacion')) return 2;
  if (f.startsWith('espalda')) return 1;
  return 0;
}

const esImagen = (f) => /\.(png|jpe?g|webp)$/i.test(f);

/* ── Arranque ────────────────────────────────────────────────────────────── */

const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!l.trim() || l.trim().startsWith('#')) continue;
  const i = l.indexOf('=');
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const { data: sesion, error: eLogin } = await sb.auth.signInWithPassword({
  email: process.env.CORREO,
  password: process.env.CLAVE,
});
if (eLogin) {
  console.error('No se pudo entrar:', eLogin.message);
  process.exit(1);
}
const jwt = sesion.session.access_token;

/* El bot tiene que estar vivo. Ver la nota de la cabecera. */
const { data: salud } = await sb
  .from('v_instance_health')
  .select('vivo, diagnostico')
  .eq('company_id', COMPANY)
  .maybeSingle();
if (!salud?.vivo) {
  console.error(`\n✗ El bot de ${COMPANY} no está en línea (${salud?.diagnostico ?? 'sin instancia'}).`);
  console.error('  Las fotos necesitan el id que devuelve el bot al crear cada producto.');
  console.error('  Enciéndelo y vuelve a lanzar esto: no se ha escrito nada.\n');
  process.exit(1);
}

/** Encola un comando y espera a que el bot lo aplique. */
async function comando(type, payload, timeoutMs = 30000) {
  const { data: cmd, error } = await sb
    .from('commands')
    .insert({ company_id: COMPANY, type, payload })
    .select('id')
    .single();
  if (error) throw new Error(`encolar ${type}: ${error.message}`);

  const hasta = Date.now() + timeoutMs;
  while (Date.now() < hasta) {
    const { data } = await sb
      .from('commands')
      .select('status, result, error')
      .eq('id', cmd.id)
      .maybeSingle();
    if (data?.status === 'done') return data.result;
    if (data?.status === 'error') throw new Error(`${type}: ${data.error}`);
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`${type}: el bot no respondió en ${timeoutMs / 1000}s`);
}

/** Sube un fichero a Cloudinary con una firma pedida al servidor. */
async function subirACloudinary(ruta) {
  const firma = await fetch(`${SITIO}/api/cloudinary/firma`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ companyId: COMPANY }),
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(`firma: ${j.error}`);
    return j;
  });

  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(ruta)]), basename(ruta));
  fd.append('api_key', firma.apiKey);
  fd.append('timestamp', String(firma.timestamp));
  fd.append('folder', firma.folder);
  fd.append('signature', firma.signature);

  const r = await fetch(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, {
    method: 'POST',
    body: fd,
  }).then((x) => x.json());
  if (!r.secure_url) throw new Error(`Cloudinary: ${r?.error?.message ?? 'sin secure_url'}`);
  return r.secure_url;
}

/* ── El trabajo ──────────────────────────────────────────────────────────── */

const raiz = resolve(CARPETA);
const carpetas = readdirSync(raiz)
  .filter((f) => statSync(join(raiz, f)).isDirectory())
  .sort();

console.log(`\n▸ ${carpetas.length} carpeta(s) en ${raiz}`);
console.log(`▸ compañía: ${COMPANY}\n`);

let creados = 0, saltados = 0, fotos = 0, fallos = 0;

for (const carpeta of carpetas) {
  if (SALTAR.some((p) => carpeta.startsWith(p))) {
    console.log('  — ' + carpeta + ': omitida (--saltar)');
    continue;
  }
  const dir = join(raiz, carpeta);
  let texto;
  try {
    texto = readFileSync(join(dir, 'descripcion.txt'), 'utf8');
  } catch {
    console.log(`  — ${carpeta}: sin descripcion.txt, se salta`);
    continue;
  }

  const nombre = texto.split(/\r?\n/)[0].trim();
  const precio = precioDe(texto);
  if (!nombre || precio === null) {
    console.log(`  ✗ ${carpeta}: no se entiende el nombre o el precio`);
    fallos++;
    continue;
  }

  // ¿Ya existe? Se compara por nombre exacto, que es la clave real del catálogo.
  const { data: existentes } = await sb
    .from('catalog')
    .select('id, name')
    .eq('company_id', COMPANY);
  const ya = (existentes ?? []).find((c) => c.name.trim() === nombre);

  let catalogId;
  if (ya) {
    catalogId = ya.id;
    saltados++;
    console.log(`  = ${nombre} · ya existía`);
  } else {
    try {
      const r = await comando('upsert_catalog_item', {
        item: {
          name: nombre,
          description: descripcionDe(texto),
          price: precio,
          currency: 'PEN',
          is_active: 1,
        },
      });
      catalogId = r?.id;
      creados++;
      console.log(`  + ${nombre} · PEN ${precio}`);
    } catch (e) {
      console.log(`  ✗ ${nombre}: ${e.message}`);
      fallos++;
      continue;
    }
  }
  if (!catalogId) {
    console.log(`  ✗ ${nombre}: el bot no devolvió id, sin fotos`);
    fallos++;
    continue;
  }

  /* Las fotos. Solo las que no estén ya subidas. */
  const { data: medios } = await sb
    .from('catalog_media')
    .select('url')
    .eq('catalog_id', catalogId);
  const subidas = new Set((medios ?? []).map((m) => basename(new URL(m.url).pathname)));

  const imagenes = readdirSync(dir).filter(esImagen).sort((a, b) => ordenDe(a) - ordenDe(b));
  for (const img of imagenes) {
    if (SALTAR_FOTO.some((p) => img.toLowerCase().includes(p.toLowerCase()))) {
      console.log('      — ' + img + ': omitida (--saltar-foto)');
      continue;
    }
    // Cloudinary renombra el fichero, así que no se puede comparar por nombre
    // exacto: se busca el original dentro del public_id, que sí lo conserva
    // cuando se sube con use_filename. Si no coincide, se sube otra vez —
    // preferible a saltarse una foto que falta.
    const raiz0 = basename(img).replace(/\.[^.]+$/, '').toLowerCase();
    if ([...subidas].some((u) => u.toLowerCase().includes(raiz0))) {
      console.log(`      = ${img} · ya estaba`);
      continue;
    }
    try {
      const url = await subirACloudinary(join(dir, img));
      await comando('upsert_catalog_media', {
        catalog_id: catalogId,
        url,
        media_type: 'image',
        sort_order: ordenDe(img),
      });
      fotos++;
      console.log(`      ↑ ${img} (orden ${ordenDe(img)})`);
    } catch (e) {
      console.log(`      ✗ ${img}: ${e.message}`);
      fallos++;
    }
  }
}

console.log(`\n✔ ${creados} creado(s) · ${saltados} ya estaban · ${fotos} foto(s) subida(s) · ${fallos} fallo(s)\n`);
