'use client';

/**
 * El mensaje que Mia acaba de redactar, DENTRO del chat de Mia Gerente: se lee,
 * se corrige y se aprueba aquí mismo, sin ir a Mensajes (Alvaro, 24-oct-2026).
 * La misma tarjeta, con el mismo camino de aprobación, que la del chat del
 * cliente (components/panel/TarjetaBorrador, lib/panel/borradores).
 *
 * Tras aprobar se relee la fila hasta que el bot cuenta cómo fue: así la
 * tarjeta pasa sola de «Mia lo está enviando…» a «Enviado» o «No salió».
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSesion } from '@/components/panel/Sesion';
import { TarjetaBorrador } from '@/components/panel/TarjetaBorrador';
import { getBorrador, nombreParaFirmar, type Borrador } from '@/lib/panel/borradores';

/** Cada cuánto se relee mientras sale, y hasta cuándo (el bot puede estar apagado). */
const CADA_MS = 3000;
const HASTA_MS = 120_000;

export default function BorradorEnChat({ id, leadId, nombre }: { id: string; leadId: string; nombre: string }) {
  const { session } = useSesion();
  const [b, setB] = useState<Borrador | null | undefined>(undefined);
  /** Cuándo empezó a salir: pasado HASTA_MS se deja de releer. */
  const desde = useRef(0);

  const leer = useCallback(() => {
    void getBorrador(id).then(setB);
  }, [id]);

  useEffect(leer, [leer]);

  // Solo mientras está saliendo (aprobado y no programado para la mañana).
  const saliendo =
    b?.estado === 'aprobado' && !(b.programado_para && new Date(b.programado_para).getTime() > Date.now());
  useEffect(() => {
    if (!saliendo) return;
    if (!desde.current) desde.current = Date.now();
    const t = setInterval(() => {
      if (Date.now() - desde.current > HASTA_MS) clearInterval(t);
      else leer();
    }, CADA_MS);
    return () => clearInterval(t);
  }, [saliendo, leer]);

  if (b === undefined) return <p className="asis-b__borrador-carga">Cargando el mensaje…</p>;
  if (b === null) {
    return (
      <Link className="btn btn-ghost btn-sm asis-b__borrador" href={`/panel/mensajes?lead=${encodeURIComponent(leadId)}`}>
        Ver el mensaje en el chat de {nombre || 'este cliente'}
      </Link>
    );
  }
  return (
    <div className="asis-b__tarjeta">
      <TarjetaBorrador
        borrador={b}
        yo={session?.user?.id ?? null}
        miNombre={nombreParaFirmar(session?.user?.user_metadata)}
        enMia
        alCambiar={leer}
      />
      <Link className="asis-b__ver-chat" href={`/panel/mensajes?lead=${encodeURIComponent(leadId)}`}>
        Ver la conversación con {nombre || 'este cliente'}
      </Link>
    </div>
  );
}
