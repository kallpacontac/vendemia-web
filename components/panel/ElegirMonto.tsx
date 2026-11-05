'use client';

/**
 * Monto y método de un pago de cancha: «Adelanto» y «Completo» con un toque, o el monto a mano.
 * Lo usan «Por revisar» y «Validar pago».
 */
import { NOMBRE_METODO, opcionesDeMonto, soles, type Cobro } from '@/lib/panel/cobro-cancha';

export const METODOS_COMPROBANTE = ['yape', 'plin', 'bank_transfer'];
export const METODOS_TODOS = ['yape', 'plin', 'cash', 'bank_transfer'];

export default function ElegirMonto({ cobro, monto, metodo, metodos, etiquetaMonto = 'Monto (S/)', alMonto, alMetodo }: {
  cobro: Cobro;
  monto: string;
  metodo: string;
  metodos: string[];
  etiquetaMonto?: string;
  alMonto: (v: string) => void;
  alMetodo: (v: string) => void;
}) {
  const opciones = opcionesDeMonto(cobro);
  return (
    <>
      {opciones.length > 0 && (
        <div className="tc-montos" role="group" aria-label="Monto rápido">
          {opciones.map((o) => (
            <button key={o.clave} type="button" aria-pressed={Number(monto.replace(',', '.')) === o.monto} onClick={() => alMonto(String(o.monto))}>
              <span>{o.etiqueta}</span>
              <b>{soles(o.monto)}</b>
            </button>
          ))}
        </div>
      )}
      <div className="tc-revisar__campos">
        <label>{etiquetaMonto}
          <input inputMode="decimal" placeholder="Otro monto" value={monto} onChange={(e) => alMonto(e.target.value)} />
        </label>
        <label>Método
          <select value={metodo} onChange={(e) => alMetodo(e.target.value)}>
            {metodos.map((m) => <option key={m} value={m}>{NOMBRE_METODO[m] ?? m}</option>)}
          </select>
        </label>
      </div>
    </>
  );
}
