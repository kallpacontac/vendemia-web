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

function textoOk(r: Resultado, d: { pagado?: number; total?: number; falta?: number; minimo?: number }): { titulo: string; detalle: string } {
  const falta = d.falta ?? 0;
  switch (r) {
    case 'confirmada':
      return { titulo: '¡Pago validado! Tu reserva está confirmada', detalle: falta > 0 ? `Te queda ${soles(falta)} por pagar en la cancha.` : 'Ya está pagada completa.' };
    case 'cobrada':
      return { titulo: 'Pago validado. Tu reserva está pagada completa', detalle: 'Nos vemos en la cancha.' };
    case 'a_cuenta':
      return { titulo: 'Pago validado', detalle: `Te queda ${soles(falta)} por pagar en la cancha.` };
    case 'parcial':
      return {
        titulo: `Recibimos ${soles(d.pagado ?? 0)}, todavía no alcanza`,
        detalle: `Para confirmar necesitas ${soles(d.minimo ?? 0)} de adelanto. Paga la diferencia y sube ese comprobante.`,
      };
    default:
      return { titulo: 'Recibimos tu comprobante', detalle: 'El negocio lo revisa y te confirma. Mientras tanto, tu cancha sigue apartada.' };
  }
}

export default function SubirComprobante({ slug, codigo, telefono, ejemplo = false, faltaEjemplo = 0, alValidar }: {
  slug: string; codigo: string; telefono: string; ejemplo?: boolean; faltaEjemplo?: number; alValidar?: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState('');
  const [listo, setListo] = useState<{ resultado: Resultado; pagado?: number; total?: number; falta?: number; minimo?: number } | null>(null);
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
      const j = (await r.json().catch(() => ({}))) as { status?: string; resultado?: string; motivo?: string; mensaje?: string; pagado?: number; total?: number; falta?: number; minimo?: number };
      if (j.status === 'ok' && j.resultado === 'rechazado') setFallo(j.motivo || MENSAJES.noComprobante);
      else if (j.status === 'ok' && j.resultado) setListo({ ...j, resultado: j.resultado as Resultado });
      else setFallo(j.mensaje || MENSAJES.noGuardado);
    } catch {
      setFallo(MENSAJES.sinRed);
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  const ok = listo && textoOk(listo.resultado, listo);
  const terminado = listo && listo.resultado !== 'parcial';

  return (
    <div className="tp-subir">
      {ok && (
        <p className={`tp-subir__ok ${terminado ? '' : 'tp-subir__ok--aviso'}`} role="status">
          {terminado && <Check size={18} aria-hidden="true" />}
          <span><b>{ok.titulo}</b>{ok.detalle}</span>
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
      {ejemplo && listo && <p className="tp-nota">En esta muestra no se analizó tu imagen. En la página real se valida el monto, el destinatario y la fecha.</p>}
    </div>
  );
}
