'use client';

/**
 * «Yapes que llegaron» en Mi agenda › Cobrar › Yape/Plin (lector 0003, 26-nov-2026, Alvaro).
 *
 * El barbero ve los Yapes que llegaron al celular de cobros (de serie, 15 min antes y hasta 5 después,
 * Configuración › Cobros), con nombre, monto y hora, de cualquier monto, y toca el de su cliente
 * hablando con él («¿Juan Pérez Q.?»). Se actualiza solo cada 4 s mientras espera. El exacto sale
 * primero y marcado. La base vuelve a comprobarlo todo al cobrar (lector_cobrar_con): la foto del Yape
 * del cliente tiene que cuadrar con el elegido.
 *
 * Sin celular de cobros (activo = false) o sin la 0003 en la base no pinta nada y no vuelve a
 * preguntar: The 24/7 y todo negocio sin lector siguen como siempre.
 */
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { hora12, soles } from '@/lib/panel/format';
import './yapes-que-llegaron.css';

export interface YapeLlegado { id: number; centimos: number; nombre: string; origen: string; cuando: string; exacto: boolean }
export interface LectorCobro { activo: boolean; antes: number; despues: number; foto: 'obligatoria' | 'opcional'; falta: number; yapes: YapeLlegado[] }

const CADA_MS = 4_000;
const bonito = (s: string) => s.trim().toLowerCase().replace(/\b\p{L}/gu, (l) => l.toUpperCase());
const horaLima = (iso: string) =>
  hora12(new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }));
function hace(iso: string, ahora: number) {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  return min < 1 ? 'ahora' : `hace ${min} min`;
}

export default function YapesQueLlegaron({ companyId, citaId, elegido, alElegir, alInfo }: {
  companyId: string;
  citaId: string;
  elegido: YapeLlegado | null;
  alElegir: (y: YapeLlegado | null) => void;
  /** null = sin lector: la pantalla cobra como siempre. */
  alInfo: (info: LectorCobro | null) => void;
}) {
  const [info, setInfo] = useState<LectorCobro | null>(null);
  const [error, setError] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());
  const abierto = useRef(Date.now());
  const avisarInfo = useRef(alInfo);
  avisarInfo.current = alInfo;

  useEffect(() => {
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    async function mirar() {
      const { data, error: e } = await supabase().rpc('lector_para_cobrar', { p_company: companyId, p_cita: citaId });
      if (!vivo) return;
      // Sin la 0003 o sin permiso: como si no hubiera lector, sin insistir.
      if (e) {
        const sinFuncion = e.code === 'PGRST202' || /lector_para_cobrar/.test(e.message);
        if (!sinFuncion) setError(e.message);
        avisarInfo.current(null);
        return;
      }
      const d = data as LectorCobro;
      if (!d?.activo) { avisarInfo.current(null); return; }
      setInfo(d);
      setAhora(Date.now());
      avisarInfo.current(d);
      // Escucha hasta «despues» minutos desde que abrió el cobro; luego deja de preguntar.
      if (Date.now() - abierto.current < d.despues * 60_000) reloj = setTimeout(() => void mirar(), CADA_MS);
    }
    void mirar();
    return () => { vivo = false; if (reloj) clearTimeout(reloj); };
  }, [companyId, citaId]);

  // El reloj de «hace N min» y de cuándo deja de escuchar, sin red.
  useEffect(() => {
    if (!info) return;
    const t = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [info]);

  // Si el elegido ya no está (lo tomó otro), se suelta.
  useEffect(() => {
    if (elegido && info && !info.yapes.some((y) => y.id === elegido.id)) alElegir(null);
  }, [info, elegido, alElegir]);

  if (error) return <small className="mag-cobro__ojo">{error}</small>;
  if (!info) return null;
  const escuchando = ahora - abierto.current < info.despues * 60_000;

  return (
    <div className="yql" role="group" aria-label="Pagos que llegaron">
      <small className="yql__titulo">
        {info.yapes.length ? '¿Cuál es el de tu cliente? Pregúntale su nombre.' : escuchando ? 'Esperando el pago…' : 'No llegó ningún pago.'}
        {escuchando && <span className="yql__vivo" aria-hidden="true" />}
      </small>
      {info.yapes.map((y) => {
        const marcado = elegido?.id === y.id;
        return (
          <button key={y.id} type="button" aria-pressed={marcado} className={`yql__yape${marcado ? ' yql__yape--si' : ''}${y.exacto ? ' yql__yape--exacto' : ''}`}
            onClick={() => alElegir(marcado ? null : y)}>
            <span className="yql__nombre">
              <b>{bonito(y.nombre) || 'Sin nombre'}</b>
              <small>{y.origen} · {horaLima(y.cuando)} · {hace(y.cuando, ahora)}{y.exacto ? ' · el monto justo' : ''}</small>
            </span>
            <span className="yql__monto">{soles(y.centimos / 100)}</span>
            {marcado && <Check size={16} aria-hidden="true" />}
          </button>
        );
      })}
      {!info.yapes.length && !escuchando && (
        <small>Revisa que el cliente pagó al número o la cuenta del negocio, o avisa a la caja.</small>
      )}
    </div>
  );
}
