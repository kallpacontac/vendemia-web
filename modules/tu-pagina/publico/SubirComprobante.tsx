'use client';

/**
 * Subir la captura de Yape o Plin desde la página, sin pasar por WhatsApp.
 *
 * La imagen se achica aquí antes de enviarla: Vercel corta los cuerpos de más de 4,5 MB, y una
 * captura no necesita más de 1600 píxeles para leerse. Si el navegador no sabe abrirla, va tal
 * cual y el servidor dirá si sirve.
 */
import { useRef, useState } from 'react';
import { Check, ImageUp } from 'lucide-react';
import { MENSAJES } from '@/modules/tu-pagina/dominio/comprobante';
import { achicarImagen } from '@/lib/achicarImagen';
import { soles } from '@/modules/tu-pagina/dominio/tienda';

type Resultado = 'confirmada' | 'parcial' | 'a_cuenta' | 'cobrada' | 'revisar';

const achicar = achicarImagen;

/** Una cancha o una cita (sql/0021): cambian el sustantivo y dónde se paga el resto. */
export type QueSeReserva = 'cancha' | 'cita';
const PALABRAS: Record<QueSeReserva, { la: string; resto: string; despedida: string }> = {
  cancha: { la: 'tu cancha', resto: 'en la cancha', despedida: 'Nos vemos en la cancha.' },
  cita: { la: 'tu cita', resto: 'en el local', despedida: 'Te esperamos.' },
};

function textoOk(r: Resultado, d: { pagado?: number; total?: number; falta?: number; minimo?: number }, que: QueSeReserva = 'cancha'): { titulo: string; detalle: string } {
  const falta = d.falta ?? 0;
  const w = PALABRAS[que];
  switch (r) {
    case 'confirmada':
      return { titulo: '¡Pago validado! Tu reserva está confirmada', detalle: falta > 0 ? `Te queda ${soles(falta)} por pagar ${w.resto}.` : 'Ya está pagada completa.' };
    case 'cobrada':
      return { titulo: 'Pago validado. Tu reserva está pagada completa', detalle: w.despedida };
    case 'a_cuenta':
      return { titulo: 'Pago validado', detalle: `Te queda ${soles(falta)} por pagar ${w.resto}.` };
    case 'parcial':
      return {
        titulo: `Recibimos ${soles(d.pagado ?? 0)}. Te faltan ${soles(Math.max((d.minimo ?? 0) - (d.pagado ?? 0), 0))} para confirmar`,
        detalle: `El adelanto es ${soles(d.minimo ?? 0)}. Yapea ${soles(Math.max((d.minimo ?? 0) - (d.pagado ?? 0), 0))} más al mismo número y sube esa captura aquí. ${w.la.charAt(0).toUpperCase() + w.la.slice(1)} sigue apartada mientras tanto.`,
      };
    default:
      return { titulo: 'Recibimos tu comprobante', detalle: `El negocio lo revisa y te confirma. Mientras tanto, ${w.la} sigue apartada.` };
  }
}

export default function SubirComprobante({ slug, codigo, telefono, ejemplo = false, faltaEjemplo = 0, alValidar, que = 'cancha', alSubir }: {
  slug: string; codigo: string; telefono: string; ejemplo?: boolean; faltaEjemplo?: number; alValidar?: () => void; que?: QueSeReserva;
  /** La captura quedó guardada (no «parcial»). `tieneTarjeta`: undefined = no se sabe (sql/0022). */
  alSubir?: (d: { tieneTarjeta?: boolean }) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState('');
  const [listo, setListo] = useState<{ resultado: Resultado; pagado?: number; total?: number; falta?: number; minimo?: number; operacion?: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setFallo('');
    setListo(null);
    if (!archivo.type.startsWith('image/')) {
      setFallo(MENSAJES.archivoInvalido);
      return;
    }
    if (ejemplo) {
      alValidar?.();
      setListo({ resultado: 'confirmada', falta: faltaEjemplo });
      return;
    }
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('slug', slug);
      form.append('codigo', codigo);
      form.append('telefono', telefono);
      form.append('web', '');
      form.append('archivo', await achicar(archivo), 'comprobante.jpg');
      const r = await fetch('/api/tu-pagina/publico/comprobante', { method: 'POST', body: form });
      const j = (await r.json().catch(() => ({}))) as { status?: string; resultado?: string; motivo?: string; mensaje?: string; pagado?: number; total?: number; falta?: number; minimo?: number; operacion?: string; tieneTarjeta?: boolean };
      if (j.status === 'ok' && j.resultado === 'rechazado') setFallo(j.motivo || MENSAJES.noComprobante);
      else if (j.status === 'ok' && j.resultado) {
        setListo({ ...j, resultado: j.resultado as Resultado });
        if (j.resultado !== 'parcial') alSubir?.({ tieneTarjeta: typeof j.tieneTarjeta === 'boolean' ? j.tieneTarjeta : undefined });
      }
      else setFallo(j.mensaje || MENSAJES.noGuardado);
    } catch {
      setFallo(MENSAJES.sinRed);
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  const ok = listo && textoOk(listo.resultado, listo, que);
  const terminado = listo && listo.resultado !== 'parcial';

  return (
    <div className="tp-subir">
      {ok && (
        <p className={`tp-subir__ok ${terminado ? '' : 'tp-subir__ok--aviso'}`} role="status">
          {terminado && <Check size={18} aria-hidden="true" />}
          <span><b>{ok.titulo}</b>{ok.detalle}{listo?.operacion && <small className="tp-subir__op">N.º de operación {listo.operacion}</small>}</span>
        </p>
      )}
      {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}
      {!terminado && (
        <label className={`tp-boton ${enviando ? 'tp-subir__ocupado' : ''}`}>
          <ImageUp size={20} aria-hidden="true" />
          {enviando ? 'Revisando tu comprobante…' : fallo || listo ? 'Subir otro comprobante' : 'Subir mi comprobante aquí'}
          <input ref={entrada} className="tp-subir__archivo" type="file" accept="image/*" disabled={enviando} onChange={(e) => void subir(e.target.files?.[0])} />
        </label>
      )}
      {/* Disuasivo sin acusar a nadie (17-nov-2026): quien fabrica capturas busca a quien no las coteja. */}
      {!terminado && !ejemplo && <p className="tp-nota">Cada pago se coteja con nuestra cuenta de Yape o Plin.</p>}
      {ejemplo && listo && <p className="tp-nota">En esta muestra no se analizó tu imagen. En la página real se valida el monto, el destinatario y la fecha.</p>}
    </div>
  );
}
