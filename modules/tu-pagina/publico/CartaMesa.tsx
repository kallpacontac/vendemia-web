'use client';

/**
 * La carta de «Atención en mesa». La misma para quien la mira desde su casa
 * (`CartaSoloVer`, en la portada) y para quien está sentado (con `alAgregar`):
 * pedir o llamar al mozo desde afuera no tendría ningún sentido.
 *
 * El nombre traducido va arriba y el original debajo: es el que le muestra al mozo.
 * Un plato fuera de su horario no se esconde: se ve con su franja.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import type { Item, Opcion } from '@/modules/tu-pagina/dominio/tienda';
import { IDIOMAS, TEXTOS, idiomaDe, minutosEnLima, seSirveAhora, type AjustePlato, type AjustesCarta, type Idioma, type TextosMesa } from '@/modules/tu-pagina/dominio/mesa';
import './mesa.css';

const CLAVE_IDIOMA = 'vendemia_mesa_idioma';

/** localStorage puede no estar (ventana privada): la mesa funciona igual, en español. */
export function useIdiomaMesa() {
  const [idioma, setIdioma] = useState<Idioma>('es');
  useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem(CLAVE_IDIOMA);
    } catch { /* sin almacenamiento */ }
    setIdioma(idiomaDe(guardado, navigator.language));
  }, []);
  const cambiar = (nuevo: Idioma) => {
    setIdioma(nuevo);
    try {
      localStorage.setItem(CLAVE_IDIOMA, nuevo);
    } catch { /* sin almacenamiento */ }
  };
  return [idioma, cambiar] as const;
}

export function SelectorIdioma({ idioma, alCambiar, etiqueta }: { idioma: Idioma; alCambiar: (i: Idioma) => void; etiqueta: string }) {
  return (
    <select className="tm-idioma" aria-label={etiqueta} value={idioma} onChange={(e) => alCambiar(e.target.value as Idioma)}>
      {IDIOMAS.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
    </select>
  );
}

export const precioMesa = (n: number | null | undefined, t: TextosMesa) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return t.consultar;
  const v = Number(n);
  return v === 0 ? t.consultar : `S/ ${Number.isInteger(v) ? v : v.toFixed(2)}`;
};

export default function CartaMesa({ items, ajustes, idioma, t, alAgregar }: {
  items: Item[];
  ajustes: AjustesCarta;
  idioma: Idioma;
  t: TextosMesa;
  alAgregar?: (item: Item, opcion: string) => Promise<boolean>;
}) {
  const [familia, setFamilia] = useState('');
  const [busca, setBusca] = useState('');
  const [eligiendo, setEligiendo] = useState<Item | null>(null);
  const [recien, setRecien] = useState('');
  const [ahora, setAhora] = useState<number | null>(null);

  // La hora se lee en el navegador: la portada sale de caché.
  useEffect(() => {
    setAhora(minutosEnLima());
    const reloj = setInterval(() => setAhora(minutosEnLima()), 60_000);
    return () => clearInterval(reloj);
  }, []);

  const familias = useMemo(() => [...new Set(items.map((i) => i.familia).filter(Boolean))], [items]);
  const destacados = useMemo(() => items.filter((i) => ajustes[i.id]?.destacado), [items, ajustes]);
  const texto = busca.trim().toLocaleLowerCase('es');
  const coincide = (i: Item) => !texto || `${i.nombre} ${ajustes[i.id]?.en ?? ''} ${i.descripcion}`.toLocaleLowerCase('es').includes(texto);
  const visibles = items.filter((i) => (!familia || i.familia === familia) && coincide(i));
  const grupos = familia || texto
    ? [{ nombre: familia, lista: visibles }]
    : [...familias, ''].map((f) => ({ nombre: f, lista: visibles.filter((i) => i.familia === f) })).filter((g) => g.lista.length);

  async function agregar(item: Item, opcion: string) {
    if (!alAgregar || !(await alAgregar(item, opcion))) return;
    setEligiendo(null);
    setRecien(item.id);
    setTimeout(() => setRecien((actual) => (actual === item.id ? '' : actual)), 1400);
  }

  const fila = (i: Item) => (
    <Plato key={i.id} item={i} ajuste={ajustes[i.id]} idioma={idioma} t={t} ahora={ahora} recien={recien === i.id}
      alAgregar={alAgregar ? () => (i.opciones.length ? setEligiendo(i) : void agregar(i, '')) : undefined} />
  );

  return (
    <section className="tm-carta" id="catalogo">
      <label className="tm-busca">
        <Search size={17} aria-hidden="true" />
        <input type="search" value={busca} placeholder={t.buscar} aria-label={t.buscar} onChange={(e) => setBusca(e.target.value)} />
      </label>
      {familias.length > 1 && (
        <div className="tm-chips">
          <button type="button" aria-pressed={!familia} onClick={() => setFamilia('')}>{t.todo}</button>
          {familias.map((f) => <button key={f} type="button" aria-pressed={familia === f} onClick={() => setFamilia(f)}>{f}</button>)}
        </div>
      )}
      {idioma !== 'es' && <p className="tm-nota">{t.platosEnEspanol}</p>}
      {!familia && !texto && destacados.length > 0 && (
        <div className="tm-grupo tm-grupo--destacado">
          <h2>{t.destacados}</h2>
          {destacados.map(fila)}
        </div>
      )}
      {grupos.map((g) => (
        <div className="tm-grupo" key={g.nombre || 'resto'}>
          {g.nombre && <h2>{g.nombre}</h2>}
          {g.lista.map(fila)}
        </div>
      ))}
      {visibles.length === 0 && <p className="tm-nota tm-nota--centro">{t.sinResultados}</p>}

      {eligiendo && (
        <div className="tm-fondo" role="presentation" onClick={() => setEligiendo(null)}>
          <div className="tm-hojita" role="dialog" aria-modal="true" aria-label={t.opcion} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="tm-cerrar" aria-label={t.cerrar} onClick={() => setEligiendo(null)}><X size={20} /></button>
            <h2>{eligiendo.nombre}</h2>
            <p className="tm-ayuda">{t.opcion}</p>
            <div className="tm-opciones">
              {eligiendo.opciones.map((o: Opcion) => (
                <button key={o.id} type="button" disabled={o.quedan === 0} onClick={() => void agregar(eligiendo, o.id)}>
                  {o.etiqueta}{o.quedan === 0 ? ` · ${t.agotado}` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Plato({ item, ajuste, idioma, t, ahora, recien, alAgregar }: {
  item: Item;
  ajuste?: AjustePlato;
  idioma: Idioma;
  t: TextosMesa;
  ahora: number | null;
  recien: boolean;
  alAgregar?: () => void;
}) {
  const traducido = idioma === 'es' ? '' : ajuste?.en ?? '';
  const fuera = ahora !== null && !seSirveAhora(ajuste, ahora);
  const agotado = item.quedan === 0 && item.opciones.length === 0;
  const foto = item.fotos[0];
  return (
    <article className={`tm-plato${fuera || agotado ? ' tm-plato--apagado' : ''}`}>
      <div className="tm-plato__texto">
        <h3>{traducido || item.nombre}</h3>
        {traducido && <small className="tm-plato__original">{item.nombre}</small>}
        {item.descripcion && <p>{item.descripcion}</p>}
        <div className="tm-plato__pie">
          <b>{precioMesa(item.precio, t)}</b>
          {ajuste?.antes && <s>{precioMesa(ajuste.antes, t)}</s>}
          {agotado && <span>{t.agotado}</span>}
          {fuera && <span>{t.seSirve.replace('{desde}', ajuste?.desde ?? '').replace('{hasta}', ajuste?.hasta ?? '')}</span>}
        </div>
      </div>
      {foto && <img src={foto} alt="" loading="lazy" />}
      {alAgregar && !fuera && !agotado && (
        <button type="button" className={`tm-plato__mas${recien ? ' listo' : ''}`} aria-label={`${recien ? t.agregado : t.agregar}: ${item.nombre}`} onClick={alAgregar}>
          {recien ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
        </button>
      )}
    </article>
  );
}

/** La carta de la portada: para mirar. Pedir es de quien escanea el QR de su mesa. */
export function CartaSoloVer({ items, ajustes }: { items: Item[]; ajustes: AjustesCarta }) {
  const [idioma, setIdioma] = useIdiomaMesa();
  const t = TEXTOS[idioma];
  return (
    <div className="tm-solo-ver">
      <div className="tm-solo-ver__cabeza"><SelectorIdioma idioma={idioma} alCambiar={setIdioma} etiqueta={t.idioma} /></div>
      <CartaMesa items={items} ajustes={ajustes} idioma={idioma} t={t} />
    </div>
  );
}
