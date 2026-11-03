'use client';

/**
 * /panel/mesas · lo que piden desde el QR de las mesas (sql/0015).
 *
 * «En vivo» es de todo el equipo. Mesas y QR, Carta, Comentarios e Historial son del
 * dueño y del administrador, y Postgres lo impone igual (tu_pagina_autorizar). Se
 * consulta cada 10 s con la pantalla a la vista: es lo que queda abierto en la estación
 * de los mozos, y funciona aunque un celular no tenga los avisos activos.
 *
 * Nada de esto entra a la Caja ni a Pedidos: el mozo sigue comandando y cobrando en el
 * POS del restaurante.
 */
import { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCheck, ExternalLink, Printer, QrCode, ReceiptText, ScanLine, ShoppingBasket, Star, MessageSquare, PencilLine } from 'lucide-react';
import QRCode from 'qrcode';
import Topbar from '@/components/panel/Topbar';
import AvisosDelEquipo from '@/components/panel/AvisosDelEquipo';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { rolDeNegocio } from '@/lib/panel/roles';
import EscanerQr, { hayEscaner } from '@/modules/fideliza/ui/EscanerQr';
import { urlPagina } from '@/modules/tu-pagina/dominio/config';
import { soles } from '@/modules/tu-pagina/dominio/tienda';
import { telefonoBonito, urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import { limpiarAjustes, nombreMesa, tokenDeUrl, type AjustesCarta, type AjustePlato, type TipoLlamado } from '@/modules/tu-pagina/dominio/mesa';
import { imprimirMesas } from '@/modules/tu-pagina/ui/hojaMesas';
import '@/modules/tu-pagina/estilos/panel.css';
import './mesas.css';

const POR_PAGINA = 30;
type Pestana = 'vivo' | 'mesas' | 'carta' | 'comentarios' | 'historial';

const errorDe = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message) || 'Algo salió mal.';
const faltaSql = (m: string) => /mesa_|plantilla_check|schema cache/.test(m);
const mensajeError = (m: string) => (faltaSql(m) ? 'falta correr la migración 0015 de Mi página.' : m);

const espera = (seg: number) => {
  const s = Math.max(0, seg);
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
};

interface Linea { nombre: string; opcion: string; precio: number; cantidad: number }
interface Llamado {
  id: string; tipo: TipoLlamado; salon: string; numero: string; detalle: string; comprobante: string; documento: string;
  dividir: boolean; lineas: Linea[]; total: number; repeticiones: number; espera: number;
}
interface Mesa { id: string; salon: string; numero: string; token: string; activa: boolean }

const ICONO = { mozo: BellRing, cuenta: ReceiptText, requerimiento: PencilLine, pedido: ShoppingBasket, sugerencia: MessageSquare, felicitacion: Star };
const NOMBRE: Record<TipoLlamado, string> = {
  mozo: 'Llama al mozo', cuenta: 'Pide la cuenta', requerimiento: 'Otro pedido', pedido: 'Quiere pedir', sugerencia: 'Sugerencia', felicitacion: 'Felicitación',
};

export default function PanelMesas() {
  const { companyId, compania } = useSesion();
  const rol = rolDeNegocio(compania?.rol);
  const administra = rol !== 'empleado';
  const [pestana, setPestana] = useState<Pestana>('vivo');
  const pestanas: { id: Pestana; nombre: string }[] = [
    { id: 'vivo', nombre: 'En vivo' },
    ...(administra ? [
      { id: 'mesas' as const, nombre: 'Mesas y QR' },
      { id: 'carta' as const, nombre: 'Carta' },
      { id: 'comentarios' as const, nombre: 'Comentarios' },
      { id: 'historial' as const, nombre: 'Historial' },
    ] : []),
  ];
  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Mesas" sub="Lo que piden desde el QR de cada mesa. Tu sistema de comandas sigue igual." />
        {companyId && (
          <>
            {pestanas.length > 1 && (
              <div className="tp-panel-tabs" role="tablist" aria-label="Secciones de Mesas">
                {pestanas.map((p) => (
                  <button key={p.id} role="tab" aria-selected={pestana === p.id} className={pestana === p.id ? 'active' : ''} onClick={() => setPestana(p.id)}>{p.nombre}</button>
                ))}
              </div>
            )}
            {pestana === 'vivo' && <EnVivo companyId={companyId} />}
            {pestana === 'mesas' && <MesasYQr companyId={companyId} />}
            {pestana === 'carta' && <AjustesDeCarta companyId={companyId} />}
            {pestana === 'comentarios' && <Historial companyId={companyId} clase="comentarios" />}
            {pestana === 'historial' && <Historial companyId={companyId} clase="atendidos" />}
          </>
        )}
      </div>
    </main>
  );
}

/* ── En vivo ───────────────────────────────────────────────────────────────── */

function EnVivo({ companyId }: { companyId: string }) {
  const avisar = useAvisar();
  const [escaneando, setEscaneando] = useState(false);
  const [ocupado, setOcupado] = useState('');
  const [segundos, setSegundos] = useState(0);
  const { datos, cargando, error, releer } = useCargar(async () => {
    const { data, error } = await supabase().rpc('mesa_panel_vivo', { p_company: companyId });
    if (error) throw new Error(error.message);
    return data as { pendientes: Llamado[]; hoy: { atendidos: number; promedio: number } };
  }, [companyId]);

  useEffect(() => {
    const consulta = setInterval(() => { if (document.visibilityState === 'visible') { releer(); setSegundos(0); } }, 10_000);
    const reloj = setInterval(() => setSegundos((s) => s + 1), 1_000);
    return () => { clearInterval(consulta); clearInterval(reloj); };
  }, [releer]);

  async function llegue(l: Llamado) {
    setOcupado(l.id);
    const { error } = await supabase().rpc('mesa_panel_llegue', { p_company: companyId, p_id: l.id });
    setOcupado('');
    if (error) return avisar(errorDe(error), 'error');
    releer();
  }

  async function alEscanear(texto: string) {
    setEscaneando(false);
    const token = tokenDeUrl(texto);
    if (!token) return avisar('Ese QR no es de una mesa.', 'error');
    const { data, error } = await supabase().rpc('mesa_panel_llegue_qr', { p_company: companyId, p_token: token });
    if (error) return avisar(errorDe(error), 'error');
    const r = data as { status: string; cerrados?: number; salon?: string; numero?: string };
    if (r.status !== 'ok') return avisar('Ese QR no es de una mesa de este negocio.', 'error');
    avisar(r.cerrados ? `Llegada registrada · Mesa ${r.numero}` : `La mesa ${r.numero} no tenía llamados pendientes.`);
    releer();
  }

  const lista = datos?.pendientes ?? [];
  return (
    <>
      <section className="tm-p-resumen">
        <div><b>{lista.length}</b><small>esperando</small></div>
        <div><b>{datos?.hoy.atendidos ?? 0}</b><small>atendidos hoy</small></div>
        <div><b>{datos?.hoy.atendidos ? espera(datos.hoy.promedio) : '—'}</b><small>tiempo promedio</small></div>
        {hayEscaner() && <button className="btn btn-primary" onClick={() => setEscaneando((v) => !v)}><ScanLine size={16} /> {escaneando ? 'Cerrar cámara' : 'Llegué: escanear mesa'}</button>}
      </section>
      {escaneando && <section className="card tm-p-escaner"><EscanerQr alLeer={(t) => void alEscanear(t)} alFallar={() => { setEscaneando(false); avisar('No se pudo abrir la cámara.', 'error'); }} /></section>}

      {error && <p className="vacio">No se pudo cargar: {mensajeError(error)}</p>}
      {cargando && !datos && <p className="vacio">Cargando…</p>}
      {datos && lista.length === 0 && <p className="vacio">Ninguna mesa está esperando.</p>}

      <div className="tm-p-lista">
        {lista.map((l) => {
          const Icono = ICONO[l.tipo];
          const seg = l.espera + segundos;
          return (
            <article key={l.id} className={`card tm-p-llamado${seg >= 300 ? ' tm-p-llamado--tarde' : ''}`}>
              <header>
                <span className="tm-p-icono"><Icono size={20} aria-hidden="true" /></span>
                <div>
                  <h3>{nombreMesa(l)}</h3>
                  <p>{NOMBRE[l.tipo]}{l.repeticiones > 0 && <em> · insistió {l.repeticiones + 1} veces</em>}</p>
                </div>
                <time>{espera(seg)}</time>
              </header>
              {l.tipo === 'cuenta' && (
                <p className="tm-p-detalle">
                  {l.dividir ? 'Quieren dividir la cuenta.' : l.comprobante === 'factura' ? `Factura · RUC ${l.documento}` : `Boleta${l.documento ? ` · DNI ${l.documento}` : ''}`}
                </p>
              )}
              {l.tipo === 'pedido' && (
                <ul className="tm-p-lineas">
                  {l.lineas.map((x, i) => <li key={i}><b>{x.cantidad}×</b> {x.nombre}{x.opcion ? ` · ${x.opcion}` : ''}</li>)}
                </ul>
              )}
              {l.detalle && <p className="tm-p-detalle">“{l.detalle}”</p>}
              {l.tipo === 'pedido' && <p className="muted tm-p-nota">Confírmalo en la mesa y comándalo en tu sistema. Aproximado: {soles(l.total)}.</p>}
              <button className="btn btn-primary tm-p-llegue" disabled={ocupado === l.id} onClick={() => void llegue(l)}><CheckCheck size={16} /> {ocupado === l.id ? 'Registrando…' : 'Llegué a la mesa'}</button>
            </article>
          );
        })}
      </div>
      <div className="tm-p-avisos"><AvisosDelEquipo companyId={companyId} mesas /></div>
    </>
  );
}

/* ── Mesas y QR ────────────────────────────────────────────────────────────── */

function MesasYQr({ companyId }: { companyId: string }) {
  const avisar = useAvisar();
  const { compania } = useSesion();
  const modo = compania?.business_mode;
  const [salon, setSalon] = useState('');
  const [desde, setDesde] = useState('1');
  const [hasta, setHasta] = useState('10');
  const [guardando, setGuardando] = useState(false);
  const [limite, setLimite] = useState(POR_PAGINA);
  const { datos, cargando, error, releer } = useCargar(async () => {
    const [mesas, pagina] = await Promise.all([
      supabase().rpc('mesa_panel_mesas', { p_company: companyId }),
      supabase().from('tu_pagina').select('slug, titulo, publicada').eq('company_id', companyId).maybeSingle(),
    ]);
    if (mesas.error) throw new Error(mesas.error.message);
    return { mesas: (mesas.data ?? []) as Mesa[], pagina: pagina.data as { slug: string; titulo: string; publicada: boolean } | null };
  }, [companyId]);
  const mesas = datos?.mesas ?? [];
  const pagina = datos?.pagina;
  const urlDe = (m: Mesa) => `${urlPagina(pagina?.slug ?? '', modo)}/mesa/${m.token}`;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const { data, error } = await supabase().rpc('mesa_panel_crear', { p_company: companyId, p_salon: salon.trim(), p_desde: Number(desde), p_hasta: Number(hasta) });
    setGuardando(false);
    if (error) return avisar(errorDe(error), 'error');
    avisar(data ? `${data} ${data === 1 ? 'mesa creada' : 'mesas creadas'}.` : 'Esas mesas ya existían.');
    releer();
  }

  async function accion(fn: string, args: Record<string, unknown>) {
    const { error } = await supabase().rpc(fn, { p_company: companyId, ...args });
    if (error) return avisar(errorDe(error), 'error');
    releer();
  }

  async function bajarQr(m: Mesa) {
    const png = await QRCode.toDataURL(urlDe(m), { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
    const a = document.createElement('a');
    a.href = png;
    a.download = `qr-mesa-${m.salon ? `${m.salon}-` : ''}${m.numero}.png`;
    a.click();
  }

  async function imprimirTodas() {
    const activas = mesas.filter((m) => m.activa);
    const ok = await imprimirMesas(pagina?.titulo ?? '', activas.map((m) => ({ salon: m.salon, numero: m.numero, url: urlDe(m) })));
    if (!ok) avisar('Tu navegador bloqueó la ventana. Permite las ventanas emergentes.', 'error');
  }

  return (
    <section className="card table-card">
      <div className="card-mini-head">
        <h3>Mesas y QR</h3>
        {mesas.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => void imprimirTodas()}><Printer size={15} /> Imprimir todos</button>}
      </div>
      {pagina && !pagina.publicada && <p className="tm-p-aviso">Publica Mi página: los QR no abren hasta entonces.</p>}
      <form className="tm-p-crear" onSubmit={(e) => void crear(e)}>
        <label><span>Salón <small className="muted">(opcional)</small></span><input className="input" maxLength={40} value={salon} placeholder="Terraza" onChange={(e) => setSalon(e.target.value)} /></label>
        <label><span>Desde la mesa</span><input className="input" type="number" min={1} max={99999} required value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label><span>Hasta la mesa</span><input className="input" type="number" min={1} max={99999} required value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={guardando}>{guardando ? 'Creando…' : 'Crear mesas'}</button>
      </form>
      {error && <p className="vacio">No se pudo cargar: {mensajeError(error)}</p>}
      {cargando && !datos && <p className="vacio">Cargando…</p>}
      {datos && mesas.length === 0 && <p className="vacio">Crea tus mesas y luego imprime sus QR.</p>}
      {mesas.slice(0, limite).map((m) => (
        <div key={m.id} className="tp-avisame-fila">
          <span><b>{nombreMesa(m)}</b><small>{m.activa ? 'Activa' : 'Apagada: su QR no abre'}</small></span>
          <span className="tp-rec-acciones">
            <a className="btn btn-sm btn-ghost" href={urlDe(m)} target="_blank" rel="noopener" title="Abrir como cliente"><ExternalLink size={15} /></a>
            <button className="btn btn-sm btn-ghost" title="Descargar QR" onClick={() => void bajarQr(m)}><QrCode size={15} /></button>
            <button className="btn btn-sm btn-ghost" onClick={() => void accion('mesa_panel_activa', { p_id: m.id, p_activa: !m.activa })}>{m.activa ? 'Apagar' : 'Activar'}</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { if (window.confirm(`El QR impreso de ${nombreMesa(m)} dejará de funcionar y tendrás que imprimir otro. ¿Seguir?`)) void accion('mesa_panel_nuevo_qr', { p_id: m.id }); }}>Nuevo QR</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { if (window.confirm(`¿Quitar ${nombreMesa(m)}? Su historial se conserva.`)) void accion('mesa_panel_borrar', { p_id: m.id }); }}>Quitar</button>
          </span>
        </div>
      ))}
      {mesas.length > limite && <button className="btn btn-ghost tp-panel-mas" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más</button>}
    </section>
  );
}

/* ── Carta ─────────────────────────────────────────────────────────────────── */

function AjustesDeCarta({ companyId }: { companyId: string }) {
  const avisar = useAvisar();
  const [ajustes, setAjustes] = useState<AjustesCarta>({});
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [guardando, setGuardando] = useState(false);
  const [cambios, setCambios] = useState(false);
  const { datos, cargando, error } = useCargar(async () => {
    const [platos, pagina] = await Promise.all([
      supabase().from('catalog').select('id, name, price, is_active').eq('company_id', companyId).order('name'),
      supabase().from('tu_pagina').select('secciones').eq('company_id', companyId).maybeSingle(),
    ]);
    if (platos.error) throw new Error(platos.error.message);
    return {
      platos: ((platos.data ?? []) as { id: string; name: string; price: number | null; is_active: number | null }[]).filter((p) => p.is_active !== 0),
      carta: ((pagina.data?.secciones as { carta?: AjustesCarta } | null)?.carta ?? {}) as AjustesCarta,
    };
  }, [companyId]);

  useEffect(() => {
    if (datos && !cambios) setAjustes(datos.carta);
  }, [datos, cambios]);

  const texto = busca.trim().toLocaleLowerCase('es');
  const platos = useMemo(() => (datos?.platos ?? []).filter((p) => p.name.toLocaleLowerCase('es').includes(texto)), [datos, texto]);

  const poner = (id: string, cambio: Partial<AjustePlato>) => {
    setCambios(true);
    setAjustes((a) => ({ ...a, [id]: { ...a[id], ...cambio } }));
  };

  async function guardar() {
    setGuardando(true);
    try {
      const carta = limpiarAjustes(ajustes, (datos?.platos ?? []).map((p) => p.id));
      const { error } = await supabase().rpc('tu_pagina_guardar', { p_company: companyId, p_datos: { secciones: { carta } }, p_publicar: false });
      if (error) throw error;
      const { data } = await supabase().auth.getSession();
      await fetch('/api/tu-pagina/panel/publicar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ company_id: companyId }),
      }).catch(() => undefined);
      setAjustes(carta);
      setCambios(false);
      avisar('Carta guardada.');
    } catch (e) {
      avisar(errorDe(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="card table-card">
      <div className="card-mini-head">
        <h3>Ajustes de la carta</h3>
        <button className="btn btn-primary btn-sm" disabled={guardando || !cambios} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
      <p className="muted tm-p-intro">Los platos y precios se editan en Catálogo. Aquí, lo que solo importa en la carta: favoritos, precio de antes, horario y nombre en inglés. Todo es opcional.</p>
      <input className="input tm-p-buscar" type="search" placeholder="Buscar plato" aria-label="Buscar plato" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_PAGINA); }} />
      {error && <p className="vacio">No se pudo cargar: {error}</p>}
      {cargando && !datos && <p className="vacio">Cargando…</p>}
      {datos && platos.length === 0 && <p className="vacio">{texto ? 'Ningún plato coincide.' : 'Tu catálogo está vacío.'}</p>}
      {platos.slice(0, limite).map((p) => {
        const a = ajustes[p.id] ?? {};
        return (
          <div key={p.id} className="tm-p-plato">
            <div className="tm-p-plato__nombre"><b>{p.name}</b><small>{soles(p.price)}</small></div>
            <label className="tm-p-check"><input type="checkbox" checked={Boolean(a.destacado)} onChange={(e) => poner(p.id, { destacado: e.target.checked })} /> Favorito</label>
            <label><span>Precio de antes</span><input className="input" type="number" min={0} step="0.1" value={a.antes ?? ''} onChange={(e) => poner(p.id, { antes: e.target.value ? Number(e.target.value) : undefined })} /></label>
            <label><span>Se sirve desde</span><input className="input" type="time" value={a.desde ?? ''} onChange={(e) => poner(p.id, { desde: e.target.value || undefined })} /></label>
            <label><span>Hasta</span><input className="input" type="time" value={a.hasta ?? ''} onChange={(e) => poner(p.id, { hasta: e.target.value || undefined })} /></label>
            <label className="tm-p-en"><span>Nombre en inglés</span><input className="input" maxLength={120} value={a.en ?? ''} onChange={(e) => poner(p.id, { en: e.target.value })} /></label>
          </div>
        );
      })}
      {platos.length > limite && <button className="btn btn-ghost tp-panel-mas" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más</button>}
    </section>
  );
}

/* ── Comentarios e historial ───────────────────────────────────────────────── */

interface Fila {
  id: string; tipo: TipoLlamado; salon: string; numero: string; detalle: string; nombre: string; telefono: string;
  lineas: Linea[]; total: number; repeticiones: number; verificada: boolean; atendido_por: string; creado: string; espera: number | null; empleado: string | null;
}

const fechaHora = (iso: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function Historial({ companyId, clase }: { companyId: string; clase: 'comentarios' | 'atendidos' }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [saltar, setSaltar] = useState(0);
  const comentarios = clase === 'comentarios';
  const { datos, cargando, error } = useCargar(async () => {
    const { data, error } = await supabase().rpc('mesa_panel_historial', { p_company: companyId, p_clase: clase, p_limite: POR_PAGINA, p_saltar: saltar });
    if (error) throw new Error(error.message);
    return data as { filas: Fila[]; equipo: { quien: string; cantidad: number; promedio: number }[] };
  }, [companyId, clase, saltar]);

  useEffect(() => {
    if (!datos) return;
    setFilas((actuales) => {
      const vistos = new Set(saltar ? actuales.map((f) => f.id) : []);
      return [...(saltar ? actuales : []), ...datos.filas.filter((f) => !vistos.has(f.id))];
    });
    setHayMas(datos.filas.length === POR_PAGINA);
  }, [datos, saltar]);

  return (
    <section className="card table-card">
      <div className="card-mini-head"><h3>{comentarios ? 'Sugerencias y felicitaciones' : 'Llamados atendidos'}</h3></div>
      {Boolean(datos?.equipo.length) && (
        <div className="tm-p-equipo" aria-label="Últimos 7 días">
          {datos!.equipo.map((e) => (
            <div key={e.quien}><b>{e.quien}</b><small>{comentarios ? `${e.cantidad} ${e.cantidad === 1 ? 'felicitación' : 'felicitaciones'}` : `${e.cantidad} ${e.cantidad === 1 ? 'llamado' : 'llamados'} · ${espera(e.promedio)} de promedio`}</small></div>
          ))}
          <small className="muted">Últimos 7 días</small>
        </div>
      )}
      {error && <p className="vacio">No se pudo cargar: {mensajeError(error)}</p>}
      {cargando && !filas.length && <p className="vacio">Cargando…</p>}
      {!cargando && !error && filas.length === 0 && <p className="vacio">{comentarios ? 'Aún no hay comentarios.' : 'Aún no hay llamados atendidos.'}</p>}
      {filas.map((f) => {
        const Icono = ICONO[f.tipo];
        return (
          <div key={f.id} className="tm-p-fila">
            <span className="tm-p-icono"><Icono size={17} aria-hidden="true" /></span>
            <div>
              <b>{NOMBRE[f.tipo]} · {nombreMesa(f)}</b>
              {f.detalle && <p>{f.detalle}</p>}
              {f.tipo === 'pedido' && <p>{f.lineas.map((l) => `${l.cantidad}× ${l.nombre}${l.opcion ? ` (${l.opcion})` : ''}`).join(', ')}</p>}
              <small className="muted">
                {fechaHora(f.creado)}
                {f.empleado && ` · para ${f.empleado}`}
                {f.nombre && ` · ${f.nombre}`}
                {!comentarios && ` · ${f.atendido_por || 'Equipo'} llegó en ${espera(f.espera ?? 0)}${f.verificada ? ' (QR)' : ''}`}
                {f.repeticiones > 0 && ` · insistió ${f.repeticiones + 1} veces`}
              </small>
            </div>
            {f.telefono && <a className="btn btn-sm btn-ghost" href={urlWhatsApp(f.telefono, `Hola${f.nombre ? ` ${f.nombre.split(' ')[0]}` : ''}, gracias por tu comentario.`)} target="_blank" rel="noopener">{telefonoBonito(f.telefono)}</a>}
          </div>
        );
      })}
      {hayMas && <button className="btn btn-ghost tp-panel-mas" disabled={cargando} onClick={() => setSaltar((s) => s + POR_PAGINA)}>Ver más</button>}
    </section>
  );
}
