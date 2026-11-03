'use client';

/**
 * «Abierto ahora · cierra a las 20:00», o «Cerrado · abre mañana a las 09:00».
 *
 * Se calcula en el navegador y no en el servidor: la portada sale de caché, y un
 * «abierto» congelado seguiría diciéndolo con el local ya cerrado. Por eso tampoco
 * se pinta nada hasta montar. Sin horario cargado no sale: mejor no decir nada que
 * decir «cerrado» de un negocio que solo no lo ha llenado.
 *
 * Solo informa: estar cerrado no impide pedir ni reservar.
 */
import { useEffect, useState } from 'react';
import type { Horario } from '@/lib/supabase/types';
import { aMinutos, estadoDelHorario, type EstadoDelHorario } from '@/modules/tu-pagina/dominio/agenda';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const textoDelHorario = (e: EstadoDelHorario): string => {
  if (e.abierto) return `Abierto ahora · cierra a las ${e.cierra}`;
  const cuando = e.enDias === 0 ? 'hoy' : e.enDias === 1 ? 'mañana' : `el ${DIAS[e.diaSemana]}`;
  return `Cerrado · abre ${cuando} a las ${e.abre}`;
};

/** La fecha y el minuto de ahora en Lima, sea cual sea la zona del celular. */
function ahoraEnLima(): { fecha: string; minuto: number } {
  const [fecha, hora] = new Date().toLocaleString('sv-SE', { timeZone: 'America/Lima' }).split(' ');
  return { fecha, minuto: aMinutos(hora) };
}

export default function EstadoHorario({ horario }: { horario: Horario }) {
  const [estado, setEstado] = useState<EstadoDelHorario | null>(null);

  useEffect(() => {
    const calcular = () => {
      const { fecha, minuto } = ahoraEnLima();
      setEstado(estadoDelHorario(horario, fecha, minuto));
    };
    calcular();
    const reloj = setInterval(calcular, 60_000);
    return () => clearInterval(reloj);
  }, [horario]);

  if (!estado) return null;
  return (
    <p className={`tp-estado-horario${estado.abierto ? ' tp-estado-horario--abierto' : ''}`}>
      <i aria-hidden="true" /> {textoDelHorario(estado)}
    </p>
  );
}
