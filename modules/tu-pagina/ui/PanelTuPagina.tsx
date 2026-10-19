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
import { Copy, ExternalLink, Printer, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { COLORES } from '@/modules/fideliza/dominio/estilo';
import { urlPagina, urlEnvio } from '@/modules/tu-pagina/dominio/config';
import { esEcommerce, esRecurrente } from '@/lib/panel/modo';
import { PLANTILLAS, defPlantilla, esPlantilla, plantillaPorDefecto, type Plantilla } from '@/modules/tu-pagina/dominio/plantillas';

/**
 * La página con otra plantilla o color, sin guardar: se sirve en el dominio del
 * panel (hosts.ts no la manda a tienda.*) para poder ir en un iframe.
 */
const urlVista = (slug: string, plantilla: string, color: string) =>
  `/tu-pagina/${slug}?vista=1&plantilla=${plantilla}&color=${encodeURIComponent(color)}`;
import { Pedidos, Reservas } from '@/modules/tu-pagina/ui/PedidosYReservas';
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
  secciones: { catalogo?: boolean; reservar?: boolean; envios?: boolean };
  color: string;
  plantilla: string;
  distritos: string[];
  publicada: boolean;
}

const POR_PAGINA = 50;

type Pestana = 'pedidos' | 'reservas' | 'envios' | 'pagina';

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
              <MiPagina companyId={companyId} nombre={compania?.nombre ?? ''} pagina={pagina ?? null} alGuardar={releer} />
            ) : activa === 'pedidos' ? (
              <Pedidos companyId={companyId} nombre={pagina?.titulo || compania?.nombre || ''} />
            ) : activa === 'reservas' ? (
              <Reservas companyId={companyId} nombre={pagina?.titulo || compania?.nombre || ''} />
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

function MiPagina({ companyId, nombre, pagina, alGuardar }: { companyId: string; nombre: string; pagina: Pagina | null; alGuardar: () => void }) {
  const avisar = useAvisar();
  const { compania } = useSesion();
  const [titulo, setTitulo] = useState(pagina?.titulo || nombre);
  const [frase, setFrase] = useState(pagina?.frase ?? '');
  const [slug, setSlug] = useState(pagina?.slug ?? sugerirSlug(nombre || companyId));
  const [whatsapp, setWhatsapp] = useState(telefonoBonito(pagina?.whatsapp ?? ''));
  const modo = compania?.business_mode;
  const tienda = esEcommerce(modo);
  const [envios, setEnvios] = useState(pagina?.secciones?.envios ?? false);
  // Por defecto, lo que hace cada negocio: la tienda vende, el de citas o clases reserva.
  const [catalogo, setCatalogo] = useState(pagina ? Boolean(pagina.secciones?.catalogo) : tienda);
  const [reservar, setReservar] = useState(pagina ? Boolean(pagina.secciones?.reservar) : !tienda);
  const [distritos, setDistritos] = useState((pagina?.distritos ?? []).join(', '));
  const [color, setColor] = useState(pagina?.color ?? '#FF4900');
  // Una página que nunca eligió trae la de la base ('vitrina'); la nueva, la que va con su negocio.
  const [plantilla, setPlantilla] = useState<Plantilla>(esPlantilla(pagina?.plantilla) ? pagina!.plantilla as Plantilla : plantillaPorDefecto(modo));
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

  async function guardar() {
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
          plantilla,
          secciones: { envios, catalogo: tienda && catalogo, reservar: !tienda && reservar },
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
          <span>Qué pueden hacer tus clientes</span>
          {tienda ? (
            <label className="tp-panel-check">
              <input type="checkbox" checked={catalogo} onChange={(e) => setCatalogo(e.target.checked)} />
              <span><b>Ver mi catálogo y pedir</b><small className="muted">Eligen producto, opción y cantidad; el stock queda separado y te avisan por WhatsApp</small></span>
            </label>
          ) : esRecurrente(modo) ? (
            <label className="tp-panel-check">
              <input type="checkbox" checked={reservar} onChange={(e) => setReservar(e.target.checked)} />
              <span><b>Separar su cupo en un grupo</b><small className="muted">Ven tus niveles con los cupos que quedan; el cupo queda separado y te avisan por WhatsApp</small></span>
            </label>
          ) : (
            <label className="tp-panel-check">
              <input type="checkbox" checked={reservar} onChange={(e) => setReservar(e.target.checked)} />
              <span><b>Reservar una cita</b><small className="muted">Eligen servicio, día y hora libres; el hueco queda separado y te avisan por WhatsApp</small></span>
            </label>
          )}
          <label className="tp-panel-check">
            <input type="checkbox" checked={envios} onChange={(e) => setEnvios(e.target.checked)} />
            <span><b>Agendar un envío</b><small className="muted">Te llega con todo: dirección, distrito, fecha de recojo</small></span>
          </label>
        </div>

        {envios && (
          <label className="tp-panel-campo">
            <span>Distritos que atiendes <small className="muted">(vacío = cualquiera)</small></span>
            <textarea className="input" rows={2} value={distritos} placeholder="Miraflores, Surco, San Isidro" onChange={(e) => setDistritos(e.target.value)} />
          </label>
        )}

        <div className="tp-panel-campo">
          <span>Plantilla</span>
          <div className="tp-panel-plantillas" role="radiogroup" aria-label="Plantilla">
            {PLANTILLAS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={plantilla === p.id}
                className={`tp-panel-plantilla${plantilla === p.id ? ' activa' : ''}`}
                onClick={() => setPlantilla(p.id)}
              >
                <span className="tp-panel-plantilla__mini">
                  {publicada ? (
                    <iframe title={p.nombre} src={urlVista(pagina!.slug, p.id, color)} tabIndex={-1} loading="lazy" />
                  ) : (
                    <span className={`tp-panel-esquema tp-panel-esquema--${p.id}`} style={{ ['--c' as string]: color }} aria-hidden="true">
                      <i /><i /><i /><i />
                    </span>
                  )}
                </span>
                <b>{p.nombre}</b>
                <small className="muted">{p.para}</small>
              </button>
            ))}
          </div>
          <small className="muted">{defPlantilla(plantilla).describe}.{!publicada && ' Al publicar verás cada una con tus productos.'}</small>
        </div>

        <div className="tp-panel-campo">
          <span>Color</span>
          <div className="tp-panel-colores">
            {COLORES.map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>

        <button className="btn btn-primary" disabled={guardando || libre !== true || !whatsapp.trim()} onClick={() => void guardar()}>
          {guardando ? 'Publicando…' : publicada ? 'Guardar cambios' : 'Publicar mi página'}
        </button>
      </section>

      <div className="tp-panel-lado">
        {publicada && (
          <section className="card">
            <div className="card-mini-head">
              <h3>Así se ve</h3>
              <a className="btn btn-sm btn-ghost" href={urlVista(pagina!.slug, plantilla, color)} target="_blank" rel="noopener"><ExternalLink size={14} /> En grande</a>
            </div>
            <div className="tp-panel-vista">
              <iframe title="Vista previa de tu página" src={urlVista(pagina!.slug, plantilla, color)} />
            </div>
            {(plantilla !== pagina!.plantilla || color !== pagina!.color) && (
              <small className="muted">Vista previa sin guardar: tus clientes la verán al pulsar «Guardar cambios».</small>
            )}
          </section>
        )}
        {publicada && <Compartir slug={pagina!.slug} envios={Boolean(pagina!.secciones?.envios)} />}
      </div>
    </div>
  );
}

function Compartir({ slug, envios }: { slug: string; envios: boolean }) {
  const avisar = useAvisar();
  const modo = useSesion().compania?.business_mode;
  const enlaces = [{ nombre: 'Mi página', url: urlPagina(slug, modo) }, ...(envios ? [{ nombre: 'Directo a envíos', url: urlEnvio(slug, modo) }] : [])];
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
    </section>
  );
}

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
