'use client';

/**
 * Lo que ve el dueño de Zona Gol, sin sesión y con datos inventados. Lo reservado en
 * /ejemplos/canchas aparece aquí, y cobrarlo mueve las cifras. Nada sale del navegador.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { armarTablero, type ReservaTablero } from '@/lib/panel/tablero-canchas';
import TableroCanchasVista from '@/components/panel/TableroCanchasVista';
import { sumarMin } from '@/modules/tu-pagina/dominio/agenda';
import { precioReserva } from '@/modules/tu-pagina/dominio/canchas';
import {
  ADELANTO_EJEMPLO,
  CANCHAS_EJEMPLO,
  CONFIG_EJEMPLO,
  HORARIO_EJEMPLO,
  PASO_EJEMPLO,
  leerReservasDemo,
  reservasEjemplo,
} from '@/modules/tu-pagina/dominio/canchas-ejemplo';

export default function CanchasPanelEjemplo({ hoy, ahora, fechaInicial, nueva }: { hoy: string; ahora: string; fechaInicial: string; nueva?: string }) {
  const [fecha, setFecha] = useState(fechaInicial);
  const base = useMemo(() => reservasEjemplo(hoy, ahora), [hoy, ahora]);
  const [propias, setPropias] = useState<ReservaTablero[]>([]);
  const [cobradas, setCobradas] = useState<string[]>([]);
  const [validadas, setValidadas] = useState<string[]>([]);
  const [aviso, setAviso] = useState('');

  // Solo en el navegador: en el servidor no hay sessionStorage y el HTML no cuadraría.
  useEffect(() => {
    setPropias(leerReservasDemo().map(({ validada, ...r }) => ({ ...r, pagado: validada ? Math.min(ADELANTO_EJEMPLO, r.total) : 0, estado: validada ? 'a_cuenta' : 'esperando_pago' })));
  }, []);

  const reservas = useMemo(() => {
    const pisada = (r: ReservaTablero) => propias.some((p) => p.cancha === r.cancha && p.inicio < r.fin && p.fin > r.inicio);
    return [...base.filter((r) => !pisada(r)), ...propias].map((r): ReservaTablero => {
      if (cobradas.includes(r.id)) return { ...r, pagado: r.total, estado: 'cobrada' };
      if (validadas.includes(r.id)) return { ...r, pagado: Math.min(ADELANTO_EJEMPLO, r.total), estado: 'a_cuenta' };
      return r;
    });
  }, [base, propias, cobradas, validadas]);

  const tablero = useMemo(
    () => armarTablero({ canchas: CANCHAS_EJEMPLO, reservas, horario: HORARIO_EJEMPLO, paso: PASO_EJEMPLO, fecha, ahora, cfg: CONFIG_EJEMPLO }),
    [reservas, fecha, ahora],
  );

  function reservarPorTelefono(cancha: string, inicio: string) {
    const item = CANCHAS_EJEMPLO.find((c) => c.id === cancha);
    if (!item) return;
    setPropias((p) => [...p, {
      id: `tel-${cancha}-${inicio}`, cancha, cliente: 'Reserva por teléfono', inicio, fin: sumarMin(inicio, PASO_EJEMPLO),
      total: precioReserva(CONFIG_EJEMPLO, { ...item, duracion: PASO_EJEMPLO }, inicio, 1) ?? 0, pagado: 0, estado: 'por_cobrar',
    }]);
    setAviso(`Listo: ${item.nombre} a las ${inicio.slice(11, 16)} ya no se le ofrece a nadie más.`);
  }

  return (
    <div className="tc-ejemplo">
      <div className="tc-ejemplo__marco">
        <p className="tc-ejemplo__banda">
          <span>Vista de ejemplo del panel del dueño. Datos inventados: nada se guarda.</span>
          <a href="/ejemplos/canchas#reservar">Reservar como cliente</a>
        </p>
        <div className="tc-ejemplo__titulo">
          <h1>Zona Gol · Reservas</h1>
          <p>Qué cancha está libre, quién reservó y cuánto dinero falta cobrar.</p>
        </div>
        {aviso && <p className="tc-ejemplo__aviso" role="status">{aviso}</p>}
        <TableroCanchasVista
          tablero={tablero}
          fecha={fecha}
          hoy={hoy}
          alFecha={setFecha}
          alLibre={reservarPorTelefono}
          resaltar={nueva}
          acciones={(r, cerrar) => {
            if (r.estado === 'cobrada') return <p className="tc-ejemplo__aviso">Ya está cobrada y suma en «Ya cobrado».</p>;
            if (r.estado === 'esperando_pago') {
              return (
                <>
                  <p className="tc-ejemplo__aviso">Apartada 30 minutos. Si no paga, la cancha se vuelve a ofrecer.</p>
                  <button type="button" className="tc__accion" onClick={() => { setValidadas((v) => [...v, r.id]); setAviso(`Mia validó el Yape de S/ ${ADELANTO_EJEMPLO} de ${r.cliente} y confirmó la reserva. Le quedan S/ ${r.total - ADELANTO_EJEMPLO} por pagar en la cancha.`); cerrar(); }}>
                    <Check size={17} aria-hidden="true" /> Simular: Mia valida el Yape de S/ {ADELANTO_EJEMPLO}
                  </button>
                </>
              );
            }
            return (
              <button type="button" className="tc__accion" onClick={() => { setCobradas((c) => [...c, r.id]); setAviso(`Cobrada la reserva de ${r.cliente}: S/ ${r.total} en total.`); cerrar(); }}>
                <Check size={17} aria-hidden="true" /> Cobrar lo que falta (S/ {r.total - r.pagado})
              </button>
            );
          }}
        />
      </div>
    </div>
  );
}
