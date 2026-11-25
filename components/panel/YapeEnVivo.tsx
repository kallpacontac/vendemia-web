'use client';

/**
 * El aviso flotante de cada Yape en la Caja, en la COMPUTADORA del cajero (Alvaro, 25-nov: «solo para el
 * cajero, en la web, no en el celular»; idea vista en FacturalaYa). Abajo a la derecha, unos segundos y
 * se va solo; sin botones que decidir. Dice cuánto, de quién y a qué cita fue, y lo dice en voz alta
 * («Yape, 30 soles, de María»), salvo que se silencie (se recuerda en esta computadora).
 *
 *   · Solo con pantalla ancha (computadora): en el celular no se monta ni pregunta nada.
 *   · Solo negocios con el celular de cobros conectado: sin él, la primera respuesta dice
 *     conectado = false y deja de preguntar (The 24/7 no hace ni una consulta más).
 *   · Pregunta cada 5 s con la pestaña a la vista (lector_nuevos: solo lo nuevo; lo de antes de abrir
 *     la Caja no se anuncia).
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useSondeo } from '@/components/panel/useSondeo';
import { soles } from '@/lib/panel/format';
import './yape-en-vivo.css';

interface Nuevo {
  id: number;
  centimos: number;
  nombre: string;
  origen: string;
  cuando: string;
  resultado: string | null;
  cliente: string | null;
}

const DURA_MS = 8_000;
const CLAVE_VOZ = 'vm-yape-voz';
const RESULTADO: Record<string, string> = {
  cobrada: 'cobrada', confirmada: 'reserva confirmada', a_cuenta: 'a cuenta', parcial: 'a cuenta', cotejado: 'comprobante cotejado',
};
const bonito = (s: string) => s.trim().toLowerCase().replace(/\b\p{L}/gu, (l) => l.toUpperCase());

/** «30 soles», «1 sol con 60»: como lo diría el cajero. */
function enVoz(centimos: number): string {
  const s = Math.floor(centimos / 100);
  const c = centimos % 100;
  return `${s} ${s === 1 ? 'sol' : 'soles'}${c ? ` con ${c}` : ''}`;
}

function leerVoz(): boolean {
  try { return localStorage.getItem(CLAVE_VOZ) !== 'no'; } catch { return true; }
}

export default function YapeEnVivo({ companyId }: { companyId: string }) {
  const [compu, setCompu] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 900px) and (pointer: fine)');
    const ver = () => setCompu(m.matches);
    ver();
    m.addEventListener('change', ver);
    return () => m.removeEventListener('change', ver);
  }, []);
  return compu ? <Avisos companyId={companyId} /> : null;
}

function Avisos({ companyId }: { companyId: string }) {
  const [vivos, setVivos] = useState<Nuevo[]>([]);
  const [conectado, setConectado] = useState(true);
  const [voz, setVoz] = useState(true);
  const ultimo = useRef<number | null>(null);

  useEffect(() => { setVoz(leerVoz()); }, []);

  async function preguntar() {
    const { data, error } = await supabase().rpc('lector_nuevos', { p_company: companyId, p_despues: ultimo.current });
    if (error) { setConectado(false); return; }   // sin la SQL o sin permiso: no se insiste
    const r = data as { conectado: boolean; ultimo: number; avisos: Nuevo[] };
    setConectado(r.conectado);
    ultimo.current = r.ultimo;
    if (!r.avisos.length) return;
    setVivos((v) => [...r.avisos.reverse(), ...v].slice(0, 3));
    for (const a of r.avisos) {
      window.setTimeout(() => setVivos((v) => v.filter((x) => x.id !== a.id)), DURA_MS);
      if (leerVoz() && 'speechSynthesis' in window) {
        const nombre = bonito(a.nombre).split(' ')[0];
        const frase = new SpeechSynthesisUtterance(`${a.origen || 'Yape'}, ${enVoz(a.centimos)}${nombre ? `, de ${nombre}` : ''}`);
        frase.lang = 'es-PE';
        window.speechSynthesis.speak(frase);
      }
    }
  }

  useEffect(() => { void preguntar(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useSondeo(() => { void preguntar(); }, 5_000, conectado);

  if (!vivos.length) return null;

  function cambiarVoz() {
    const nueva = !voz;
    setVoz(nueva);
    try { localStorage.setItem(CLAVE_VOZ, nueva ? 'si' : 'no'); } catch { /* sin almacenamiento: dura esta visita */ }
    if (!nueva && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  return (
    <div className="yev" role="status" aria-live="polite">
      {vivos.map((a) => (
        <div key={a.id} className="yev__aviso">
          <div className="yev__cab">
            <small>{(a.origen || 'Yape').toUpperCase()} RECIBIDO · AHORA</small>
            <button type="button" className="yev__voz" onClick={cambiarVoz} aria-label={voz ? 'Silenciar la voz' : 'Activar la voz'}
              title={voz ? 'Silenciar la voz' : 'Activar la voz'}>
              {voz ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          </div>
          <div className="yev__fila">
            <b className="yev__nombre">{bonito(a.nombre) || 'Sin nombre'}</b>
            <b className="yev__monto">{soles(a.centimos / 100)}</b>
          </div>
          <small className="yev__cita">
            {a.cliente
              ? <><Check size={12} aria-hidden="true" /> {a.cliente} · {RESULTADO[a.resultado ?? ''] ?? 'asignado'}</>
              : 'Sin cita · venta suelta'}
          </small>
        </div>
      ))}
    </div>
  );
}
