'use client';

/**
 * «Tu link público»: lo que el dueño pega en su Instagram, en su WhatsApp o
 * imprime en un QR. Siempre a la vista y con un botón de copiar que funcione
 * también donde el portapapeles moderno no existe.
 */
import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle } from 'lucide-react';
import { Qr } from './Estados';
import { urlNegocio, urlUnirse } from '@/modules/fideliza/dominio/config';

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin permiso o fuera de https: el método de siempre.
    const t = document.createElement('textarea');
    t.value = texto;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

function FilaLink({ titulo, url, ayuda, nombre }: { titulo: string; url: string; ayuda: string; nombre: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="fz-copia">
      <label className="field-label">{titulo}</label>
      <div className="fz-copia__fila">
        <input className="input fz-mono" readOnly value={url} onFocus={(e) => e.target.select()} aria-label={titulo} />
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            if (await copiar(url)) {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }
          }}
        >
          {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      <div className="fz-fila" style={{ marginTop: 8 }}>
        <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} /> Abrir
        </a>
        <a
          className="btn btn-ghost btn-sm"
          href={`https://wa.me/?text=${encodeURIComponent(`${nombre}: ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={14} /> Compartir por WhatsApp
        </a>
      </div>
      <small className="fz-def">{ayuda}</small>
    </div>
  );
}

export default function LinkPublico({
  slug,
  nombre,
  programaActivo,
  hayEnlaces,
}: {
  slug: string;
  nombre: string;
  programaActivo: boolean;
  hayEnlaces: boolean;
}) {
  const vacio = !programaActivo && !hayEnlaces;
  return (
    <div className="card fz-copia-card">
      <div className="fz-copia-card__texto">
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Tu link público</h3>
        <p className="fz-def" style={{ marginTop: 0 }}>
          Pégalo en tu Instagram, tu estado de WhatsApp o Google. Tus clientes ven tus botones y pueden crear su tarjeta.
        </p>
        {vacio && (
          <div className="fz-panel-aviso" style={{ marginTop: 8 }}>
            Todavía no muestra nada: publica tu programa o tus botones (pasos 2 y 4) antes de compartirlo.
          </div>
        )}
        <FilaLink
          titulo="Tu página"
          url={urlNegocio(slug)}
          nombre={nombre}
          ayuda="Tu página con tus botones (WhatsApp, reseñas, cómo llegar…) y el alta en la tarjeta."
        />
        {programaActivo && (
          <FilaLink
            titulo="Link directo para crear la tarjeta"
            url={urlUnirse(slug)}
            nombre={nombre}
            ayuda="Lleva directo al alta, sin pasar por los botones. Útil en promociones."
          />
        )}
      </div>
      <div className="fz-copia-card__qr">
        <Qr valor={urlNegocio(slug)} tam={150} descargar={`qr-${slug}`} />
        <small className="fz-def" style={{ textAlign: 'center' }}>QR de tu página, para imprimir</small>
      </div>
    </div>
  );
}
