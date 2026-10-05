'use client';

/**
 * Cómo verá el CLIENTE su tarjeta mientras el dueño la configura.
 *
 * Cada parte lleva una «zona». Cuando el dueño está en un campo, la parte de
 * la tarjeta a la que afecta se resalta: así se ve a qué se refiere cada cosa
 * sin tener que explicarlo con palabras. Los números son de ejemplo (3 de N)
 * y lo dice.
 */
import { UNIDAD, fraseRegla, soles, type TipoRegla } from '@/modules/fideliza/dominio/formato';

export interface DatosVista {
  negocio: string;
  frase: string;
  color: string;
  logo: string;
  programa: string;
  descripcion: string;
  tipo: TipoRegla | undefined;
  umbral: number | undefined;
  premio: string;
  sellosPorCompra?: number;
  puntosPorUnidad?: number;
  unidadCentimos?: number;
  minimoCentimos?: number;
  diasPremio?: number | null;
  ayuda: string;
}

function tintaSobre(hex: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return '#1A0A00';
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.055 ? '#FFFFFF' : '#1A0A00';
}

export default function VistaTarjeta({ d, foco }: { d: DatosVista; foco: string | null }) {
  const z = (zona: string) => (foco === zona ? 'fz-zona fz-zona--foco' : 'fz-zona');
  const tipo = d.tipo ?? 'stamps';
  const umbral = d.umbral && d.umbral > 0 ? d.umbral : 10;
  const ejemplo = Math.min(3, Math.max(umbral - 1, 0));
  const u = UNIDAD[tipo];

  return (
    <div>
      <div className="fz-movil">
        <div className={`fz-movil__cab ${z('color')}`} style={{ background: d.color, color: tintaSobre(d.color) }}>
          <span className={z('logo')}>
            {d.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.logo} alt="" />
            ) : (
              <span className="fz-movil__logo">{(d.negocio || '?').slice(0, 1).toUpperCase()}</span>
            )}
          </span>
          <b className={z('negocio')}>{d.negocio || 'Tu negocio'}</b>
          {d.frase && <small className={z('frase')}>{d.frase}</small>}
          <small className={z('programa')} style={{ fontWeight: 700 }}>{d.programa || 'Nombre de tu programa'}</small>
        </div>

        <div className="fz-movil__cuerpo">
          {d.descripcion && <p className={`fz-movil__desc ${z('descripcion')}`}>{d.descripcion}</p>}
          <div className={z('umbral')}>
            <div className="fz-movil__saldo">
              {ejemplo} <span>de {umbral} {u.varias}</span>
            </div>
            <div className="fz-movil__barra">
              <i style={{ width: `${(ejemplo / umbral) * 100}%`, background: d.color }} />
            </div>
          </div>
          <p className={`fz-movil__premio ${z('premio')}`}>
            Te faltan {umbral - ejemplo} para: <b>{d.premio || 'tu premio'}</b>
          </p>
          {d.diasPremio ? <p className={`fz-movil__nota ${z('vence')}`}>El premio se puede usar durante {d.diasPremio} días.</p> : null}
          <div className={`fz-movil__regla ${z('regla')} ${foco === 'minimo' ? 'fz-zona--foco' : ''}`}>
            {d.premio && d.umbral
              ? fraseRegla({
                  rule_type: tipo,
                  threshold: umbral,
                  reward: d.premio,
                  stamps_per_purchase: d.sellosPorCompra,
                  points_per_unit: d.puntosPorUnidad,
                  unit_cents: d.unidadCentimos,
                  min_purchase_cents: d.minimoCentimos,
                })
              : `Aquí se explicará cómo se ganan los ${u.varias}.`}
            {d.minimoCentimos ? <span className={z('minimo')}> (compras desde {soles(d.minimoCentimos)})</span> : null}
          </div>
          <div className="fz-movil__qr" aria-hidden="true">
            <span />
            <small>VDM-A7K9P2</small>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="fz-movil__wallet" src="/wallet/es419_add_to_google_wallet_wallet-button.svg" alt="" />
          {d.ayuda && <p className={`fz-movil__nota ${z('ayuda')}`}>Ayuda: {d.ayuda.replace(/^https?:\/\//, '').slice(0, 32)}</p>}
        </div>
      </div>
      <small className="fz-def" style={{ textAlign: 'center', display: 'block' }}>
        Así verá el cliente su tarjeta (con datos de ejemplo). Lo resaltado es lo que estás editando.
      </small>
    </div>
  );
}
