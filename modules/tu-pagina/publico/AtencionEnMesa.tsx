'use client';

/**
 * Lo que ve quien escanea el QR de su mesa: la carta, llamar al mozo, pedir la cuenta,
 * otro pedido, sugerencias y felicitaciones (sql/0015).
 *
 * El carrito es de la MESA y vive en el servidor: en una mesa de seis, cada quien agrega
 * lo suyo desde su teléfono y todos ven crecer la misma lista. Si viviera en cada
 * celular, al mozo le llegarían seis avisos sueltos.
 *
 * `api` solo la pasa el ejemplo (/ejemplos/mesa): simula el servidor y no avisa a nadie.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BellRing, BookOpen, Check, MessageCircle, Minus, PartyPopper, PencilLine, Plus, ReceiptText, ShoppingBasket, X } from 'lucide-react';
import { fotoEnCirculo } from '@/modules/fideliza/dominio/encuadre';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import type { Item } from '@/modules/tu-pagina/dominio/tienda';
import { TEXTOS, documentoValido, nombreMesa, type AjustesCarta, type Comprobante } from '@/modules/tu-pagina/dominio/mesa';
import CartaMesa, { SelectorIdioma, precioMesa, useIdiomaMesa } from './CartaMesa';

export interface LineaMesa { id: string; catalog_id: string; nombre: string; opcion: string; precio: number; cantidad: number; mia: boolean }
export interface CarritoMesa { lineas: LineaMesa[]; unidades: number; total: number; personas: number }
export interface DatosLlamado {
  tipo: 'mozo' | 'cuenta' | 'requerimiento' | 'sugerencia' | 'felicitacion';
  detalle?: string; comprobante?: Comprobante; documento?: string; dividir?: boolean;
  nombre?: string; telefono?: string; employeeId?: string;
}
export interface ApiMesa {
  llamar: (d: DatosLlamado) => Promise<{ status: string; repetida?: boolean }>;
  leer: () => Promise<CarritoMesa | null>;
  agregar: (item: string, opcion: string) => Promise<CarritoMesa | null>;
  cantidad: (id: string, cantidad: number) => Promise<CarritoMesa | null>;
  pedir: (nota: string) => Promise<{ status: string }>;
}

const VACIO: CarritoMesa = { lineas: [], unidades: 0, total: 0, personas: 0 };
const CLAVE_DISP = 'vendemia_mesa_disp';

type Vista = 'inicio' | 'carta' | 'cuenta' | 'otro' | 'sugerencia' | 'felicitacion';
type Aviso = { clase: 'ok' | 'error'; titulo: string; texto: string; whatsapp?: boolean };

/** Identifica al TELÉFONO, no a la persona: solo sirve para que cada uno toque sus líneas. */
function dispositivo(): string {
  let d = '';
  try {
    d = localStorage.getItem(CLAVE_DISP) ?? '';
  } catch { /* sin almacenamiento */ }
  if (!/^[a-z0-9]{8,40}$/.test(d)) {
    d = `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    try {
      localStorage.setItem(CLAVE_DISP, d);
    } catch { /* sin almacenamiento: dura lo que dure la pestaña */ }
  }
  return d;
}

function apiReal(token: string, disp: string): ApiMesa {
  const enviar = async <T,>(cuerpo: Record<string, unknown>) => {
    const r = await fetch('/api/tu-pagina/publico/mesa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, ...cuerpo }),
    });
    return (await r.json()) as T & { status: string };
  };
  const carrito = async (cuerpo: Record<string, unknown>) => {
    const j = await enviar<CarritoMesa>({ disp, ...cuerpo });
    return j.status === 'ok' ? j : null;
  };
  return {
    llamar: (d) => enviar({ accion: 'llamar', ...d }),
    leer: () => carrito({ accion: 'leer' }),
    agregar: (item, opcion) => carrito({ accion: 'agregar', item, opcion, cantidad: 1 }),
    cantidad: (id, cantidad) => carrito({ accion: 'cantidad', id, cantidad }),
    pedir: (nota) => enviar({ accion: 'pedir', nota }),
  };
}

export default function AtencionEnMesa({ negocio, logo, whatsapp, token, mesa, equipo, items, ajustes, api: apiDemo, avisoDemo }: {
  negocio: string;
  logo: string | null;
  whatsapp: string;
  token: string;
  mesa: { salon: string; numero: string };
  equipo: { id: string; nombre: string }[];
  items: Item[];
  ajustes: AjustesCarta;
  api?: ApiMesa;
  avisoDemo?: string;
}) {
  const [idioma, setIdioma] = useIdiomaMesa();
  const t = TEXTOS[idioma];
  const apiRef = useRef<ApiMesa | null>(apiDemo ?? null);
  const [vista, setVista] = useState<Vista>('inicio');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [carrito, setCarrito] = useState<CarritoMesa>(VACIO);
  const [verPedido, setVerPedido] = useState(false);
  const [mensajeBreve, setMensajeBreve] = useState('');

  const [comprobante, setComprobante] = useState<Comprobante>('boleta');
  const [dividir, setDividir] = useState(false);
  const [documento, setDocumento] = useState('');
  const [errorDoc, setErrorDoc] = useState('');
  const [detalle, setDetalle] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mozoElegido, setMozoElegido] = useState('');
  const [nota, setNota] = useState('');

  const api = useCallback((): ApiMesa => {
    if (!apiRef.current) apiRef.current = apiReal(token, dispositivo());
    return apiRef.current;
  }, [token]);

  const refrescar = useCallback(async () => {
    const c = await api().leer().catch(() => null);
    if (c) setCarrito(c);
  }, [api]);

  // Solo con la pantalla a la vista: una pestaña olvidada no consulta nada.
  useEffect(() => {
    void refrescar();
    const reloj = setInterval(() => { if (document.visibilityState === 'visible') void refrescar(); }, 12_000);
    return () => clearInterval(reloj);
  }, [refrescar]);

  // El botón «atrás» del celular vuelve al inicio, no se sale de la mesa.
  useEffect(() => {
    const alVolver = () => { setVerPedido(false); setAviso(null); setVista('inicio'); };
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  const ir = (nueva: Vista) => {
    window.history.pushState(null, '');
    setVista(nueva);
    setErrorDoc('');
    window.scrollTo(0, 0);
  };

  function limpiar() {
    setDetalle(''); setNombre(''); setTelefono(''); setMozoElegido('');
    setDocumento(''); setDividir(false); setComprobante('boleta'); setErrorDoc('');
  }

  async function llamar(datos: DatosLlamado, exito: (repetida: boolean) => Aviso) {
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await api().llamar(datos);
      if (r.status === 'ok') {
        setAviso(exito(Boolean(r.repetida)));
        limpiar();
      } else {
        setAviso({ clase: 'error', titulo: t.errorTitulo, texto: t.errorTexto, whatsapp: true });
      }
    } catch {
      setAviso({ clase: 'error', titulo: t.sinConexion, texto: t.sinConexionTexto, whatsapp: true });
    } finally {
      setEnviando(false);
      window.scrollTo(0, 0);
    }
  }

  const vaEnCamino = (repetida: boolean): Aviso => ({ clase: 'ok', titulo: repetida ? t.listoOtraVez : t.listo, texto: t.vaEnCamino });

  function pedirCuenta() {
    if (!dividir && !documentoValido(comprobante, documento)) {
      setErrorDoc(comprobante === 'factura' ? t.errRuc : t.errDni);
      return;
    }
    void llamar(dividir ? { tipo: 'cuenta', dividir: true } : { tipo: 'cuenta', comprobante, documento }, vaEnCamino);
  }

  async function llamarDesdeCarta() {
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await api().llamar({ tipo: 'mozo' });
      setMensajeBreve(r.status === 'ok' ? t.vaEnCamino : t.errorTexto);
    } catch {
      setMensajeBreve(t.sinConexionTexto);
    } finally {
      setEnviando(false);
      setTimeout(() => setMensajeBreve(''), 3500);
    }
  }

  async function agregar(item: Item, opcion: string) {
    const c = await api().agregar(item.id, opcion).catch(() => null);
    if (!c) {
      setMensajeBreve(t.errorTexto);
      setTimeout(() => setMensajeBreve(''), 3500);
      return false;
    }
    setCarrito(c);
    return true;
  }

  async function cambiarCantidad(id: string, cantidad: number) {
    const c = await api().cantidad(id, cantidad).catch(() => null);
    if (c) setCarrito(c);
  }

  async function avisarAlMozo() {
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await api().pedir(nota);
      if (r.status === 'ok' || r.status === 'vacio') {
        setCarrito(VACIO);
        setNota('');
        setVerPedido(false);
        setVista('inicio');
        setAviso({ clase: 'ok', titulo: t.pedidoEnviado, texto: t.pedidoEnviadoTexto });
        window.scrollTo(0, 0);
      } else {
        setMensajeBreve(t.errorTexto);
      }
    } catch {
      setMensajeBreve(t.sinConexionTexto);
    } finally {
      setEnviando(false);
    }
  }

  const donde = nombreMesa(mesa);
  const cabecera = (
    <header className="tm-cabeza">
      {logo ? <img className="tm-logo" src={fotoEnCirculo(logo) || logo} alt="" /> : <span className="tm-logo tm-logo--letra" aria-hidden="true">{negocio.trim().charAt(0).toUpperCase()}</span>}
      <div className="tm-identidad"><b>{negocio}</b><span>{donde}</span></div>
      <SelectorIdioma idioma={idioma} alCambiar={setIdioma} etiqueta={t.idioma} />
    </header>
  );
  const atras = (
    <button type="button" className="tm-atras" onClick={() => window.history.back()}><ArrowLeft size={17} aria-hidden="true" /> {t.volver}</button>
  );

  if (aviso) {
    return (
      <main className="tm">
        {cabecera}
        <section className="tm-resultado">
          <span className={`tm-sello tm-sello--${aviso.clase}`} aria-hidden="true">{aviso.clase === 'ok' ? <Check size={34} /> : '!'}</span>
          <h1 role="status">{aviso.titulo}</h1>
          <p>{aviso.texto}</p>
          <small>{donde}</small>
          {aviso.whatsapp && whatsapp && (
            <a className="tm-primario" href={urlWhatsApp(whatsapp, `${t.mensajeWhatsapp} ${donde}.`)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> {t.avisarWhatsapp}</a>
          )}
          <button type="button" className="tm-secundario" onClick={() => { setAviso(null); setVista('inicio'); }}>{aviso.clase === 'ok' ? t.pedirAlgoMas : t.reintentar}</button>
        </section>
      </main>
    );
  }

  return (
    <main className="tm">
      {cabecera}
      {avisoDemo && <p className="tm-demo">{avisoDemo}</p>}

      {vista === 'inicio' && (
        <section className="tm-inicio">
          <h1>{t.pregunta}</h1>
          {items.length > 0 && (
            <button type="button" className="tm-accion-carta" onClick={() => ir('carta')}>
              <BookOpen size={24} aria-hidden="true" />
              <span><b>{t.verCarta}</b><small>{t.verCartaSub}</small></span>
              {carrito.unidades > 0 && <em aria-label={`${carrito.unidades}`}>{carrito.unidades}</em>}
            </button>
          )}
          <div className="tm-grandes">
            <button type="button" className="tm-grande" disabled={enviando} onClick={() => void llamar({ tipo: 'mozo' }, vaEnCamino)}>
              <BellRing size={26} aria-hidden="true" /><b>{t.mozo}</b><small>{t.mozoSub}</small>
            </button>
            <button type="button" className="tm-grande" onClick={() => ir('cuenta')}>
              <ReceiptText size={26} aria-hidden="true" /><b>{t.cuenta}</b><small>{t.cuentaSub}</small>
            </button>
          </div>
          <div className="tm-filas">
            <button type="button" onClick={() => ir('otro')}><PencilLine size={20} aria-hidden="true" /><span><b>{t.otro}</b><small>{t.otroSub}</small></span></button>
            <button type="button" onClick={() => ir('sugerencia')}><MessageCircle size={20} aria-hidden="true" /><span><b>{t.sugerencia}</b><small>{t.sugerenciaSub}</small></span></button>
            <button type="button" onClick={() => ir('felicitacion')}><PartyPopper size={20} aria-hidden="true" /><span><b>{t.felicitacion}</b><small>{t.felicitacionSub}</small></span></button>
          </div>
        </section>
      )}

      {vista === 'cuenta' && (
        <section className="tm-form">
          {atras}
          <h1>{t.cuenta}</h1>
          <label className="tm-opcion">
            <input type="checkbox" checked={dividir} onChange={(e) => { setDividir(e.target.checked); setErrorDoc(''); }} />
            <span><b>{t.dividir}</b><small>{t.dividirSub}</small></span>
          </label>
          {dividir ? <p className="tm-ayuda tm-ayuda--caja">{t.dividirNota}</p> : (
            <>
              <p className="tm-ayuda">{t.comoComprobante}</p>
              <div className="tm-segmento" role="group" aria-label={t.comoComprobante}>
                {(['boleta', 'factura'] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={comprobante === c} onClick={() => { setComprobante(c); setDocumento(''); setErrorDoc(''); }}>{t[c]}</button>
                ))}
              </div>
              <label className="tm-campo">
                <span>{comprobante === 'factura' ? t.ruc : t.dni}</span>
                <input inputMode="numeric" autoComplete="off" maxLength={comprobante === 'factura' ? 11 : 8} value={documento} onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))} />
              </label>
              <p className="tm-ayuda">{comprobante === 'factura' ? t.rucAyuda : t.dniAyuda}</p>
            </>
          )}
          {errorDoc && <p className="tm-error" role="alert">{errorDoc}</p>}
          <button type="button" className="tm-primario" disabled={enviando} onClick={pedirCuenta}>{enviando ? t.enviando : t.cuenta}</button>
        </section>
      )}

      {vista === 'otro' && (
        <section className="tm-form">
          {atras}
          <h1>{t.otro}</h1>
          <label className="tm-campo"><span>{t.otroSub}</span><textarea rows={3} maxLength={300} placeholder={t.otroEjemplo} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></label>
          <p className="tm-ayuda">{t.otroAyuda}</p>
          <button type="button" className="tm-primario" disabled={enviando} onClick={() => void llamar({ tipo: 'requerimiento', detalle }, vaEnCamino)}>{enviando ? t.enviando : t.enviarAviso}</button>
        </section>
      )}

      {vista === 'sugerencia' && (
        <section className="tm-form">
          {atras}
          <h1>{t.tuSugerencia}</h1>
          <label className="tm-campo"><span>{t.sugerenciaAyuda}</span><textarea rows={4} maxLength={1000} placeholder={t.sugerenciaEjemplo} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></label>
          <details className="tm-mas">
            <summary>{t.quieroRespuesta}</summary>
            <label className="tm-campo"><span>{t.tuNombre}</span><input maxLength={120} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
            <label className="tm-campo"><span>{t.tuTelefono}</span><input type="tel" maxLength={30} autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></label>
          </details>
          <button type="button" className="tm-primario" disabled={enviando || !detalle.trim()} onClick={() => void llamar({ tipo: 'sugerencia', detalle, nombre, telefono }, () => ({ clase: 'ok', titulo: t.gracias, texto: t.graciasSugerencia }))}>{enviando ? t.enviando : t.enviarSugerencia}</button>
        </section>
      )}

      {vista === 'felicitacion' && (
        <section className="tm-form">
          {atras}
          <h1>{t.gracias}</h1>
          {equipo.length > 0 && (
            <label className="tm-campo"><span>{t.quienAtendio}</span>
              <select value={mozoElegido} onChange={(e) => setMozoElegido(e.target.value)}>
                <option value="">{t.eligeMozo}</option>
                {equipo.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="tm-campo"><span>{t.queGusto}</span><textarea rows={4} maxLength={1000} placeholder={t.felicitacionEjemplo} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></label>
          <details className="tm-mas">
            <summary>{t.dejarNombre}</summary>
            <label className="tm-campo"><span>{t.tuNombre}</span><input maxLength={120} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          </details>
          <button type="button" className="tm-primario" disabled={enviando || !detalle.trim()} onClick={() => void llamar({ tipo: 'felicitacion', detalle, nombre, employeeId: mozoElegido }, () => ({ clase: 'ok', titulo: t.gracias, texto: t.graciasFelicitacion }))}>{enviando ? t.enviando : t.enviarFelicitacion}</button>
        </section>
      )}

      {vista === 'carta' && (
        <>
          <div className="tm-barra-carta">
            {atras}
            <button type="button" className="tm-llamar-breve" disabled={enviando} onClick={() => void llamarDesdeCarta()}><BellRing size={16} aria-hidden="true" /> {t.mozo}</button>
          </div>
          <CartaMesa items={items} ajustes={ajustes} idioma={idioma} t={t} alAgregar={agregar} />
          {carrito.unidades > 0 && (
            <button type="button" className="tm-flotante" onClick={() => setVerPedido(true)}>
              <ShoppingBasket size={19} aria-hidden="true" /> {t.verPedido} <em>{carrito.unidades}</em><span>{precioMesa(carrito.total, t)}</span>
            </button>
          )}
        </>
      )}

      {mensajeBreve && <p className="tm-breve" role="status">{mensajeBreve}</p>}

      {verPedido && (
        <div className="tm-fondo" role="presentation" onClick={() => setVerPedido(false)}>
          <div className="tm-hoja-pedido" role="dialog" aria-modal="true" aria-label={t.miPedido} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="tm-cerrar" aria-label={t.cerrar} onClick={() => setVerPedido(false)}><X size={20} /></button>
            <h2>{t.miPedido}</h2>
            <p className="tm-ayuda">{donde}</p>
            {carrito.personas > 1 && <p className="tm-ayuda tm-ayuda--caja">{t.personas.replace('{n}', String(carrito.personas))}</p>}
            {carrito.lineas.length === 0 && <p className="tm-nota tm-nota--centro">{t.vacio}</p>}
            <ul className="tm-lineas">
              {carrito.lineas.map((l) => (
                <li key={l.id}>
                  <span className="tm-linea__texto">
                    <b>{l.nombre}</b>
                    {l.opcion && <small>{l.opcion}</small>}
                    {!l.mia && <small>{t.deOtro}</small>}
                  </span>
                  {l.mia ? (
                    <span className="tm-cantidad">
                      <button type="button" aria-label={l.cantidad === 1 ? t.quitar : t.menos} onClick={() => void cambiarCantidad(l.id, l.cantidad - 1)}><Minus size={15} /></button>
                      <b>{l.cantidad}</b>
                      <button type="button" aria-label={t.mas} disabled={l.cantidad >= 20} onClick={() => void cambiarCantidad(l.id, l.cantidad + 1)}><Plus size={15} /></button>
                    </span>
                  ) : <span className="tm-cantidad tm-cantidad--ajena"><b>{l.cantidad}</b></span>}
                  <span className="tm-linea__precio">{precioMesa(l.precio * l.cantidad, t)}</span>
                </li>
              ))}
            </ul>
            {carrito.lineas.length > 0 && (
              <>
                <div className="tm-total"><span>{t.total}</span><b>{precioMesa(carrito.total, t)}</b></div>
                <label className="tm-campo"><span>{t.nota}</span><textarea rows={2} maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
                <p className="tm-ayuda">{t.noEsComanda}</p>
                <button type="button" className="tm-primario" disabled={enviando} onClick={() => void avisarAlMozo()}><BellRing size={18} aria-hidden="true" /> {enviando ? t.enviando : t.enviarMozo}</button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
