'use client';

/**
 * Las promos de Mi página en el panel (25-nov-2026, The 24/7): el descuento por reservar aquí y
 * el aviso al abrir. Se guardan con el resto de la página (secciones.descuentoWeb y .popup).
 * Ver dominio/promos.ts y tu-pagina 0038.
 */
import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { subirImagenMarca } from '@/modules/fideliza/cliente/imagenMarca';
import { precioConDescuento, type DescuentoWeb, type PopupPagina } from '@/modules/tu-pagina/dominio/promos';

const PCTS = [10, 15, 20, 25, 30];

export function DescuentoWebEditor({ valor, alCambiar }: { valor: DescuentoWeb; alCambiar: (v: DescuentoWeb) => void }) {
  const pct = valor.pct ?? 20;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="tp-panel-campo">
        <span>¿Cuánto descuento?</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Porcentaje de descuento">
          {PCTS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={pct === n}
              className={`btn btn-sm ${pct === n ? 'btn-primary' : 'btn-ghost'}`} onClick={() => alCambiar({ ...valor, pct: n })}>
              {n} %
            </button>
          ))}
        </div>
      </div>
      <small className="muted">
        Solo en citas reservadas desde tu página, una vez por cliente (por su celular). Un corte de S/ 35 queda en
        {' '}S/ {precioConDescuento(35, pct).toFixed(2).replace('.', ',')}. La Caja ya propone el precio rebajado y el adelanto se calcula sobre él.
        Si la cita se cancela o no la paga, el cliente puede usarlo otra vez.
      </small>
    </div>
  );
}

export function PopupEditor({ companyId, valor, reservar, alCambiar }: {
  companyId: string;
  valor: PopupPagina;
  /** La página tiene reservas: el botón puede llevar a reservar. */
  reservar: boolean;
  alCambiar: (v: PopupPagina) => void;
}) {
  const avisar = useAvisar();
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const boton = valor.boton ?? (reservar ? 'reservar' : 'whatsapp');

  async function subir(f: File) {
    setSubiendo(true);
    try {
      alCambiar({ ...valor, imagen: await subirImagenMarca(f, companyId, 'catalog') });
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo subir la foto.', 'error');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label className="tp-panel-campo">
        <span>Título</span>
        <input className="input" maxLength={60} value={valor.titulo ?? ''} placeholder="¡20 % en tu primer corte reservando aquí!" onChange={(e) => alCambiar({ ...valor, titulo: e.target.value })} />
      </label>
      <label className="tp-panel-campo">
        <span>Texto</span>
        <textarea className="input" rows={3} maxLength={240} value={valor.texto ?? ''} placeholder="Elige tu barbero y tu hora en un minuto. Válido en tu primera reserva por la web." onChange={(e) => alCambiar({ ...valor, texto: e.target.value })} />
      </label>
      <div className="tp-panel-campo">
        <span>Foto <small className="muted">(opcional)</small></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {valor.imagen && <img src={valor.imagen} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8 }} />}
          <button type="button" className="btn btn-ghost btn-sm" disabled={subiendo} onClick={() => archivo.current?.click()}>
            <ImagePlus size={14} /> {subiendo ? 'Subiendo…' : valor.imagen ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {valor.imagen && <button type="button" className="btn btn-ghost btn-sm" onClick={() => alCambiar({ ...valor, imagen: '' })}><Trash2 size={14} /> Quitar</button>}
          <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void subir(f); }} />
        </div>
      </div>
      <label className="tp-panel-campo">
        <span>Botón</span>
        <select className="input" value={boton} onChange={(e) => alCambiar({ ...valor, boton: e.target.value as PopupPagina['boton'] })}>
          {reservar && <option value="reservar">«Reservar ahora»</option>}
          <option value="whatsapp">«Escríbenos por WhatsApp»</option>
          <option value="ninguno">Solo «Entendido»</option>
        </select>
      </label>
      <small className="muted">Sale al abrir tu página, una vez al día por teléfono. Si cambias el texto, vuelve a salir.</small>
    </div>
  );
}
