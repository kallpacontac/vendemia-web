'use client';

/**
 * «Celular de cobros» en Configuración › Cobros (24-nov-2026, Alvaro: la conexión va en
 * configuración, no en la Caja; la Caja no cambia). Dueño y administrador.
 * SQL: modules/lector/sql/0001_lector_de_pagos.sql.
 *
 * Qué es la app Vendemia Caja, el celular conectado y si da señal, conectar uno con un código de 6
 * (o su QR), desconectarlo, y los últimos pagos que leyó: para comprobar que funciona. Si la SQL no
 * está aplicada, no sale nada.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Smartphone } from 'lucide-react';
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
  origen: string;
  cuando: string;
  /** lector 0002: a qué cita fue, o si quedó por asignar. */
  cita_id?: string | null;
  cliente?: string | null;
  servicio?: string | null;
  slot?: string | null;
  resultado?: string | null;
  por_asignar?: boolean;
}

const RESULTADO: Record<string, string> = {
  cobrada: 'cobrada', confirmada: 'reserva confirmada', a_cuenta: 'a cuenta', parcial: 'a cuenta', cotejado: 'comprobante cotejado',
};
interface Estado {
  dispositivos: Dispositivo[];
  avisos: Aviso[];
}

const ULTIMOS = 8;
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

export default function LectorDePagos({ companyId }: { companyId: string }) {
  const [codigo, setCodigo] = useState<{ codigo: string; expira: string } | null>(null);
  const [qr, setQr] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());
  const [copiado, setCopiado] = useState(false);

  // Los últimos 7 días: en Configuración sirve para comprobar que lee, no para cuadrar el día.
  const { datos, releer } = useCargar(async (): Promise<Estado | null> => {
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data, error: e } = await supabase().rpc('lector_estado', { p_company: companyId, p_desde: desde });
    return e ? null : (data as Estado);
  }, [companyId]);

  // Con un código a la vista se pregunta seguido: cambia solo cuando el celular se conecta.
  useSondeo(() => { releer(); setAhora(Date.now()); }, codigo ? 4_000 : 30_000);

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

  async function noEra(a: Aviso) {
    if (!window.confirm(`¿Quitar este pago de la cita de ${a.cliente || 'ese cliente'}? La cita vuelve a quedar por cobrar.`)) return;
    const { error: e } = await supabase().rpc('lector_desasignar', { p_company: companyId, p_aviso: a.id });
    if (e) return setError(e.message);
    releer();
  }

  async function desconectar(d: Dispositivo) {
    if (!window.confirm(`¿Desconectar ${d.modelo || 'este celular'}? Dejará de mandar los pagos al panel.`)) return;
    const { error: e } = await supabase().rpc('lector_desvincular', { p_company: companyId, p_dispositivo: d.id });
    if (e) return setError(e.message);
    releer();
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Navegadores viejos o sin permiso: el texto seleccionado se copia igual.
      const t = document.createElement('textarea');
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2_000);
  }

  const caducado = codigo ? new Date(codigo.expira).getTime() < ahora : false;
  // El enlace abre la app con el código puesto (o la página /caja/vincular si no la tiene).
  const enlace = codigo ? `${typeof window === 'undefined' ? '' : window.location.origin}/caja/vincular?c=${codigo.codigo}` : '';
  const whatsapp = codigo
    ? `https://wa.me/?text=${encodeURIComponent(`Código para conectar Vendemia Caja: ${codigo.codigo}
Ábrelo en el celular de cobros: ${enlace}`)}`
    : '';
  const ultimos = datos.avisos.filter((a) => a.centimos !== null).slice(0, ULTIMOS);

  return (
    <div className="sec ldp" id="celular-de-cobros">
      <h4>
        <Smartphone /> Celular de cobros
      </h4>
      <p className="ldp-que">
        La app <b>Vendemia Caja</b> va en el celular donde te llegan los Yape, Plin o transferencias. Lee el aviso
        de pago, lo dice en voz alta y lo manda a tu panel, y a ti y al administrador les llega como notificación.
        Es la prueba de que el dinero llegó: una captura no lo es.
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
                  <b>{d.modelo || 'Celular de cobros'}</b> · {vivo ? 'conectado' : 'sin señal'} {hace(ultimo, ahora)}
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
                <div className="ldp-acciones">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => copiar(codigo.codigo)}>
                    {copiado ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar código</>}
                  </button>
                  <a className="btn btn-ghost btn-sm" href={whatsapp} target="_blank" rel="noopener">Enviar por WhatsApp</a>
                </div>
                <ol>
                  <li>En el celular donde te llegan los Yape, abre <b>Vendemia Caja</b>.</li>
                  <li>Toca <b>Conectar con Vendemia</b>: el código copiado se pone solo. O escanea el QR con la cámara.</li>
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

      {conectados > 0 && (
        ultimos.length ? (
          <>
            <small className="muted">Últimos pagos que leyó</small>
            <ul className="ldp-lista">
              {ultimos.map((a) => (
                <li key={a.id}>
                  <span className="ldp-hora">{hora(a.cuando)}</span>
                  <span className="ldp-quien">
                    <b>{nombreBonito(a.nombre) || 'Sin nombre'}</b>
                    <small>
                      {a.origen}
                      {a.cita_id
                        ? ` · → ${a.cliente || 'cita'}${a.servicio ? `, ${a.servicio}` : ''}${a.slot ? ` ${a.slot.slice(11, 16)}` : ''} (${RESULTADO[a.resultado ?? ''] ?? 'asignado'})`
                        : a.por_asignar ? ' · por asignar: elígelo en la Agenda' : ' · sin cita (venta suelta)'}
                    </small>
                    {a.cita_id && <button type="button" className="ldp-quitar" onClick={() => noEra(a)}>No era de esta cita</button>}
                  </span>
                  <span className="ldp-monto">{soles((a.centimos ?? 0) / 100)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted ldp-nota">Conectado. Para probar, que te yapeen S/ 1: aparecerá aquí.</p>
        )
      )}
      {error && <p className="ldp-aviso">{error}</p>}
    </div>
  );
}
