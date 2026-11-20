'use client';

/**
 * «Por pagar a tu equipo» · arriba de Comisiones (datos 0014, 18-nov-2026).
 *
 * Por barbero: lo que lleva ganado desde su último pago (comisión de lo atendido) menos sus
 * adelantos, y un botón «Pagar». Pagar apunta un cierre: esas citas y adelantos ya no vuelven
 * a salir, y el pago sale como gasto de hoy en la Caja (datos 0014), para que cuadre con el cajón.
 * Debajo, los últimos pagos, con «Deshacer» para el dueño si se equivocó (borra también el gasto).
 *
 * La cuenta vive en lib/panel/cierres.ts. Sin la 0014, o si quien mira no es dueño ni
 * administrador, no se pinta.
 */
import { useState } from 'react';
import { Check, HandCoins, Undo2 } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { calcularPorPagar, deshacerCierre, leerCierres, pagarCierre, solesExactos as soles, type MetodoCierre, type PorPagar } from '@/lib/panel/cierres';
import { diaMes } from '@/lib/panel/format';
import { rango, type Periodo } from '@/lib/panel/periodos';
import './pendientes.css';

const METODOS: [MetodoCierre, string][] = [
  ['efectivo', 'Efectivo'],
  ['yape', 'Yape'],
  ['plin', 'Plin'],
  ['transferencia', 'Transferencia'],
];

const fecha = (iso: string) => diaMes(new Date(`${iso.slice(0, 10)}T12:00:00`));

/** Cierran cada semana (lunes a domingo); la semana anterior, para pagarla el lunes. */
const FILTROS: [Periodo, string][] = [
  ['semana', 'Esta semana'],
  ['semana-anterior', 'Semana anterior'],
  ['quincena', 'Quincena'],
  ['mes', 'Mes'],
];

export default function CierresPorPagar({ companyId, esDueno }: { companyId: string; esDueno: boolean }) {
  const avisar = useAvisar();
  const [ronda, setRonda] = useState(0);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<MetodoCierre>('efectivo');
  const [enVuelo, setEnVuelo] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const fechas = rango(periodo);

  const { datos } = useCargar(async () => {
    const cierres = await leerCierres(companyId);
    if (!cierres) return null;
    const { porPagar, desde, nombres } = await calcularPorPagar(companyId, cierres, new Date(), fechas);
    return { cierres, porPagar, desde, nombres };
  }, [companyId, ronda, fechas.desde, fechas.hasta]);

  if (!datos) return null;
  const { porPagar, cierres, nombres: nombreDe } = datos;
  const ultimos = cierres.slice(0, 5);

  async function pagar(p: PorPagar) {
    setEnVuelo(true);
    try {
      await pagarCierre(companyId, p, metodo);
      avisar(`Pagado: ${soles(p.aPagar)} a ${p.nombre} (${METODOS.find((m) => m[0] === metodo)?.[1].toLowerCase()}). Sale como gasto de hoy en la Caja.`, 'ok');
      setAbierto(null);
      setRonda((r) => r + 1);
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setEnVuelo(false);
    }
  }

  async function deshacer(id: string) {
    if (!window.confirm('¿Deshacer este pago? Sus citas y adelantos vuelven a «por pagar» y se borra su gasto de la Caja.')) return;
    try {
      await deshacerCierre(companyId, id);
      avisar('Pago deshecho.', 'ok');
      setRonda((r) => r + 1);
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  }

  return (
    <section className="card cierres" aria-label="Por pagar a tu equipo">
      <div className="card-head">
        <h3><HandCoins size={17} style={{ verticalAlign: -3 }} /> Por pagar a tu equipo</h3>
      </div>
      <div className="filters cierres__filtro" role="tablist" aria-label="Periodo">
        {FILTROS.map(([k, txt]) => (
          <button key={k} type="button" role="tab" aria-selected={periodo === k} className={`fpill ${periodo === k ? 'active' : ''}`}
            onClick={() => setPeriodo(k)}>
            {txt}
          </button>
        ))}
        <span className="muted cierres__rango">del {fecha(fechas.desde)} al {fecha(fechas.hasta)}</span>
      </div>

      {porPagar.length === 0 ? (
        <p className="muted cierres__vacio">Nada por pagar en estas fechas. Lo que atiendan sale aquí.</p>
      ) : (
        <ul className="cierres__lista">
          {porPagar.map((p) => (
            <li key={p.employeeId} className="cierres__fila">
              <div className="cierres__quien">
                <b>{p.nombre}</b>
                <small className="muted">
                  {p.citas.length} {p.citas.length === 1 ? 'atención' : 'atenciones'} · comisión {soles(p.comision)}
                  {p.adelantado > 0 && ` − adelantos ${soles(p.adelantado)}`}
                </small>
              </div>
              <b className={`cierres__monto${p.aPagar < 0 ? ' cierres__monto--debe' : ''}`}>
                {p.aPagar < 0 ? `Debe ${soles(-p.aPagar)}` : soles(p.aPagar)}
              </b>
              {p.aPagar > 0 ? (
                abierto === p.employeeId ? (
                  <div className="cierres__pagar">
                    <div className="filters" role="group" aria-label="¿Cómo le pagaste?">
                      {METODOS.map(([m, txt]) => (
                        <button key={m} type="button" className={`fpill ${metodo === m ? 'active' : ''}`} aria-pressed={metodo === m} onClick={() => setMetodo(m)}>
                          {txt}
                        </button>
                      ))}
                    </div>
                    <small className="muted cierres__nota">Sale como gasto de hoy en la Caja.</small>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierto(null)} disabled={enVuelo}>Cancelar</button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => pagar(p)} disabled={enVuelo}>
                      <Check size={14} /> {enVuelo ? 'Guardando…' : `Pagué ${soles(p.aPagar)}`}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => { setAbierto(p.employeeId); setMetodo('efectivo'); }}>
                    Pagar
                  </button>
                )
              ) : (
                <small className="muted">Se descuenta de lo próximo.</small>
              )}
            </li>
          ))}
        </ul>
      )}

      {ultimos.length > 0 && (
        <details className="cierres__hechos">
          <summary>Últimos pagos</summary>
          <ul>
            {ultimos.map((c) => (
              <li key={c.id}>
                <span>
                  {fecha(c.pagado_at)} · <b>{nombreDe.get(c.employee_id) ?? 'Barbero'}</b> · {soles(c.pagado)} en {c.metodo}
                  <small className="muted"> ({c.citas.length} {c.citas.length === 1 ? 'atención' : 'atenciones'})</small>
                </span>
                {esDueno && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => deshacer(c.id)} title="Deshacer este pago">
                    <Undo2 size={14} /> Deshacer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
