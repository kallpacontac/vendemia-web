'use client';

/**
 * Cómo verá el CLIENTE su tarjeta mientras el dueño la configura.
 *
 * Cada parte lleva una «zona». Cuando el dueño está en un campo, la parte de
 * la tarjeta a la que afecta se resalta: así se ve a qué se refiere cada cosa
 * sin tener que explicarlo con palabras. Los números son de ejemplo (3 de N)
 * y lo dice.
 */
import { useEffect, useRef } from 'react';
import { fotoEnCirculo } from '@/modules/fideliza/dominio/encuadre';
import { UNIDAD, fraseRegla, soles, type TipoRegla } from '@/modules/fideliza/dominio/formato';
import { colorValido, resolverEstilo, tintaSobre, type Estilo } from '@/modules/fideliza/dominio/estilo';
import { selloValido, trazoSello } from '@/modules/fideliza/dominio/sellos';

export interface DatosVista {
  negocio: string;
  frase: string;
  color: string;
  estilo?: Partial<Estilo> | null;
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
  /**
   * 26-nov-2026: lo que se prende o apaga en Mi club, para verlo al momento. Sin ellos la vista
   * es la de siempre (botón de Wallet a la vista, sin casilla de avisos ni lista de visitas).
   */
  wallet?: boolean;
  avisos?: boolean;
  visita?: { art: 'un' | 'una'; una: string; titulo: string };
}

export default function VistaTarjeta({ d, foco }: { d: DatosVista; foco: string | null }) {
  const z = (zona: string) => (foco === zona ? 'fz-zona fz-zona--foco' : 'fz-zona');
  const tipo = d.tipo ?? 'stamps';
  const umbral = d.umbral && d.umbral > 0 ? d.umbral : 10;
  const ejemplo = Math.min(3, Math.max(umbral - 1, 0));
  const u = UNIDAD[tipo];
  const color = colorValido(d.color);
  const estilo = resolverEstilo(d.estilo);
  const sello = selloValido(d.estilo?.sello);
  const conFoto = Boolean(estilo.fondo);
  // Lo que se acaba de tocar puede quedar abajo del móvil: se trae a la vista.
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!foco) return;
    raiz.current?.querySelector('.fz-zona--foco')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [foco]);
  const apagado = (zona: string, texto: string) =>
    foco === zona ? <p className={`fz-movil__apagado ${z(zona)}`}>{texto}</p> : null;

  return (
    <div ref={raiz}>
      <div className="fz-movil">
        <div className={`fz-movil__cab ${z('color')}`} style={{ background: '#F9F9F6', color: '#171716' }}>
          <span className={z('logo')}>
            {d.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoEnCirculo(d.logo)} alt="" />
            ) : (
              <span className="fz-movil__logo">{(d.negocio || '?').slice(0, 1).toUpperCase()}</span>
            )}
          </span>
          <b className={z('negocio')}>{d.negocio || 'Tu negocio'}</b>
          {d.frase && <small className={z('frase')}>{d.frase}</small>}
        </div>

        <div className="fz-movil__cuerpo">
          {d.descripcion && <p className={`fz-movil__desc ${z('descripcion')}`}>{d.descripcion}</p>}
          <div className={`fz-movil__carnet ${z('umbral')} fz-movil__carnet--${estilo.plantilla}`} style={{ background: color, color: conFoto && (estilo.plantilla === 'foto' || estilo.plantilla === 'vidrio') ? '#fff' : tintaSobre(color) }}>
            {conFoto && <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={estilo.fondo} alt="" />
            </>}
            <div className="fz-movil__carnet-contenido">
              <small className={z('programa')}>FIDELIDAD · {d.programa || 'Tu programa'}</small>
              <span className="fz-movil__carnet-saludo">Hola, Ana</span>
              <div className="fz-movil__saldo">{ejemplo} <span>{u.varias}</span></div>
              {tipo === 'stamps' && umbral <= 12 ? (
                <div className="fz-movil__sellos" aria-label={`${ejemplo} de ${umbral} sellos`}>
                  {Array.from({ length: umbral }, (_, i) => (
                    <span key={i} className={i < ejemplo ? 'lleno' : ''}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: trazoSello(i === umbral - 1 ? 'regalo' : sello) }} />
                    </span>
                  ))}
                </div>
              ) : <div className="fz-movil__barra"><i style={{ width: `${(ejemplo / umbral) * 100}%`, background: tintaSobre(color) }} /></div>}
              <small>{ejemplo} de {umbral} {u.varias} para tu premio</small>
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
          {d.wallet !== false ? (
            <div className={`fz-movil__wallet-caja ${z('wallet')}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="fz-movil__wallet" src="/wallet/es419_add_to_google_wallet_wallet-button.svg" alt="" />
              <small className="fz-movil__nota">El botón desaparece cuando se guarda en Wallet.</small>
            </div>
          ) : apagado('wallet', 'Sin botón de Google Wallet')}
          {d.avisos === true ? (
            <label className={`fz-movil__avisos ${z('avisos')}`}>
              <input type="checkbox" readOnly checked={false} tabIndex={-1} />
              <span>Quiero que {d.negocio || 'tu negocio'} me avise de mis premios y promociones.</span>
            </label>
          ) : d.avisos === false ? apagado('avisos', 'Sin la casilla de avisos') : null}
          {d.visita && (
            <div className={`fz-movil__visitas ${z('visitas')}`}>
              <b>{d.visita.titulo}</b>
              <small className="fz-movil__nota">Toca {d.visita.art} {d.visita.una.toLowerCase()} para ver la fecha y quién te atendió.</small>
              <ul>
                <li><span>{d.visita.una}<small>Hoy, 10:30 · Carlos</small></span><b>+1</b></li>
                <li><span>{d.visita.una}<small>12 nov, 18:15 · Carlos</small></span><b>+1</b></li>
              </ul>
            </div>
          )}
          {d.ayuda && <p className={`fz-movil__nota ${z('ayuda')}`}>Ayuda: {d.ayuda.replace(/^https?:\/\//, '').slice(0, 32)}</p>}
        </div>
      </div>
      <small className="fz-def" style={{ textAlign: 'center', display: 'block' }}>
        Así verá el cliente su tarjeta (con datos de ejemplo). Lo resaltado es lo que estás editando.
      </small>
    </div>
  );
}
