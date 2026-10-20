'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TU PÁGINA EN EL PANEL · la página del negocio y sus envíos
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cuando hay operaciones separadas (pedidos, reservas o envíos), se muestran
 * como pestañas junto al editor. Si solo está el editor, no se dibuja una
 * pestaña redundante: el título de la pantalla ya explica dónde está el usuario.
 *
 * Por fuera el producto se llama «Mi página» (Alvaro, 19-oct-2026; fue «Tu página» y, unas horas, «Pide»).
 * Por dentro sigue siendo tu-pagina: módulo, tablas, API y rutas.
 * El host del enlace depende del modo: dominio/config.ts.
 *
 * Todo escribe en la nube (tablas tu_pagina / envios, RPC con la sesión del usuario):
 * no pasa por el bot y funciona igual en un negocio sin bot.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, Download, ExternalLink, FileText, Printer, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { COLORES } from '@/modules/fideliza/dominio/estilo';
import Link from 'next/link';
import { urlPagina, urlEnvio, urlReservar } from '@/modules/tu-pagina/dominio/config';
import { esAppointmentFamily, esEcommerce, esRecurrente } from '@/lib/panel/modo';
import { tipoPorDefecto, type TiposDePagina } from '@/modules/tu-pagina/dominio/tienda';
import type { BusinessMode } from '@/lib/supabase/types';
import { EXPERIENCIAS, plantillaGuardada, tipoPagina, tipoPorDefecto as tipoPaginaPorDefecto, type TipoPagina } from '@/modules/tu-pagina/dominio/plantillas';
import { esHex, esUrlPublica, type AparienciaPagina } from '@/modules/tu-pagina/dominio/apariencia';
import { subirImagenMarca } from '@/modules/fideliza/cliente/imagenMarca';

/**
 * La página con otra plantilla o color, sin guardar: se sirve en el dominio del
 * panel (hosts.ts no la manda a tienda.*) para poder ir en un iframe.
 */
const urlVista = (slug: string, valores: {
  tipo: TipoPagina; color: string; apariencia: AparienciaPagina;
}) => {
  const q = new URLSearchParams({ vista: '1', tipo: valores.tipo, color: valores.color,
    ct: valores.apariencia.colorTienda ?? '', fa: valores.apariencia.fondoAgenda ?? '',
    ft: valores.apariencia.fondoTienda ?? '', cb: valores.apariencia.colorBanner ?? '',
    mb: valores.apariencia.mostrarBanner === false ? '0' : '1',
    mw: valores.apariencia.mostrarWhatsapp === false ? '0' : '1',
  });
  return `/tu-pagina/${slug}?${q.toString()}`;
};
import { Pedidos, Reservas } from '@/modules/tu-pagina/ui/PedidosYReservas';
import Reclamos from '@/modules/tu-pagina/ui/Reclamos';
import { proveedorCompleto, rucValido, type Proveedor } from '@/modules/tu-pagina/dominio/reclamos';
import {
  ESTADOS,
  fechaCorta,
  nombreEstado,
  nombreFranja,
  telefonoBonito,
  telefonoNormal,
  type Envio,
  type EstadoEnvio,
} from '@/modules/tu-pagina/dominio/envio';
import { hojaEtiquetas, imprimir, type Formato } from '@/modules/tu-pagina/ui/etiquetas';
import '@/modules/tu-pagina/estilos/panel.css';

interface Pagina {
  company_id: string;
  slug: string;
  titulo: string;
  frase: string;
  whatsapp: string;
  secciones: {
    catalogo?: boolean; reservar?: boolean; envios?: boolean; tipos?: TiposDePagina; apariencia?: AparienciaPagina;
    reclamos?: boolean; proveedor?: Partial<Proveedor>;
  };
  logo_url: string | null;
  portada_url: string | null;
  color: string;
  plantilla: string;
  distritos: string[];
  publicada: boolean;
}

const POR_PAGINA = 50;

type Pestana = 'pedidos' | 'reservas' | 'envios' | 'reclamos' | 'pagina';

type Es = TipoPagina;
const ES = EXPERIENCIAS;
const esDe = (s: Pagina['secciones'] | undefined): Es | null =>
  s?.catalogo || s?.reservar ? tipoPagina(s) : null;

const mensajeDe = (e: unknown) => {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (m.includes('tu_pagina:slug_ocupado')) return 'Esa dirección ya la tiene otro negocio.';
  if (m.includes('tu_pagina:slug_reservado')) return 'Esa dirección no está disponible.';
  if (m.includes('tu_pagina:slug_invalido')) return 'La dirección: de 3 a 40 letras minúsculas, números o guiones.';
  if (m.includes('tu_pagina:falta_whatsapp')) return 'Pon tu WhatsApp: es a donde llegan los pedidos.';
  return m;
};

export default function PanelTuPagina() {
  const { companyId, compania } = useSesion();
  const params = useSearchParams();
  const codigoBuscado = params.get('envio');
  const { datos: pagina, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const { data, error } = await supabase().from('tu_pagina').select('*').eq('company_id', companyId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Pagina | null) ?? null;
  }, [companyId]);
  // Con la agenda en la nube (modules/datos/sql/0004) lo que llega por la página entra en la
  // Agenda y en Pedidos del panel, no en pedidos_web / reservas_web: esas pestañas sobran.
  const [agendaNube, setAgendaNube] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    void supabase()
      .rpc('agenda_en_nube', { p_company: companyId })
      .then(({ data }) => setAgendaNube(data === true));
  }, [companyId]);
  const sinPagina = !cargando && !error && !pagina?.publicada;
  const s = pagina?.publicada ? pagina.secciones ?? {} : {};
  const pestanas = [
    ...(s.catalogo && !agendaNube ? [{ id: 'pedidos' as const, nombre: 'Pedidos' }] : []),
    ...(s.reservar && !agendaNube ? [{ id: 'reservas' as const, nombre: esRecurrente(compania?.business_mode) ? 'Cupos' : 'Reservas' }] : []),
    ...(s.envios ? [{ id: 'envios' as const, nombre: 'Envíos' }] : []),
    ...(s.reclamos ? [{ id: 'reclamos' as const, nombre: 'Reclamos' }] : []),
    { id: 'pagina' as const, nombre: 'La página' },
  ];
  const [pestana, setPestana] = useState<Pestana | null>(null);
  const activa: Pestana = pestana && pestanas.some((p) => p.id === pestana) ? pestana : codigoBuscado ? 'envios' : pestanas[0].id;

  useEffect(() => {
    if (sinPagina) setPestana('pagina');
  }, [sinPagina]);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Mi página" sub="El enlace para que tus clientes te pidan, y lo que te piden" />
        {error && <p className="vacio">No se pudo cargar: {error}</p>}
        {cargando && !pagina && <p className="vacio">Cargando…</p>}
        {!cargando && !error && companyId && (
          <>
            {pestanas.length > 1 && (
              <div className="tp-panel-tabs" role="tablist" aria-label="Secciones de Mi página">
                {pestanas.map((p) => (
                  <button key={p.id} role="tab" aria-selected={activa === p.id} className={activa === p.id ? 'active' : ''} onClick={() => setPestana(p.id)}>
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}
            {activa === 'pagina' ? (
              <MiPagina companyId={companyId} nombre={compania?.nombre ?? ''} pagina={pagina ?? null} agendaNube={agendaNube} alGuardar={releer} />
            ) : activa === 'pedidos' ? (
              <Pedidos companyId={companyId} nombre={pagina?.titulo || compania?.nombre || ''} />
            ) : activa === 'reservas' ? (
              <Reservas companyId={companyId} nombre={pagina?.titulo || compania?.nombre || ''} />
            ) : activa === 'reclamos' ? (
              <Reclamos companyId={companyId} />
            ) : (
              <Envios companyId={companyId} pagina={pagina ?? null} nombre={pagina?.titulo || compania?.nombre || ''} codigo={codigoBuscado} alConfigurar={() => setPestana('pagina')} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   LA PÁGINA
   ═══════════════════════════════════════════════════════════════════════ */

function MiPagina({ companyId, nombre, pagina, agendaNube, alGuardar }: {
  companyId: string; nombre: string; pagina: Pagina | null; agendaNube: boolean; alGuardar: () => void;
}) {
  const avisar = useAvisar();
  const { compania } = useSesion();
  const [titulo, setTitulo] = useState(pagina?.titulo || nombre);
  const [frase, setFrase] = useState(pagina?.frase ?? '');
  const [slug, setSlug] = useState(pagina?.slug ?? sugerirSlug(nombre || companyId));
  const [whatsapp, setWhatsapp] = useState(telefonoBonito(pagina?.whatsapp ?? ''));
  const modo = compania?.business_mode;
  const tienda = esEcommerce(modo);
  const [envios, setEnvios] = useState(pagina?.secciones?.envios ?? false);
  const [reclamos, setReclamos] = useState(pagina?.secciones?.reclamos ?? false);
  const [proveedor, setProveedor] = useState<Proveedor>({
    razon_social: pagina?.secciones?.proveedor?.razon_social ?? '',
    ruc: pagina?.secciones?.proveedor?.ruc ?? '',
    direccion: pagina?.secciones?.proveedor?.direccion ?? '',
  });
  // Por defecto, lo que hace cada negocio: la tienda vende, el de citas o clases reserva.
  // Una página antigua solo de envíos no es ninguna de las tres, y así se queda si no se elige.
  const [es, setEs] = useState<Es>(pagina ? esDe(pagina.secciones) ?? tipoPaginaPorDefecto(modo) : tienda ? 'tienda' : 'agenda');
  const [tipos, setTipos] = useState<TiposDePagina>(pagina?.secciones?.tipos ?? {});
  const catalogo = es === 'tienda' || es === 'ambos';
  const reservar = es === 'agenda' || es === 'ambos';
  const [distritos, setDistritos] = useState((pagina?.distritos ?? []).join(', '));
  const [color, setColor] = useState(pagina?.color ?? (tienda ? '#111111' : '#006BFF'));
  const [logo, setLogo] = useState(pagina?.logo_url ?? '');
  const [portada, setPortada] = useState(pagina?.portada_url ?? '');
  const [apariencia, setApariencia] = useState<AparienciaPagina>(pagina?.secciones?.apariencia ?? {});
  const [subiendo, setSubiendo] = useState<'logo' | 'portada' | null>(null);
  const [libre, setLibre] = useState<boolean | null>(null);
  const [errorSlug, setErrorSlug] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (slug === pagina?.slug) {
      setErrorSlug(false);
      setLibre(true);
      return;
    }
    let vigente = true;
    setLibre(null);
    setErrorSlug(false);
    const t = setTimeout(async () => {
      const { data, error } = await supabase().rpc('tu_pagina_slug_libre', { p_company: companyId, p_slug: slug });
      if (!vigente) return;
      setErrorSlug(Boolean(error));
      setLibre(error ? null : data === true);
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [slug, companyId, pagina?.slug]);

  async function subirImagen(file: File, destino: 'logo' | 'portada') {
    setSubiendo(destino);
    try {
      const url = await subirImagenMarca(file, companyId, destino === 'logo' ? 'brand' : 'catalog');
      if (destino === 'logo') setLogo(url);
      else setPortada(url);
      avisar('Imagen lista. Guarda los cambios para publicarla.');
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    } finally {
      setSubiendo(null);
    }
  }

  async function guardar() {
    if (!esUrlPublica(logo) || !esUrlPublica(portada)) { avisar('El logo y la portada deben tener un enlace público https.', 'error'); return; }
    if (reclamos && !proveedorCompleto(proveedor)) { avisar('Para el Libro de Reclamaciones faltan tu razón social, un RUC válido (11 cifras) y la dirección.', 'error'); return; }
    setGuardando(true);
    try {
      const { error } = await supabase().rpc('tu_pagina_guardar', {
        p_company: companyId,
        p_publicar: true,
        p_datos: {
          slug,
          titulo: titulo.trim(),
          frase: frase.trim(),
          whatsapp: telefonoNormal(whatsapp),
          color,
          plantilla: plantillaGuardada(es),
          logo_url: logo.trim(),
          portada_url: portada.trim(),
          secciones: {
            envios, catalogo, reservar, tipos: es === 'ambos' ? tipos : {}, apariencia,
            reclamos,
            proveedor: { razon_social: proveedor.razon_social.trim(), ruc: proveedor.ruc.replace(/\D/g, ''), direccion: proveedor.direccion.trim() },
          },
          distritos: distritos.split(/[,\n]/).map((d) => d.trim()).filter(Boolean),
        },
      });
      if (error) throw error;
      const { data } = await supabase().auth.getSession();
      await fetch('/api/tu-pagina/panel/publicar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ company_id: companyId }),
      }).catch(() => undefined);
      avisar('Publicada. Ya la pueden abrir tus clientes.');
      alGuardar();
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  const publicada = pagina?.publicada && pagina.slug;
  const vista = urlVista(slug, { tipo: es, color, apariencia });

  return (
    <div className="tp-panel-grid">
      <section className="card">
        <div className="card-mini-head"><h3>{publicada ? 'Mi página' : 'Crea tu página en un minuto'}</h3></div>

        <label className="tp-panel-campo">
          <span>Nombre que verán tus clientes</span>
          <input className="input" value={titulo} maxLength={60} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="tp-panel-campo">
          <span>Una línea debajo <small className="muted">(opcional)</small></span>
          <input className="input" value={frase} maxLength={120} placeholder="Envíos en todo Lima, recojo el mismo día" onChange={(e) => setFrase(e.target.value)} />
        </label>
        <label className="tp-panel-campo">
          <span>Tu WhatsApp, a donde te llegará todo</span>
          <input className="input" value={whatsapp} inputMode="tel" placeholder="987 654 321" onChange={(e) => setWhatsapp(e.target.value)} />
        </label>
        <div className="tp-panel-campo"><span>Logo</span>
          <label className="tp-panel-subir">{subiendo === 'logo' ? 'Subiendo…' : logo ? 'Cambiar logo' : 'Subir logo'}
            <input type="file" accept="image/*" disabled={subiendo !== null} onChange={(e) => { const file = e.target.files?.[0]; if (file) void subirImagen(file, 'logo'); e.target.value = ''; }} />
          </label>
          {logo && esUrlPublica(logo) && <img className="tp-panel-imagen tp-panel-imagen--logo" src={logo} alt="Vista previa del logo" />}
          <label className="tp-panel-enlace-imagen">O pega un enlace HTTPS<input className="input" type="url" value={logo} placeholder="https://…/mi-logo.png" onChange={(e) => setLogo(e.target.value)} /></label>
        </div>

        <label className="tp-panel-campo">
          <span>Tu dirección</span>
          <div className="tp-panel-slug">
            <span className="muted">{urlPagina('', compania?.business_mode).replace(/^https?:\/\//, '')}</span>
            <input className="input" value={slug} maxLength={40} onChange={(e) => setSlug(sugerirSlug(e.target.value, true))} />
          </div>
          <small className={libre === false || errorSlug ? 'tp-panel-mal' : 'muted'}>
            {errorSlug ? 'No se pudo comprobar. Intenta nuevamente.' : libre === null ? 'Comprobando…' : libre ? 'Disponible' : 'No disponible: prueba con otra'}
          </small>
        </label>

        <div className="tp-panel-campo">
          <span>¿Qué harán tus clientes en tu página?</span>
          <div className="tp-panel-es" role="radiogroup" aria-label="Tu página es">
            {ES.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={es === o.id} className={es === o.id ? 'activa' : ''} onClick={() => setEs(o.id)}>
                <span className={`tp-panel-es__mini tp-panel-es__mini--${o.id}`} aria-hidden="true"><i /><i /><i /></span>
                <b>{o.nombre}</b>
                <small>{o.id === 'agenda' && esRecurrente(modo) ? 'Separan cupos y eligen horario.' : o.describe}</small>
              </button>
            ))}
          </div>
          {es && <small className="muted">{dondeLlega(es, modo, agendaNube)}</small>}
        </div>

        {es === 'ambos' && <QueSeReserva companyId={companyId} tipos={tipos} alCambiar={setTipos} />}

        <div className="tp-panel-campo">
          <span>Color principal</span>
          <div className="tp-panel-colores">
            {COLORES.map((c) => <button key={c} type="button" aria-label={`Elegir ${c}`} aria-pressed={color.toUpperCase() === c} style={{ background: c }} onClick={() => setColor(c)} />)}
            <label className="tp-panel-color-libre"><input type="color" value={esHex(color) ? color : '#006BFF'} onChange={(e) => setColor(e.target.value.toUpperCase())} /><span>Otro color</span></label>
          </div>
          <small className="muted">Se aplica a botones y selecciones. En “Agenda y tienda”, la tienda mantiene un contraste propio que puedes ajustar abajo.</small>
        </div>

        <details className="tp-panel-avanzado">
          <summary>Personalizar más <small>Portada, secciones y colores específicos</small></summary>
          <div className="tp-panel-avanzado__contenido">
            <div className="tp-panel-campo"><span>Imagen de portada <small className="muted">(opcional)</small></span>
              <label className="tp-panel-subir">{subiendo === 'portada' ? 'Subiendo…' : portada ? 'Cambiar portada' : 'Subir portada'}
                <input type="file" accept="image/*" disabled={subiendo !== null} onChange={(e) => { const file = e.target.files?.[0]; if (file) void subirImagen(file, 'portada'); e.target.value = ''; }} />
              </label>
              {portada && esUrlPublica(portada) && <img className="tp-panel-imagen tp-panel-imagen--portada" src={portada} alt="Vista previa de la portada" />}
              <label className="tp-panel-enlace-imagen">O pega un enlace HTTPS<input className="input" type="url" value={portada} placeholder="https://…/portada.jpg" onChange={(e) => setPortada(e.target.value)} /></label>
            </div>
            <label className="tp-panel-check"><input type="checkbox" checked={apariencia.mostrarBanner !== false} onChange={(e) => setApariencia({ ...apariencia, mostrarBanner: e.target.checked })} /><span><b>Mostrar portada</b><small className="muted">Puede llevar imagen o un color de fondo.</small></span></label>
            {apariencia.mostrarBanner !== false && <label className="tp-panel-campo"><span>Título de la portada <small className="muted">(opcional)</small></span><input className="input" maxLength={80} value={apariencia.tituloBanner ?? ''} placeholder="Algo nuevo te espera" onChange={(e) => setApariencia({ ...apariencia, tituloBanner: e.target.value })} /></label>}
            <label className="tp-panel-check"><input type="checkbox" checked={apariencia.mostrarWhatsapp !== false} onChange={(e) => setApariencia({ ...apariencia, mostrarWhatsapp: e.target.checked })} /><span><b>Mostrar botón de WhatsApp</b><small className="muted">Los pedidos y reservas siguen enviando su aviso.</small></span></label>


            <div className="tp-panel-colores-avanzados">
              {(es !== 'agenda' ? [{ key: 'colorTienda', label: 'Botones de tienda', fallback: '#111111' }, { key: 'fondoTienda', label: 'Fondo de tienda', fallback: '#FFFFFF' }] : []).concat(es !== 'tienda' ? [{ key: 'fondoAgenda', label: 'Fondo de agenda', fallback: '#F8F9FB' }] : [], [{ key: 'colorBanner', label: 'Color de portada', fallback: color }]).map((item) => (
                <label key={item.key}><span>{item.label}</span><input type="color" value={esHex(apariencia[item.key as keyof AparienciaPagina]) ? apariencia[item.key as keyof AparienciaPagina] as string : item.fallback} onChange={(e) => setApariencia({ ...apariencia, [item.key]: e.target.value.toUpperCase() })} /></label>
              ))}
            </div>
          </div>
        </details>

        {/* Lo que no todos necesitan: se enciende si se quiere y solo entonces pide sus datos. */}
        <div className="tp-panel-campo">
          <span>Apartados opcionales</span>
          <div className="tp-panel-apartados">
            <Apartado activo={envios} alCambiar={setEnvios} titulo="Agendar envíos" describe="Tus clientes te piden un recojo: dirección, distrito y fecha.">
              <label className="tp-panel-campo"><span>Distritos que atiendes <small className="muted">(vacío = cualquiera)</small></span><textarea className="input" rows={2} value={distritos} placeholder="Miraflores, Surco, San Isidro" onChange={(e) => setDistritos(e.target.value)} /></label>
            </Apartado>
            <Apartado activo={reclamos} alCambiar={setReclamos} titulo="Libro de Reclamaciones" describe="El libro virtual que pide INDECOPI, al pie de tu página. Los reclamos te llegan aquí.">
              <label className="tp-panel-campo"><span>Razón social o nombre del titular</span><input className="input" maxLength={120} value={proveedor.razon_social} placeholder="Inversiones Lima S.A.C." onChange={(e) => setProveedor({ ...proveedor, razon_social: e.target.value })} /></label>
              <label className="tp-panel-campo">
                <span>RUC</span>
                <input className="input" inputMode="numeric" maxLength={11} value={proveedor.ruc} placeholder="20123456789" onChange={(e) => setProveedor({ ...proveedor, ruc: e.target.value.replace(/\D/g, '') })} />
                {proveedor.ruc.length === 11 && !rucValido(proveedor.ruc) && <small className="tp-panel-mal">Ese RUC no parece válido.</small>}
              </label>
              <label className="tp-panel-campo"><span>Dirección del local</span><input className="input" maxLength={200} value={proveedor.direccion} placeholder="Av. Larco 123, Miraflores, Lima" onChange={(e) => setProveedor({ ...proveedor, direccion: e.target.value })} /></label>
            </Apartado>
          </div>
        </div>

        <button className="btn btn-primary" disabled={guardando || subiendo !== null || libre !== true || !whatsapp.trim() || !titulo.trim() || !esUrlPublica(logo) || !esUrlPublica(portada)} onClick={() => void guardar()}>
          {guardando ? 'Publicando…' : publicada ? 'Guardar cambios' : 'Publicar mi página'}
        </button>
      </section>

      <div className="tp-panel-lado">
        {publicada && (
          <section className="card">
            <div className="card-mini-head">
              <h3>Así se ve</h3>
              <a className="btn btn-sm btn-ghost" href={vista} target="_blank" rel="noopener"><ExternalLink size={14} /> En grande</a>
            </div>
            <div className="tp-panel-vista">
              <iframe title="Vista previa de tu página" src={vista} />
            </div>
            {(es !== tipoPagina(pagina!.secciones) || color !== pagina!.color || titulo !== pagina!.titulo || frase !== pagina!.frase || logo !== (pagina!.logo_url ?? '') || portada !== (pagina!.portada_url ?? '') || JSON.stringify(apariencia) !== JSON.stringify(pagina!.secciones.apariencia ?? {})) && (
              <small className="muted">Vista previa del diseño. El nombre y las imágenes se actualizarán al guardar.</small>
            )}
          </section>
        )}
        {publicada && <Compartir slug={pagina!.slug} envios={Boolean(pagina!.secciones?.envios)} reservar={Boolean(pagina!.secciones?.reservar)} conCatalogo={Boolean(pagina!.secciones?.catalogo || pagina!.secciones?.reservar)} />}
      </div>
    </div>
  );
}

function Compartir({ slug, envios, reservar, conCatalogo }: { slug: string; envios: boolean; reservar: boolean; conCatalogo: boolean }) {
  const avisar = useAvisar();
  const modo = useSesion().compania?.business_mode;
  const enlaces = [
    { nombre: 'Mi página', url: urlPagina(slug, modo) },
    ...(reservar ? [{ nombre: 'Directo a reservar', url: urlReservar(slug, modo) }] : []),
    ...(envios ? [{ nombre: 'Directo a envíos', url: urlEnvio(slug, modo) }] : []),
  ];
  async function bajarQr(url: string) {
    const png = await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
    const a = document.createElement('a');
    a.href = png;
    a.download = `qr-${slug}.png`;
    a.click();
  }
  return (
    <section className="card">
      <div className="card-mini-head"><h3>Compártela</h3></div>
      <p className="muted" style={{ fontSize: 13 }}>En tu Instagram, en tus estados de WhatsApp o impresa en el mostrador.</p>
      {enlaces.map((e) => (
        <div className="tp-panel-enlace" key={e.url}>
          <div><small className="muted">{e.nombre}</small><b>{e.url.replace(/^https?:\/\//, '')}</b></div>
          <div className="tp-panel-enlace__acciones">
            <button className="btn btn-sm btn-ghost" title="Copiar" onClick={() => void navigator.clipboard.writeText(e.url).then(() => avisar('Copiado'))}><Copy size={15} /></button>
            <button className="btn btn-sm btn-ghost" title="Descargar QR" onClick={() => void bajarQr(e.url)}><QrCode size={15} /></button>
            <a className="btn btn-sm btn-ghost" title="Abrir" href={e.url} target="_blank" rel="noopener"><ExternalLink size={15} /></a>
          </div>
        </div>
      ))}
      {conCatalogo && <CatalogoPdf url={`${urlPagina(slug, modo)}/catalogo.pdf`} />}
    </section>
  );
}

/** Un apartado opcional de la página: una casilla y, encendido, sus campos. */
function Apartado({ activo, alCambiar, titulo, describe, children }: {
  activo: boolean; alCambiar: (v: boolean) => void; titulo: string; describe: string; children: React.ReactNode;
}) {
  return (
    <div className={`tp-panel-apartado${activo ? ' activo' : ''}`}>
      <label className="tp-panel-check">
        <input type="checkbox" checked={activo} onChange={(e) => alCambiar(e.target.checked)} />
        <span><b>{titulo}</b><small className="muted">{describe}</small></span>
      </label>
      {activo && <div className="tp-panel-apartado__campos">{children}</div>}
    </div>
  );
}

/**
 * El catálogo en PDF (servidor/pdf.tsx): el archivo para mandar como documento
 * por WhatsApp, y el enlace fijo que siempre trae los precios de hoy.
 */
function CatalogoPdf({ url }: { url: string }) {
  const avisar = useAvisar();
  return (
    <div className="tp-panel-enlace">
      <div>
        <small className="muted"><FileText size={12} style={{ verticalAlign: '-2px' }} /> Catálogo en PDF · se actualiza solo</small>
        <b>{url.replace(/^https?:\/\//, '')}</b>
      </div>
      <div className="tp-panel-enlace__acciones">
        <button className="btn btn-sm btn-ghost" title="Copiar enlace" onClick={() => void navigator.clipboard.writeText(url).then(() => avisar('Copiado'))}><Copy size={15} /></button>
        <a className="btn btn-sm btn-ghost" title="Descargar PDF" href={`${url}?descargar=1`}><Download size={15} /></a>
        <a className="btn btn-sm btn-ghost" title="Abrir" href={url} target="_blank" rel="noopener"><ExternalLink size={15} /></a>
      </div>
    </div>
  );
}

/**
 * Dónde ve el dueño lo que llega. Con la agenda en la nube, en la Agenda y en
 * Pedidos del panel aunque su negocio sea de otro tipo (el menú las enseña si
 * la página reserva o vende: modules/tu-pagina/ui/secciones.ts); sin ella, en
 * las pestañas de aquí arriba.
 */
function dondeLlega(es: Es, modo: BusinessMode | null | undefined, agendaNube: boolean) {
  const citas = es !== 'tienda';
  const pedidos = es !== 'agenda';
  if (!agendaNube) {
    return `Te avisan por WhatsApp y lo ves aquí, en ${citas && pedidos ? '«Reservas» y «Pedidos»' : citas ? '«Reservas»' : '«Pedidos»'}.`;
  }
  return (
    <>
      Te avisan por WhatsApp y entra en{' '}
      {citas && <Link href="/panel/agenda">{esAppointmentFamily(modo) ? 'tu Agenda' : 'la Agenda'}</Link>}
      {citas && pedidos && ' y en '}
      {pedidos && <Link href="/panel/pedidos">Pedidos</Link>}.
    </>
  );
}

const POR_PAGINA_RESERVA = 12;

/**
 * En «Las dos», qué se reserva y qué se compra: una casilla por cosa del
 * catálogo. Sin marcar, lo que diría el modo (dominio/tienda.ts, tipoPorDefecto).
 */
function QueSeReserva({ companyId, tipos, alCambiar }: { companyId: string; tipos: TiposDePagina; alCambiar: (t: TiposDePagina) => void }) {
  const modo = useSesion().compania?.business_mode;
  const [limite, setLimite] = useState(POR_PAGINA_RESERVA);
  const { datos, cargando, error } = useCargar(async () => {
    const { data, error } = await supabase()
      .from('catalog')
      .select('id, name, duration_minutes, schedule_slots, is_active')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    type Fila = { id: string; name: string; duration_minutes: number | null; schedule_slots: string | null; is_active: number | null };
    return ((data ?? []) as Fila[])
      .filter((k) => k.is_active !== 0)
      .map((k) => ({ id: k.id, nombre: k.name, duracion: k.duration_minutes, conGrupos: conFranjas(k.schedule_slots) }));
  }, [companyId]);

  const items = datos ?? [];
  const seReserva = (k: (typeof items)[number]) => {
    const m = tipos[k.id];
    return m ? m !== 'producto' : tipoPorDefecto(modo, k) !== 'producto';
  };

  return (
    <div className="tp-panel-campo">
      <span>¿Qué se reserva?</span>
      <small className="muted">Lo marcado se reserva con día y hora; lo demás se compra.</small>
      {cargando && !datos && <small className="muted">Cargando tu catálogo…</small>}
      {error && <small className="tp-panel-mal">No se pudo cargar tu catálogo.</small>}
      {datos && items.length === 0 && <small className="muted">Tu catálogo está vacío. Agrega lo que ofreces en <Link href="/panel/catalogo">Catálogo</Link>.</small>}
      <div className="tp-panel-reserva">
        {items.slice(0, limite).map((k) => (
          <label key={k.id} className="tp-panel-reserva__fila">
            <input type="checkbox" checked={seReserva(k)} onChange={(e) => alCambiar({ ...tipos, [k.id]: e.target.checked ? 'cita' : 'producto' })} />
            <span>{k.nombre}</span>
            {seReserva(k) && <small className="muted">{k.conGrupos ? 'por grupos' : k.duracion ? `${k.duracion} min` : 'un turno'}</small>}
          </label>
        ))}
      </div>
      {items.length > limite && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLimite((n) => n + POR_PAGINA_RESERVA * 4)}>
          Ver más ({items.length - limite})
        </button>
      )}
    </div>
  );
}

const conFranjas = (raw: string | null) => {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) && v.length > 0;
  } catch {
    return false;
  }
};

/** «Barbería El Centro» → barberia-el-centro. Mientras se escribe, deja el guion final. */
function sugerirSlug(v: string, escribiendo = false): string {
  const s = v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40);
  return escribiendo ? s : s.replace(/-+$/, '');
}

/* ═══════════════════════════════════════════════════════════════════════
   ENVÍOS
   ═══════════════════════════════════════════════════════════════════════ */

const FILTROS: { id: EstadoEnvio | 'todos'; nombre: string }[] = [
  { id: 'por_recoger', nombre: 'Por recoger' },
  { id: 'impreso', nombre: 'Impresos' },
  { id: 'recogido', nombre: 'En camino' },
  { id: 'entregado', nombre: 'Entregados' },
  { id: 'todos', nombre: 'Todos' },
];

function Envios({ companyId, pagina, nombre, codigo, alConfigurar }: {
  companyId: string; pagina: Pagina | null; nombre: string; codigo: string | null; alConfigurar: () => void;
}) {
  const avisar = useAvisar();
  const [filtro, setFiltro] = useState<EstadoEnvio | 'todos'>(codigo ? 'todos' : 'por_recoger');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);

  const { datos, cargando, error, releer } = useCargar(async () => {
    let q = supabase().from('envios').select('*').eq('company_id', companyId).order('creado_at', { ascending: false }).limit(limite + 1);
    if (codigo) q = q.eq('codigo', codigo.toUpperCase());
    else if (filtro !== 'todos') q = q.eq('estado', filtro);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as Envio[];
  }, [companyId, filtro, limite, codigo]);

  const lista = useMemo(() => (datos ?? []).slice(0, limite), [datos, limite]);
  const hayMas = (datos?.length ?? 0) > limite;
  const elegidos = lista.filter((e) => marcados.has(e.id));
  useEffect(() => setMarcados(new Set()), [filtro, codigo]);

  async function cambiarEstado(ids: string[], estado: EstadoEnvio) {
    const { error } = await supabase().rpc('envios_estado', { p_company: companyId, p_ids: ids, p_estado: estado });
    if (error) throw new Error(error.message);
  }

  async function etiquetas(formato: Formato) {
    if (!elegidos.length) return;
    setOcupado(true);
    try {
      const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const ok = await imprimir(() => hojaEtiquetas(elegidos, nombre, formato, base));
      if (!ok) return avisar('El navegador bloqueó la ventana. Permite ventanas emergentes para vendemias.com.', 'error');
      const porRecoger = elegidos.filter((e) => e.estado === 'por_recoger').map((e) => e.id);
      if (porRecoger.length) await cambiarEstado(porRecoger, 'impreso');
      releer();
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function marcar(estado: EstadoEnvio) {
    setOcupado(true);
    try {
      await cambiarEstado(elegidos.map((e) => e.id), estado);
      avisar(`${elegidos.length} ${elegidos.length === 1 ? 'envío' : 'envíos'}: ${nombreEstado(estado).toLowerCase()}`);
      setMarcados(new Set());
      releer();
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  if (!pagina?.publicada || !pagina.secciones?.envios) {
    return (
      <section className="card">
        <p className="vacio">
          Todavía no recibes envíos. Publica tu página con «Agendar un envío» encendido y comparte el enlace.
        </p>
        <button className="btn btn-primary" onClick={alConfigurar}>Configurar mi página</button>
      </section>
    );
  }

  const todos = lista.length > 0 && elegidos.length === lista.length;

  return (
    <section className="card table-card">
      <div className="tp-panel-barra">
        {codigo ? (
          <p className="muted">Buscando el envío <b>{codigo}</b> · <a href="/panel/tu-pagina">ver todos</a></p>
        ) : (
          <div className="chip-tabs">
            {FILTROS.map((f) => (
              <button key={f.id} className={filtro === f.id ? 'active' : ''} onClick={() => { setFiltro(f.id); setLimite(POR_PAGINA); }}>
                {f.nombre}
              </button>
            ))}
          </div>
        )}
        {elegidos.length > 0 && (
          <div className="tp-panel-acciones">
            <span className="muted">{elegidos.length} elegidos</span>
            <button className="btn btn-sm btn-primary" disabled={ocupado} onClick={() => void etiquetas('a4')}><Printer size={14} /> Etiquetas A4</button>
            <button className="btn btn-sm" disabled={ocupado} onClick={() => void etiquetas('termica')}><Printer size={14} /> Térmica 10×15</button>
            <select
              className="input tp-panel-estado"
              value=""
              disabled={ocupado}
              onChange={(e) => e.target.value && void marcar(e.target.value as EstadoEnvio)}
              aria-label="Marcar como"
            >
              <option value="">Marcar como…</option>
              {ESTADOS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && <p className="vacio">No se pudieron cargar los envíos: {error}</p>}
      {cargando && !datos && <p className="vacio">Cargando envíos…</p>}
      {datos && lista.length === 0 && <p className="vacio">{codigo ? 'No hay ningún envío con ese código.' : 'No hay envíos aquí.'}</p>}

      {lista.length > 0 && (
        <ul className="tp-panel-lista">
          <li className="tp-panel-fila tp-panel-fila--cab">
            <label>
              <input type="checkbox" checked={todos} onChange={() => setMarcados(todos ? new Set() : new Set(lista.map((e) => e.id)))} aria-label="Elegir todos" />
            </label>
            <span className="muted">{lista.length} {lista.length === 1 ? 'envío' : 'envíos'}</span>
          </li>
          {lista.map((e) => (
            <li key={e.id} className={`tp-panel-fila${marcados.has(e.id) ? ' tp-panel-fila--sel' : ''}`}>
              <label>
                <input
                  type="checkbox"
                  checked={marcados.has(e.id)}
                  onChange={() => setMarcados((m) => { const n = new Set(m); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
                  aria-label={`Elegir ${e.codigo}`}
                />
              </label>
              <div className="tp-panel-fila__cuerpo">
                <div className="tp-panel-fila__linea">
                  <b className="tp-panel-codigo">{e.codigo}</b>
                  <span className={`tp-panel-pill tp-panel-pill--${e.estado}`}>{nombreEstado(e.estado)}</span>
                </div>
                <div>
                  <b>{e.destinatario_nombre}</b> · {e.distrito}
                  <span className="muted"> · {telefonoBonito(e.destinatario_telefono)}</span>
                </div>
                <small className="muted">
                  {e.direccion}{e.referencia ? ` (${e.referencia})` : ''} · Recojo {fechaCorta(e.recojo_fecha)}, {nombreFranja(e.recojo_franja).toLowerCase()} ·{' '}
                  {e.bultos} {e.bultos === 1 ? 'bulto' : 'bultos'}
                  {e.contra_entrega ? ` · cobrar S/ ${Number(e.contra_entrega).toFixed(2)}` : ''} · de {e.remitente_nombre}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hayMas && (
        <button className="btn btn-ghost tp-panel-mas" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más</button>
      )}
    </section>
  );
}
