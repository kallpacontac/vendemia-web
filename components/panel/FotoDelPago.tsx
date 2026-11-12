'use client';

/**
 * «Foto del pago»: quien cobra fotografía el Yape (o sube la captura que le mandaron), el servidor
 * la guarda y la lee con las mismas reglas que la página (POST /api/cobros/foto), y lo leído
 * rellena monto y método. NO registra nada: el cobro lo hace quien la usa, mandando la foto con
 * él, y Postgres vuelve a comprobar que no esté repetida (datos 0010).
 *
 * Lo usan «Registrar pago», «Cobrada» y «Validar pago» (canchas). Sale solo si el negocio tiene
 * encendido «Comprobante al cobrar» en Configuración › Negocio (ver lib/panel/fotoPago.ts).
 */
import { useState } from 'react';
import { Camera, X } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { supabase } from '@/lib/supabase/client';
import { achicarImagen } from '@/lib/achicarImagen';
import { soles } from '@/lib/panel/format';
import { METODO_LABEL, type MetodoPago } from '@/lib/panel/metodosPago';
import type { FotoPago } from '@/lib/panel/fotoPago';
import './foto-del-pago.css';

/** Lo que se leyó de la foto, en una línea: «S/ 40 · Yape · a •••701 · op. 12345678». */
export function leidoDeFoto(f: FotoPago): string {
  const partes = [
    f.monto !== null ? soles(f.monto) : '',
    METODO_LABEL[f.metodo as MetodoPago] ?? '',
    f.destino ? `a •••${f.destino.replace(/\D/g, '').slice(-3)}` : '',
    f.operacion ? `op. ${f.operacion}` : '',
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'No se pudo leer nada';
}

export default function FotoDelPago({ companyId, foto, obligatoria = false, alFoto, alLeyendo }: {
  companyId: string;
  foto: FotoPago | null;
  /** Cambia la etiqueta: «(opcional)» u «(obligatoria)». */
  obligatoria?: boolean;
  alFoto: (f: FotoPago | null) => void;
  /** Para bloquear el botón de guardar mientras se lee. */
  alLeyendo?: (leyendo: boolean) => void;
}) {
  const avisar = useAvisar();
  const [leyendo, setLeyendo] = useState(false);

  function marcarLeyendo(v: boolean) {
    setLeyendo(v);
    alLeyendo?.(v);
  }

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      avisar('Elige una foto o captura (JPG, PNG o WEBP).', 'error');
      return;
    }
    marcarLeyendo(true);
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        avisar('Tu sesión terminó. Vuelve a entrar al panel.', 'error');
        return;
      }
      const form = new FormData();
      form.append('companyId', companyId);
      form.append('archivo', await achicarImagen(archivo), 'pago.jpg');
      const r = await fetch('/api/cobros/foto', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const j = (await r.json().catch(() => null)) as (FotoPago & { status: string; mensaje?: string }) | null;
      if (!r.ok || !j || j.status !== 'ok') {
        avisar(j?.mensaje ?? 'No pudimos leer la foto. Inténtalo otra vez o escribe el monto a mano.', 'error');
        return;
      }
      alFoto({
        url: j.url, hash: j.hash, operacion: j.operacion ?? '', leida: j.leida, decision: j.decision,
        motivo: j.motivo ?? '', monto: j.monto ?? null, metodo: j.metodo ?? '', destino: j.destino ?? '',
      });
    } catch {
      avisar('Sin conexión. Revisa tu internet e inténtalo otra vez.', 'error');
    } finally {
      marcarLeyendo(false);
    }
  }

  if (foto) {
    return (
      <div className={`fp fp--${foto.decision}`}>
        <a href={foto.url} target="_blank" rel="noopener" aria-label="Abrir la foto del pago">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt="" />
        </a>
        <div>
          <b>{foto.leida ? `Leído: ${leidoDeFoto(foto)}` : 'Foto guardada'}</b>
          {foto.motivo && <small>{foto.motivo}</small>}
          {!foto.motivo && foto.decision === 'aprobar' && <small>Coincide con tu Yape o Plin y es de hace menos de 4 horas.</small>}
        </div>
        <button type="button" aria-label="Quitar la foto" onClick={() => alFoto(null)}><X size={16} aria-hidden="true" /></button>
      </div>
    );
  }
  return (
    <label className={`fp-boton ${leyendo ? 'is-leyendo' : ''} ${obligatoria ? 'fp-boton--obligatoria' : ''}`}>
      <Camera size={17} aria-hidden="true" />
      {leyendo ? 'Leyendo la foto…' : obligatoria ? 'Foto del pago (obligatoria)' : 'Foto del pago (opcional)'}
      <input type="file" accept="image/*" disabled={leyendo} onChange={(e) => { void subir(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}
