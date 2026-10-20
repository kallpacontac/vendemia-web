import 'server-only';
/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI PÁGINA · el catálogo en PDF (docs/PLAN-TU-PAGINA.md §7.1)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El archivo que el dueño manda por WhatsApp o imprime, y que el enlace fijo
 * /<negocio>/catalogo.pdf devuelve siempre con los precios de hoy.
 *
 * Sale del mismo escaparate que pinta la página (lo que se vende, se reserva o
 * se separa, con sus fotos y por secciones) más lo del mayorista
 * (sql/0005_catalogo_mayorista.sql): código, precio por mayor y pedido mínimo.
 *
 * @react-pdf/renderer, no un navegador: en Vercel un Chromium es pesado y lento.
 * Las fotos se bajan aquí, reducidas y en JPG (Cloudinary), para que el PDF
 * pese poco al mandarlo con datos móviles. La que no es JPG o PNG, o tarda, no
 * va: el PDF sale igual.
 */
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { colorValido, tintaSobre } from '@/modules/fideliza/dominio/estilo';
import { soles, type Escaparate, type Item } from '@/modules/tu-pagina/dominio/tienda';
import { telefonoBonito } from '@/modules/tu-pagina/dominio/envio';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';

export interface Mayor {
  codigo: string;
  precio_mayor: number | null;
  desde: number | null;
  pedido_minimo: number | null;
}

const ANCHO_FOTO = 360;
const ESPERA_FOTO_MS = 4_000;
const FOTOS_A_LA_VEZ = 8;
const MAX_ITEMS = 300;

/** Cloudinary: reducida y en JPG. Otras: solo si ya son JPG o PNG. */
function urlFoto(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const marca = '/image/upload/';
    const i = u.pathname.indexOf(marca);
    if (u.hostname === 'res.cloudinary.com' && i >= 0) {
      // Quita la transformación que traiga (la de la página es f_auto) y pone la del PDF.
      const resto = u.pathname.slice(i + marca.length).replace(/^([a-z]_[^/]+\/)+/, '');
      u.pathname = `${u.pathname.slice(0, i + marca.length)}c_limit,w_${ANCHO_FOTO}/f_jpg,q_70/${resto}`;
      return u.toString();
    }
    return /\.(jpe?g|png)$/i.test(u.pathname) ? u.toString() : null;
  } catch {
    return null;
  }
}

async function bajarFoto(url: string): Promise<{ data: Buffer; format: 'jpg' | 'png' } | null> {
  const u = urlFoto(url);
  if (!u) return null;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(ESPERA_FOTO_MS) });
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') ?? '';
    const format = tipo.includes('png') ? 'png' : tipo.includes('jpeg') || tipo.includes('jpg') ? 'jpg' : null;
    if (!format) return null;
    const data = Buffer.from(await r.arrayBuffer());
    return data.length > 0 && data.length < 1_500_000 ? { data, format } : null;
  } catch {
    return null;
  }
}

async function bajarFotos(items: Item[]): Promise<Map<string, { data: Buffer; format: 'jpg' | 'png' }>> {
  const fotos = new Map<string, { data: Buffer; format: 'jpg' | 'png' }>();
  const cola = items.filter((i) => i.fotos[0]);
  for (let i = 0; i < cola.length; i += FOTOS_A_LA_VEZ) {
    await Promise.all(
      cola.slice(i, i + FOTOS_A_LA_VEZ).map(async (it) => {
        const f = await bajarFoto(it.fotos[0]);
        if (f) fotos.set(it.id, f);
      }),
    );
  }
  return fotos;
}

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

const recorta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

export async function catalogoPdf(p: PaginaPublica, esc: Escaparate, mayor: Map<string, Mayor>, urlPagina: string): Promise<Buffer> {
  const color = colorValido(p.color);
  const tinta = tintaSobre(color);
  const items = esc.items.slice(0, MAX_ITEMS);
  const [fotos, qr, logo] = await Promise.all([
    bajarFotos(items),
    QRCode.toDataURL(urlPagina, { width: 360, margin: 1, errorCorrectionLevel: 'M' }),
    p.logo_url ? bajarFoto(p.logo_url) : Promise.resolve(null),
  ]);

  // Por secciones, en el orden en que aparecen; lo que no tiene sección, al final.
  const familias = [...new Set(items.map((i) => i.familia))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0));
  const hayMayor = items.some((i) => mayor.get(i.id)?.precio_mayor != null || mayor.get(i.id)?.pedido_minimo != null);

  const s = StyleSheet.create({
    pagina: { paddingTop: 34, paddingBottom: 48, paddingHorizontal: 34, fontFamily: 'Helvetica', fontSize: 9.5, color: '#1d1d1f' },
    cabecera: { flexDirection: 'row', alignItems: 'center', backgroundColor: color, color: tinta, borderRadius: 10, padding: 16, marginBottom: 16 },
    logo: { width: 54, height: 54, borderRadius: 8, marginRight: 14, objectFit: 'cover' },
    titulo: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
    frase: { fontSize: 10, marginTop: 3, opacity: 0.9 },
    datos: { fontSize: 9, marginTop: 6, opacity: 0.9 },
    qr: { width: 70, height: 70, backgroundColor: '#fff', borderRadius: 6, padding: 3 },
    qrTexto: { fontSize: 7, textAlign: 'center', marginTop: 3 },
    seccion: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1.5, borderBottomColor: color },
    rejilla: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    tarjeta: { width: '48.5%', flexDirection: 'row', borderWidth: 0.75, borderColor: '#e2e2e6', borderRadius: 8, padding: 8, marginBottom: 8 },
    foto: { width: 70, height: 70, borderRadius: 6, marginRight: 8, objectFit: 'cover' },
    sinFoto: { width: 70, height: 70, borderRadius: 6, marginRight: 8, backgroundColor: '#f2f2f5' },
    cuerpo: { flex: 1 },
    nombre: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
    codigo: { fontSize: 8, color: '#6e6e73', marginTop: 1 },
    desc: { fontSize: 8.5, color: '#55555a', marginTop: 3, lineHeight: 1.3 },
    precio: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', marginTop: 4, color: '#1d1d1f' },
    mayor: { fontSize: 8.5, marginTop: 2, color },
    nota: { fontSize: 8, color: '#6e6e73', marginTop: 2 },
    pie: { position: 'absolute', bottom: 20, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#8e8e93' },
  });

  const Tarjeta = ({ it }: { it: Item }) => {
    const f = fotos.get(it.id);
    const m = mayor.get(it.id);
    const extra =
      it.tipo === 'cita'
        ? `${it.duracion} min`
        : it.tipo === 'grupo'
          ? it.grupos.map((g) => g.etiqueta || g.cuando).filter(Boolean).slice(0, 3).join(' · ')
          : it.opciones.length
            ? recorta(it.opciones.map((o) => o.etiqueta).join(', '), 90)
            : '';
    return (
      <View style={s.tarjeta} wrap={false}>
        {f ? <Image style={s.foto} src={f} /> : <View style={s.sinFoto} />}
        <View style={s.cuerpo}>
          <Text style={s.nombre}>{recorta(it.nombre, 70)}</Text>
          {m?.codigo ? <Text style={s.codigo}>Código {m.codigo}</Text> : null}
          {it.descripcion ? <Text style={s.desc}>{recorta(it.descripcion, 150)}</Text> : null}
          <Text style={s.precio}>{soles(it.precio)}</Text>
          {m?.precio_mayor != null && m.desde ? <Text style={s.mayor}>Por mayor: desde {m.desde} u., {soles(m.precio_mayor)} c/u</Text> : null}
          {m?.pedido_minimo ? <Text style={s.nota}>Pedido mínimo: {m.pedido_minimo} u.</Text> : null}
          {extra ? <Text style={s.nota}>{extra}</Text> : null}
        </View>
      </View>
    );
  };

  const doc = (
    <Document title={`Catálogo · ${p.titulo}`} author={p.titulo} creator="Vendemia" producer="Vendemia">
      <Page size="A4" style={s.pagina}>
        <View style={s.cabecera}>
          {logo ? <Image style={s.logo} src={logo} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={s.titulo}>{p.titulo}</Text>
            {p.frase ? <Text style={s.frase}>{p.frase}</Text> : null}
            <Text style={s.datos}>
              {p.whatsapp ? `WhatsApp ${telefonoBonito(p.whatsapp)} · ` : ''}Precios válidos al {fechaLarga(esc.hoy)}
              {hayMayor ? ' · Precios por unidad' : ''}
            </Text>
          </View>
          <View>
            <Image style={s.qr} src={qr} />
            <Text style={s.qrTexto}>{items.some((i) => i.tipo === 'producto') ? 'Pide aquí' : 'Reserva aquí'}</Text>
          </View>
        </View>

        {items.length === 0 ? (
          <Text>Pronto habrá productos aquí. Escríbenos por WhatsApp.</Text>
        ) : (
          familias.map((fam) => (
            <View key={fam || '-'}>
              {(fam || familias.length > 1) && <Text style={s.seccion} minPresenceAhead={90}>{fam || 'Otros'}</Text>}
              <View style={s.rejilla}>
                {items.filter((i) => i.familia === fam).map((it) => (
                  <Tarjeta key={it.id} it={it} />
                ))}
              </View>
            </View>
          ))
        )}

        <View style={s.pie} fixed>
          <Text>{urlPagina.replace(/^https?:\/\//, '')}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
