'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL CLIENTE NO SE ENTERA SOLO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cancelar o mover una cita cambia la base de datos, no la cabeza del cliente.
 * `modificar_cita` devuelve el mensaje ya redactado y un `wa_link`, pero **no
 * escribe a nadie**: sale una PERSONA, igual que en el retargeting. Este cuadro
 * es el paso que falta, y por eso se queda en pantalla hasta que lo cierran.
 *
 * ⚠️ EL TEXTO SE PUEDE EDITAR Y EL ENLACE SE REHACE CON LO EDITADO. El
 * `wa_link` que manda el bot lleva el mensaje incrustado: si se usara tal cual,
 * quien retocara el texto abriría WhatsApp con la versión vieja y no lo notaría
 * hasta después de enviarlo.
 */
import { useState } from 'react';
import { Check, Copy, MessageCircle, X } from 'lucide-react';
import { useAvisar } from './Avisos';

export default function AvisarCliente({
  titulo,
  mensaje,
  waLink,
  nota,
  alCerrar,
}: {
  titulo: string;
  mensaje: string;
  /** `https://wa.me/<tel>?text=…`. Vacío si no se conoce el teléfono. */
  waLink: string;
  /** Una línea extra: «Queda libre una plaza del grupo», por ejemplo. */
  nota?: string;
  alCerrar: () => void;
}) {
  const avisar = useAvisar();
  const [texto, setTexto] = useState(mensaje);

  /* Se conserva solo el destinatario del enlace y se le pega el texto de ahora. */
  const base = waLink.split('?')[0];
  const href = base ? `${base}?text=${encodeURIComponent(texto)}` : '';

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      avisar('Mensaje copiado', 'ok');
    } catch {
      avisar('No se pudo copiar. Selecciónalo y cópialo a mano.', 'error');
    }
  }

  return (
    <div className="avisar" role="status">
      <div className="avisar__cab">
        <b>
          <Check size={14} /> {titulo}
        </b>
        <button type="button" className="q-icon" aria-label="Cerrar" onClick={alCerrar}>
          <X size={14} />
        </button>
      </div>

      {nota && <p className="avisar__nota">{nota}</p>}

      <p className="avisar__nota">
        <b>Falta avisar al cliente.</b> Mia no le ha escrito: el mensaje sale de tu WhatsApp, y puedes
        cambiarlo antes de enviarlo.
      </p>

      <textarea
        className="textarea"
        style={{ minHeight: 84 }}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />

      <div className="avisar__acciones">
        {href ? (
          <a
            className="btn btn-primary btn-sm"
            href={href}
            target="_blank"
            // 'noopener' o la pestaña de WhatsApp recibe window.opener y puede
            // redirigir esta desde fuera; 'noreferrer' evita mandarle la URL
            // actual, que lleva el negocio y a veces un id de cliente.
            rel="noopener noreferrer"
          >
            <MessageCircle size={14} /> Avisar por WhatsApp
          </a>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            Este cliente no tiene teléfono guardado: copia el mensaje y mándaselo por donde puedas.
          </span>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copiar()}>
          <Copy size={13} /> Copiar
        </button>
      </div>
    </div>
  );
}
