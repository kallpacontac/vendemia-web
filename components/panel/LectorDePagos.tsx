'use client';

/**
 * Los pagos que leyó Vendemia Caja en el celular del negocio, en la Caja, para dueño y
 * administrador. SQL: modules/lector/sql/0001_lector_de_pagos.sql.
 *
 * Dos partes:
 *   · Ajustes («Celular del Yape», la tuerquita junto al título de la Caja): qué es, el celular
 *     conectado y si tiene señal, conectar uno con un código de 6 (o su QR) y desconectarlo.
 *   · «Llegó a tu Yape hoy» (pestaña Cobrar): la respuesta a «ya te yapeé». Se mira aquí, no la
 *     captura del cliente. Sin celular conectado no sale nada: Cobrar queda como siempre.
 * Si la SQL no está aplicada, no sale nada: ni errores en la Caja.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import { soles } from '@/lib/panel/format';
import './lector-de-pagos.css';

interface Dispositivo {
  id: string;
  modelo: string;
  version: string;
  ultimo_latido: string | null;
  ultimo_aviso: string | null;
  por_enviar: number;
  sin_leer: number;
}
interface Aviso {
  id: number;
  centimos: number | null;
  nombre: string;
  codigo: string | null;
  origen: string;
  generico: boolean;
  recuperado: boolean;
  cuando: string;
}
interface Estado {
  dispositivos: Dispositivo[];
  avisos: Aviso[];
}

const POR_PAGINA = 8;
/** El celular manda señal cada ~15 min mientras está despierto; dormido, cuando llega un aviso. */
const VIVO_MIN = 30;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hour12: true });

function hace(iso: string | null, ahora: number): string {
  if (!iso) return 'aún sin señal';
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `el ${new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' })}`;
}

const nombreBonito = (s: string) => s.trim().toLowerCase().replace(/\b\p{L}/gu, (l) => l.toUpperCase());
const ultimaSenal = (d: Dispositivo) => [d.ultimo_latido, d.ultimo_aviso].filter((x): x is string => !!x).sort().pop() ?? null;

export default function LectorDePagos({
  companyId,
  ajustes,
  alAjustes,
}: {
  companyId: string;
  /** La tuerquita del título de la Caja está abierta. */
  ajustes: boolean;
  alAjustes: (abierto: boolean) => void;
}) {
  const [codigo, setCodigo] = useState<{ codigo: string; expira: string } | null>(null);
  const [qr, setQr] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());

  const { datos, releer } = useCargar(async (): Promise<Estado | null> => {
    const { data, error: e } = await supabase().rpc('lector_estado', { p_company: companyId });
    return e ? null : (data as Estado);
  }, [companyId]);

  // Con un código a la vista se pregunta seguido: la tarjeta cambia sola cuando el celular se conecta.
  useSondeo(() => { releer(); setAhora(Date.now()); }, codigo ? 4_000 : 20_000);

  const conectados = datos?.dispositivos.length ?? 0;
  const [conectadosAntes, setConectadosAntes] = useState(conectados);
  useEffect(() => {
    if (codigo && conectados > conectadosAntes) setCodigo(null);
    setConectadosAntes(conectados);
  }, [codigo, conectados, conectadosAntes]);

  useEffect(() => {
    if (!codigo) return setQr('');
    const enlace = `${window.location.origin}/caja/vincular?c=${codigo.codigo}`;
    QRCode.toDataURL(enlace, { margin: 1, width: 220 }).then(setQr, () => setQr(''));
  }, [codigo]);

  if (!datos) return null;

  async function pedirCodigo() {
    setOcupado(true);
    setError('');
    const { data, error: e } = await supabase().rpc('lector_codigo_nuevo', { p_company: companyId });
    setOcupado(false);
    if (e) return setError(e.message);
    setCodigo(data as { codigo: string; expira: string });
  }

  async function desconectar(d: Dispositivo) {
    if (!window.confirm(`¿Desconectar ${d.modelo || 'este celular'}? Dejará de mandar los pagos aquí.`)) return;
    const { error: e } = await supabase().rpc('lector_desvincular', { p_company: companyId, p_dispositivo: d.id });
    if (e) return setError(e.message);
    releer();
  }

  // ── La tuerquita: conectar y ver el celular ──
  const caducado = codigo ? new Date(codigo.expira).getTime() < ahora : false;
  const panelAjustes = ajustes && (
    <section id="lector-ajustes" className="card ldp" aria-label="Celular del Yape">
      <div className="card-mini-head">
        <h3>Celular del Yape</h3>
        <button type="button" className="ldp-cerrar" aria-label="Cerrar" onClick={() => { setCodigo(null); alAjustes(false); }}>
          <X size={18} />
        </button>
      </div>
      <p className="ldp-que">
        La app <b>Vendemia Caja</b> va en el celular donde te llegan los Yape, Plin o transferencias. Lee el aviso
        de pago de ese celular, lo dice en voz alta y lo manda aquí; a ti y al administrador les llega como
        notificación. Es la prueba de que el dinero llegó: una captura no lo es.
      </p>

      {conectados > 0 && (
        <ul className="ldp-celulares">
          {datos.dispositivos.map((d) => {
            const ultimo = ultimaSenal(d);
            const vivo = !!ultimo && ahora - new Date(ultimo).getTime() < VIVO_MIN * 60_000;
            return (
              <li key={d.id} className={vivo ? 'is-vivo' : ''}>
                <span className="ldp-punto" aria-hidden="true" />
                <span>
                  <b>{d.modelo || 'Celular de la caja'}</b> · {vivo ? 'conectado' : 'sin señal'} {hace(ultimo, ahora)}
                  {d.por_enviar > 0 && ` · ${d.por_enviar} pagos por llegar`}
                  {d.version && <small className="muted"> · app {d.version}</small>}
                </span>
                <button type="button" className="ldp-quitar" onClick={() => desconectar(d)}>Desconectar</button>
              </li>
            );
          })}
        </ul>
      )}

      {codigo ? (
        <div className="ldp-codigo">
          {qr && !caducado && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR para conectar el celular" width={150} height={150} />
          )}
          <div>
            {caducado ? (
              <p className="ldp-aviso">El código caducó. Pide otro.</p>
            ) : (
              <>
                <p className="ldp-codigo__num" aria-label={`Código ${codigo.codigo.split('').join(' ')}`}>
                  {codigo.codigo.slice(0, 3)}&nbsp;{codigo.codigo.slice(3)}
                </p>
                <ol>
                  <li>En el celular donde te llegan los Yape, abre <b>Vendemia Caja</b>.</li>
                  <li>Toca <b>Conectar con Vendemia</b> y escribe este código. O escanea el QR con la cámara.</li>
                </ol>
                <small className="muted">Vale 15 minutos y una sola vez. Esto cambia solo cuando el celular se conecta.</small>
              </>
            )}
            <div className="ldp-acciones">
              {caducado && <button type="button" className="btn btn-primary btn-sm" onClick={pedirCodigo} disabled={ocupado}>Otro código</button>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCodigo(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="ldp-acciones">
          <button type="button" className="btn btn-primary btn-sm" onClick={pedirCodigo} disabled={ocupado}>
            {conectados ? 'Conectar otro celular' : 'Conectar celular'}
          </button>
          <a className="btn btn-ghost btn-sm" href="https://wa.me/51947144701?text=Hola%2C%20quiero%20instalar%20Vendemia%20Caja" target="_blank" rel="noopener">
            ¿No tienes la app? Escríbenos
          </a>
        </div>
      )}
      {error && <p className="ldp-aviso">{error}</p>}
    </section>
  );

  // ── Sin celular: nada en Cobrar. El flujo de cobrar no cambia; solo está la tuerquita. ──
  if (!conectados) return panelAjustes || null;

  // ── Con celular: lo que llegó hoy ──
  const leidos = datos.avisos.filter((a) => a.centimos !== null);
  const total = leidos.reduce((t, a) => t + (a.centimos ?? 0), 0) / 100;
  const lista = verTodos ? datos.avisos : datos.avisos.slice(0, POR_PAGINA);
  const vivo = datos.dispositivos.some((d) => {
    const u = ultimaSenal(d);
    return !!u && ahora - new Date(u).getTime() < VIVO_MIN * 60_000;
  });

  return (
    <>
      {panelAjustes}
      <section className="card ldp" aria-label="Pagos que llegaron a tu Yape">
        <div className="card-mini-head">
          <h3>Llegó a tu Yape hoy</h3>
          <small className="muted">{leidos.length ? `${leidos.length} · ${soles(total)}` : 'Nada todavía'}</small>
        </div>
        {!vivo && (
          <p className="ldp-aviso">
            El celular del Yape no da señal: si está apagado o sin internet, los pagos llegarán cuando vuelva.
          </p>
        )}
        {lista.length === 0 && <p className="muted ldp-nota">Cuando te yapeen, aparece aquí al instante.</p>}
        {lista.length > 0 && (
          <ul className="ldp-lista">
            {lista.map((a) => (
              <li key={a.id}>
                <span className="ldp-hora">{hora(a.cuando)}</span>
                {a.centimos !== null ? (
                  <>
                    <span className="ldp-quien">
                      <b>{nombreBonito(a.nombre) || 'Sin nombre'}</b>
                      <small>
                        {[a.origen, a.codigo && `código ${a.codigo}`, a.generico && 'revisa el aviso en el celular', a.recuperado && 'llegó con retraso']
                          .filter(Boolean).join(' · ')}
                      </small>
                    </span>
                    <span className="ldp-monto">{soles(a.centimos / 100)}</span>
                  </>
                ) : (
                  <span className="ldp-quien">
                    <b className="ldp-sinleer">Aviso de {a.origen} sin leer</b>
                    <small>Míralo en el celular: no se entendió el monto.</small>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {datos.avisos.length > POR_PAGINA && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVerTodos((v) => !v)}>
            {verTodos ? 'Ver menos' : `Ver los ${datos.avisos.length}`}
          </button>
        )}
      </section>
    </>
  );
}
