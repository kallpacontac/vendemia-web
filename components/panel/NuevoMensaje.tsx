'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * NUEVO MENSAJE · escribirle tú primero a un cliente
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No todos los clientes escriben primero. A veces es el negocio el que abre
 * la conversación —un alumno que preguntó por teléfono, alguien que dejó su
 * número en el local— y lo que se quiere es que, cuando conteste, Mia siga la
 * conversación sabiendo qué se le dijo.
 *
 * Por eso aquí NO se pausa a Mia, al revés que en el chat de un cliente que ya
 * existe: tú abres, el cliente contesta, y responde Mia. El contrato con el bot
 * (`send_message` con `phone`) es que el bot:
 *   · crea el lead si ese número no existía,
 *   · guarda el mensaje en el historial ANTES de que el cliente conteste,
 *   · y devuelve `lead_id` para abrir la conversación aquí mismo.
 *
 * El mensaje no se pinta a mano: llega por el espejo como cualquier otro. Si
 * no aparece, no se envió.
 */
import { useMemo, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useSesion } from './Sesion';
import { useEnviarMensaje } from './useEnviarMensaje';
import { BotonAdjunto, ChipAdjunto, useAdjunto } from './SelectorAdjunto';
import { telefono as comoTelefono } from '@/lib/panel/format';
import type { Lead } from '@/lib/supabase/queries';

const soloDigitos = (s: string) => s.replace(/\D/g, '');

/**
 * Lo que WhatsApp necesita: prefijo de país y nada más que dígitos. Un celular
 * peruano escrito como se dicta —9 dígitos empezando por 9— se completa con el
 * 51; cualquier otra cosa se deja como está y la valida la longitud.
 */
export function normalizarTelefono(raw: string): string {
  const d = soloDigitos(raw);
  if (d.length === 9 && d.startsWith('9')) return `51${d}`;
  return d;
}

const valido = (d: string) => d.length >= 10 && d.length <= 15;

export function NuevoMensaje({
  leads,
  alEnviar,
  alCerrar,
}: {
  leads: Lead[];
  /** Se llama con el teléfono normalizado y el lead_id si el bot lo devolvió. */
  alEnviar: (phone: string, leadId: string | null) => void;
  alCerrar: () => void;
}) {
  const { companyId } = useSesion();
  const { enviar: enviarMensaje, enviando } = useEnviarMensaje();
  const { adjunto, subiendo, elegir, quitar } = useAdjunto(companyId);
  const [tel, setTel] = useState('');
  const [texto, setTexto] = useState('');

  const phone = normalizarTelefono(tel);
  const existente = useMemo(
    () => (valido(phone) ? leads.find((l) => soloDigitos(l.phone) === phone) ?? null : null),
    [leads, phone],
  );
  const listo = valido(phone) && (texto.trim().length > 0 || !!adjunto) && !enviando && !subiendo;

  async function enviar() {
    if (!listo) return;
    const r = await enviarMensaje({ phone }, texto.trim(), adjunto, 'Mensaje enviado. Cuando conteste, sigue Mia.');
    if (r) alEnviar(phone, r.lead_id ?? existente?.id ?? null);
  }

  return (
    <div className="modal-fondo" onClick={alCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal__cab">
          <MessageSquarePlus size={18} />
          <b>Escribirle a un cliente</b>
        </div>
        <div className="modal__cuerpo">
          <label className="field-label" htmlFor="nm-tel">
            Teléfono
          </label>
          <input
            id="nm-tel"
            className="input"
            inputMode="tel"
            placeholder="987 654 321"
            value={tel}
            autoFocus
            onChange={(e) => setTel(e.target.value)}
          />
          <p className="muted" style={{ marginTop: 6 }}>
            {tel && !valido(phone)
              ? 'Falta el número completo. Si no es de Perú, ponlo con su prefijo de país.'
              : existente
                ? `Ya tienes una conversación con ${existente.name || comoTelefono(existente.phone)}: el mensaje se suma a ella.`
                : valido(phone)
                  ? `Se enviará a ${comoTelefono(phone)}.`
                  : 'Un celular de Perú basta con los 9 dígitos.'}
          </p>

          <label className="field-label" htmlFor="nm-txt" style={{ marginTop: 12 }}>
            Mensaje
          </label>
          <textarea
            id="nm-txt"
            className="textarea"
            rows={4}
            placeholder="Hola, soy de…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <BotonAdjunto alElegir={(f) => void elegir(f)} deshabilitado={enviando} subiendo={subiendo} />
            {adjunto ? (
              <ChipAdjunto adjunto={adjunto} alQuitar={quitar} />
            ) : (
              <span className="muted">{subiendo ? 'Subiendo el archivo…' : 'Adjuntar foto o documento'}</span>
            )}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            Sale por el WhatsApp del negocio. Mia queda activa: cuando el cliente conteste, sigue ella
            sabiendo lo que le escribiste.
          </p>
        </div>
        <div className="modal__pie">
          <button type="button" className="btn btn-ghost btn-sm" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!listo}
            onClick={() => void enviar()}
          >
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
