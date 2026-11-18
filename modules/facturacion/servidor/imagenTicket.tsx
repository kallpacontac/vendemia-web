import 'server-only';
/**
 * La IMAGEN del ticket que WhatsApp muestra al mandar el enlace de una nota (/nota/<id>) o de una
 * boleta (/comprobante/<id>) (18-nov-2026, The 24/7: «enviar por WhatsApp la imagen del ticket y
 * un texto»). WhatsApp no deja adjuntar una imagen desde la web a un número que no está en los
 * contactos; un enlace sí, y lo pinta con esta imagen (og:image).
 *
 * Lee con la clave anon las mismas RPC públicas que las páginas (nota_publica, factura_publica).
 */
import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const TAMANO = { width: 1200, height: 630 };

export interface TicketImagen {
  negocio: string;
  documento: string;
  numero: string;
  fecha: string;
  lineas: { descripcion: string; cantidad: number; importe: number }[];
  total: number;
}

const soles = (n: number) => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function rpcPublica(fn: 'nota_publica' | 'factura_publica', id: string): Promise<Record<string, unknown> | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc(fn, { p_id: id });
    return error || !data ? null : (data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** El ticket dibujado: papel blanco a la izquierda; el negocio y el total, grandes, a la derecha. */
export function imagenTicket(t: TicketImagen | null) {
  if (!t) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F3EF', fontSize: 44, color: '#1b1b18' }}>
          Tu comprobante
        </div>
      ),
      TAMANO,
    );
  }
  const visibles = t.lineas.slice(0, 5);
  const mas = t.lineas.length - visibles.length;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#F4F3EF', padding: '40px 64px', alignItems: 'center', gap: 56 }}>
        <div
          style={{
            width: 470, height: 550, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 18, padding: '30px 34px',
            boxShadow: '0 18px 50px rgba(26,24,20,.16)', fontFamily: 'monospace', color: '#111',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 28, fontWeight: 700, textAlign: 'center' }}>{t.negocio}</div>
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', border: '2px solid #111', borderRadius: 6,
              padding: '8px 0', margin: '14px 0 10px', fontSize: 22, fontWeight: 700,
            }}
          >
            <span>{t.documento}</span>
            <span>{t.numero}</span>
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: '#444' }}>{t.fecha}</div>
          <div style={{ display: 'flex', borderTop: '2px dashed #999', margin: '12px 0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexGrow: 1 }}>
            {visibles.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, gap: 12 }}>
                <span style={{ display: 'flex' }}>{`${l.cantidad} x ${l.descripcion}`.slice(0, 30)}</span>
                <span>{soles(l.importe)}</span>
              </div>
            ))}
            {mas > 0 && <div style={{ display: 'flex', fontSize: 18, color: '#666' }}>{`y ${mas} más`}</div>}
          </div>
          <div style={{ display: 'flex', borderTop: '2px dashed #999', margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 30, fontWeight: 700 }}>
            <span>TOTAL</span>
            <span>{soles(t.total)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1, color: '#1b1b18' }}>
          <div style={{ display: 'flex', fontSize: 30, color: '#D8430B', fontWeight: 700 }}>¡Gracias por tu visita!</div>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 800, lineHeight: 1.05 }}>{t.negocio}</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#5c5c5c' }}>{`${t.documento} ${t.numero}`}</div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: '#D8430B' }}>{soles(t.total)}</div>
        </div>
      </div>
    ),
    TAMANO,
  );
}
