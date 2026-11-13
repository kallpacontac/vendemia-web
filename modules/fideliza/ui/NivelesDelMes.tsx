'use client';

/**
 * FIDELIZA · PROGRAMA, paso 3 · lo que añadió 0015 (12-nov-2026, para Kallpa):
 *
 *   · Niveles del mes: el saldo vuelve a 0 cada mes y cada nivel da su beneficio
 *     (solo vale el más alto) y sus regalos (se suman).
 *   · Espera entre visitas: con 12 h, la misma persona no suma dos veces seguidas.
 *   · Bono: un botón en la caja que suma de golpe (p. ej. «Reto del BOX +4»).
 *
 * Todo opcional. Sin tocar nada, el programa funciona como siempre.
 */
import type { ReactNode } from 'react';
import type { Nivel, Programa } from '@/modules/fideliza/cliente/api';

type Borrador = Programa['draft'];

const NIVEL_NUEVO = (at: number): Nivel => ({ at, level: '', gift: '', gift_count: 0 });

export default function NivelesDelMes({
  b,
  editable,
  ponNiveles,
  setB,
  campo,
}: {
  b: Borrador;
  editable: boolean;
  ponNiveles: (n: Nivel[] | null) => void;
  setB: (f: (x: Borrador) => Borrador) => void;
  campo: (label: string, hijo: ReactNode, ayuda?: string, clave?: string) => ReactNode;
}) {
  const niveles = b.period === 'month' ? (b.tiers ?? []) : null;
  const cuenta = b.rule_type === 'visits' ? 'visitas' : 'sellos';
  const cambiar = (i: number, x: Partial<Nivel>) => ponNiveles(niveles!.map((n, j) => (j === i ? { ...n, ...x } : n)));

  return (
    <>
      {campo(
        'Niveles del mes',
        <div>
          <label className="check-inline" style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={!!niveles}
              disabled={!editable}
              onChange={(e) => ponNiveles(e.target.checked ? [NIVEL_NUEVO(b.reward_threshold ?? 10)] : null)}
            />{' '}
            Contar por mes, con niveles (el día 1 todos vuelven a 0)
          </label>
          {niveles && (
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {niveles.map((n, i) => (
                <div key={i} className="card" style={{ padding: 12 }}>
                  <div className="fz-fila" style={{ alignItems: 'center', marginBottom: 8 }}>
                    <b style={{ flex: 1 }}>Nivel {i + 1}</b>
                    {niveles.length > 1 && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={!editable} onClick={() => ponNiveles(niveles.filter((_, j) => j !== i))}>
                        Quitar
                      </button>
                    )}
                  </div>
                  <div className="fz-col2">
                    <label className="field-label">
                      Al llegar a ({cuenta} en el mes)
                      <input className="input" type="number" min={1} max={1000} value={n.at || ''} disabled={!editable} onChange={(e) => cambiar(i, { at: Number(e.target.value) || 0 })} />
                    </label>
                    <label className="field-label">
                      Gana (solo vale el nivel más alto)
                      <input className="input" maxLength={80} value={n.level} disabled={!editable} placeholder="5% de dscto en tu próxima membresía" onChange={(e) => cambiar(i, { level: e.target.value })} />
                    </label>
                    <label className="field-label">
                      Regalo extra (opcional)
                      <input className="input" maxLength={60} value={n.gift ?? ''} disabled={!editable} placeholder="Batido proteico" onChange={(e) => cambiar(i, { gift: e.target.value, gift_count: e.target.value.trim() ? Math.max(1, n.gift_count ?? 0) : 0 })} />
                    </label>
                    <label className="field-label">
                      Cuántos regalos da este nivel
                      <input className="input" type="number" min={0} max={10} value={n.gift_count ?? 0} disabled={!editable || !(n.gift ?? '').trim()} onChange={(e) => cambiar(i, { gift_count: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
                    </label>
                  </div>
                </div>
              ))}
              {niveles.length < 6 && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={!editable} onClick={() => ponNiveles([...niveles, NIVEL_NUEVO((niveles[niveles.length - 1]?.at ?? 0) + 4)])}>
                  Añadir nivel
                </button>
              )}
            </div>
          )}
        </div>,
        niveles
          ? 'Los regalos se suman: si el nivel 1 da 1 batido y el 2 da otro, quien llega al 2 tiene 2. El beneficio no: al subir, el de abajo se cambia por el nuevo.'
          : undefined,
        'niveles',
      )}
      <div className="fz-col2">
        {campo(
          'Espera entre visitas (horas, opcional)',
          <input
            className="input"
            type="number"
            min={1}
            max={168}
            value={b.cooldown_hours ?? ''}
            disabled={!editable}
            placeholder="12"
            onChange={(e) => setB((x) => ({ ...x, cooldown_hours: e.target.value ? Number(e.target.value) : null }))}
          />,
          'Con 12, a la misma persona no se le suma otra vez hasta 12 horas después. Vacío = sin espera.',
          'espera',
        )}
        {campo(
          'Bono (opcional)',
          <div className="fz-fila" style={{ gap: 8 }}>
            <input
              className="input"
              style={{ flex: 2 }}
              maxLength={40}
              value={b.bonus_label ?? ''}
              disabled={!editable}
              placeholder="Reto del BOX"
              onChange={(e) => setB((x) => ({ ...x, bonus_label: e.target.value, bonus_units: e.target.value.trim() ? (x.bonus_units ?? 4) : x.bonus_units }))}
            />
            <input
              className="input"
              style={{ flex: 1 }}
              type="number"
              min={1}
              max={100}
              value={b.bonus_units ?? ''}
              disabled={!editable}
              placeholder="4"
              aria-label="Cuánto suma el bono"
              onChange={(e) => setB((x) => ({ ...x, bonus_units: e.target.value ? Number(e.target.value) : null }))}
            />
          </div>,
          `Sale como botón en la caja y en Clientes. Suma ${cuenta} de golpe y no cuenta para la espera.`,
          'bono',
        )}
      </div>
    </>
  );
}
