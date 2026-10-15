'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TU PÁGINA EN EL PANEL · la página del negocio y sus envíos
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dos pestañas:
 *   · Envíos    lo que llegó desde la página, para imprimir etiquetas y
 *               llevar la cuenta de qué se recogió y qué se entregó.
 *   · La página la dirección, el WhatsApp a donde llega todo y qué secciones
 *               se enseñan. Si todavía no hay página, se abre aquí.
 *
 * El producto se llama «Tu página» (Alvaro, 15-oct-2026), por fuera y por
 * dentro. El host del enlace depende del modo: dominio/config.ts.
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
  distritos: string[];
  publicada: boolean;
}

const POR_PAGINA = 50;

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
  const [pestana, setPestana] = useState<'envios' | 'pagina'>('envios');
  const sinPagina = !cargando && !error && !pagina?.publicada;

  useEffect(() => {
    if (sinPagina) setPestana('pagina');
  }, [sinPagina]);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Tu página" sub="El enlace para que tus clientes te pidan, y lo que te piden" />
        {error && <p className="vacio">No se pudo cargar: {error}</p>}
        {cargando && !pagina && <p className="vacio">Cargando…</p>}
        {!cargando && !error && companyId && (
          <>
            <div className="chip-tabs tp-panel-tabs" role="tablist">
              <button role="tab" aria-selected={pestana === 'envios'} className={pestana === 'envios' ? 'active' : ''} onClick={() => setPestana('envios')}>
                Envíos
              </button>
              <button role="tab" aria-selected={pestana === 'pagina'} className={pestana === 'pagina' ? 'active' : ''} onClick={() => setPestana('pagina')}>
                La página
              </button>
            </div>
            {pestana === 'pagina' ? (
              <MiPagina companyId={companyId} nombre={compania?.nombre ?? ''} pagina={pagina ?? null} alGuardar={releer} />
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
  const [envios, setEnvios] = useState(pagina?.secciones?.envios ?? true);
  const [distritos, setDistritos] = useState((pagina?.distritos ?? []).join(', '));
  const [color, setColor] = useState(pagina?.color ?? '#FF4900');
  const [libre, setLibre] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (slug === pagina?.slug) return setLibre(true);
    setLibre(null);
    const t = setTimeout(async () => {
      const { data } = await supabase().rpc('tu_pagina_slug_libre', { p_company: companyId, p_slug: slug });
      setLibre(Boolean(data));
    }, 400);
    return () => clearTimeout(t);
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
          secciones: { envios },
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
        <div className="card-mini-head"><h3>{publicada ? 'Tu página' : 'Crea tu página en un minuto'}</h3></div>

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
          <small className={libre === false ? 'tp-panel-mal' : 'muted'}>
            {libre === null ? 'Comprobando…' : libre ? 'Disponible' : 'No disponible: prueba con otra'}
          </small>
        </label>

        <div className="tp-panel-campo">
          <span>Qué pueden hacer tus clientes</span>
          <label className="tp-panel-check">
            <input type="checkbox" checked={envios} onChange={(e) => setEnvios(e.target.checked)} />
            <span><b>Agendar un envío</b><small className="muted">Te llega con todo: dirección, distrito, fecha de recojo</small></span>
          </label>
          <label className="tp-panel-check tp-panel-check--pronto">
            <input type="checkbox" disabled />
            <span><b>Ver mi catálogo y pedir</b><small className="muted">Muy pronto</small></span>
          </label>
          <label className="tp-panel-check tp-panel-check--pronto">
            <input type="checkbox" disabled />
            <span><b>Reservar una cita</b><small className="muted">Muy pronto</small></span>
          </label>
        </div>

        {envios && (
          <label className="tp-panel-campo">
            <span>Distritos que atiendes <small className="muted">(vacío = cualquiera)</small></span>
            <textarea className="input" rows={2} value={distritos} placeholder="Miraflores, Surco, San Isidro" onChange={(e) => setDistritos(e.target.value)} />
          </label>
        )}

        <div className="tp-panel-campo">
          <span>Color</span>
          <div className="tp-panel-colores">
            {COLORES.map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>

        <button className="btn btn-primary" disabled={guardando || libre === false || !whatsapp.trim()} onClick={() => void guardar()}>
          {guardando ? 'Publicando…' : publicada ? 'Guardar cambios' : 'Publicar mi página'}
        </button>
      </section>

      {publicada && <Compartir slug={pagina!.slug} envios={Boolean(pagina!.secciones?.envios)} />}
    </div>
  );
}

function Compartir({ slug, envios }: { slug: string; envios: boolean }) {
  const avisar = useAvisar();
  const modo = useSesion().compania?.business_mode;
  const enlaces = [{ nombre: 'Tu página', url: urlPagina(slug, modo) }, ...(envios ? [{ nombre: 'Directo a envíos', url: urlEnvio(slug, modo) }] : [])];
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
