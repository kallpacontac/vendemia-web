'use client';

/**
 * «Lo que llegó a tu Yape»: los pagos que leyó Vendemia Caja en el celular del negocio, en la Caja
 * (pestaña Cobrar), para dueño y administrador. SQL: modules/lector/sql/0001_lector_de_pagos.sql.
 *
 * Es la respuesta a «ya te yapeé»: se mira aquí, no la captura del cliente. Sin celular conectado
 * la tarjeta ofrece conectarlo (un código de 6 que se escribe en la app, o su QR). Si la SQL aún no
 * está aplicada, la tarjeta no sale: nada de errores en la Caja.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone } from 'lucide-react';
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

export default function LectorDePagos({ companyId }: { companyId: string }) {
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
  useEffect(() => {
    if (codigo && conectados > 0) setCodigo(null);
  }, [codigo, conectados]);

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

  const caducado = codigo ? new Date(codigo.expira).getTime() < ahora : false;
  const panelCodigo = codigo && (
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
              <li>En el celular donde tienes tu Yape, abre <b>Vendemia Caja</b>.</li>
              <li>Toca <b>Conectar con Vendemia</b> y escribe este código, o escanea el QR con la cámara.</li>
            </ol>
            <small className="muted">Vale 15 minutos y una sola vez. Esta tarjeta cambia sola al conectarse.</small>
          </>
        )}
        <div className="ldp-acciones">
          {caducado && <button type="button" className="btn btn-primary btn-sm" onClick={pedirCodigo} disabled={ocupado}>Otro código</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCodigo(null)}>Cerrar</button>
        </div>
      </div>
    </div>
  );

  // ── Sin celular conectado: la invitación ──
  if (!conectados) {
    return (
      <section className="card ldp" aria-label="Pagos que llegan a tu Yape">
        <div className="ldp-vacio">
          <Smartphone size={22} aria-hidden="true" />
          <div>
            <b>Mira aquí cada Yape que te llega, al instante</b>
            <small className="muted">
              Sin fiarte de capturas: la app Vendemia Caja lee el aviso de tu Yape, Plin o banco en tu celular y te lo
              muestra aquí, y te avisa aunque no estés en el local.
            </small>
          </div>
          {!codigo && (
            <button type="button" className="btn btn-primary btn-sm" onClick={pedirCodigo} disabled={ocupado}>
              Conectar celular
            </button>
          )}
        </div>
        {panelCodigo}
        {error && <p className="ldp-aviso">{error}</p>}
      </section>
    );
  }

  // ── Con celular: lo que llegó hoy ──
  const leidos = datos.avisos.filter((a) => a.centimos !== null);
  const total = leidos.reduce((t, a) => t + (a.centimos ?? 0), 0) / 100;
  const lista = verTodos ? datos.avisos : datos.avisos.slice(0, POR_PAGINA);

  return (
    <section className="card ldp" aria-label="Pagos que llegaron a tu Yape">
      <div className="card-mini-head">
        <h3>Llegó a tu Yape hoy</h3>
        <small className="muted">{leidos.length ? `${leidos.length} · ${soles(total)}` : 'Nada todavía'}</small>
      </div>

      <ul className="ldp-celulares">
        {datos.dispositivos.map((d) => {
          const ultimo = [d.ultimo_latido, d.ultimo_aviso].filter(Boolean).sort().pop() ?? null;
          const vivo = !!ultimo && ahora - new Date(ultimo).getTime() < VIVO_MIN * 60_000;
          return (
            <li key={d.id} className={vivo ? 'is-vivo' : ''}>
              <span className="ldp-punto" aria-hidden="true" />
              <span>
                {d.modelo || 'Celular de la caja'} · {vivo ? 'conectado' : 'sin señal'} {hace(ultimo, ahora)}
                {d.por_enviar > 0 && ` · ${d.por_enviar} por llegar`}
              </span>
              <button type="button" className="ldp-quitar" onClick={() => desconectar(d)}>Desconectar</button>
            </li>
          );
        })}
      </ul>
      {datos.dispositivos.every((d) => !d.ultimo_latido && !d.ultimo_aviso) && (
        <p className="muted ldp-nota">Conectado. Pide que te yapeen S/ 1 para probar: aparecerá aquí.</p>
      )}

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

      {panelCodigo}
      {!codigo && (
        <button type="button" className="ldp-otro" onClick={pedirCodigo} disabled={ocupado}>+ Conectar otro celular</button>
      )}
      {error && <p className="ldp-aviso">{error}</p>}
    </section>
  );
}
