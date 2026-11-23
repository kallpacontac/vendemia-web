'use client';

/**
 * Lo primero que ve el dueño en Inicio (maqueta aprobada, 20-nov-2026):
 *   · «Plata que volvió» este mes, con las piezas del Dashboard (importe grande, comparación y
 *     barras), y los recuperados aparte.
 *   · «Escríbeles hoy»: hasta 5 clientes, con el motivo y el mensaje armado, para escribirles uno
 *     por uno desde su WhatsApp. Nunca en masa (ver dominio/valor.ts).
 * Los cálculos están en dominio/valor.ts. Lo ya escrito se recuerda en este aparato 14 días
 * (localStorage): es una ayuda para no repetir, no un registro.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, MessageCircle, X } from 'lucide-react';
import ContadorAnimado from '@/components/panel/ContadorAnimado';
import '@/components/panel/resumen-negocio.css';
import { useCargar } from '@/components/panel/useCargar';
import { delta } from '@/lib/panel/serie';
import { accion, lecturas } from '@/modules/fideliza/cliente/api';
import { soles } from '@/modules/fideliza/dominio/formato';
import {
  aQuienEscribir, enlaceWhatsapp, mensajePara, motivoTexto, plataQueVolvio, DIAS_RECUPERADO, type Candidato,
} from '@/modules/fideliza/dominio/valor';

const MOSTRAR = 5;
const claveEscritos = (c: string) => `fz:escritos:${c}`;
function leerEscritos(companyId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(claveEscritos(companyId)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function guardarEscrito(companyId: string, memberId: string) {
  try {
    const hoy = Date.now();
    const todos = leerEscritos(companyId);
    todos[memberId] = new Date(hoy).toISOString();
    // Solo los de los últimos 14 días: lo demás ya no sirve.
    for (const [k, v] of Object.entries(todos)) if (hoy - Date.parse(v) > 14 * 86_400_000) delete todos[k];
    localStorage.setItem(claveEscritos(companyId), JSON.stringify(todos));
  } catch {
    /* sin almacenamiento: no pasa nada, solo no se recuerda */
  }
}

interface Props {
  companyId: string;
  negocio: string;
  club: string;
  premio: string;
  /** Sin permiso para ver celulares (contacts.read) no sale «Escríbeles hoy». */
  verContactos: boolean;
}

type ConCelular = Candidato & { telefono: string };

export default function ValorDelClub({ companyId, negocio, club, premio, verContactos }: Props) {
  const { datos } = useCargar(async () => {
    const desde = new Date(Date.now() - 730 * 86_400_000).toISOString();
    const [visitas, miembros] = await Promise.all([
      lecturas.visitasDesde(companyId, desde),
      verContactos ? lecturas.miembrosParaEscribir(companyId).catch(() => []) : Promise.resolve([]),
    ]);
    return { visitas, miembros };
  }, [companyId, verContactos]);

  const plata = useMemo(() => (datos ? plataQueVolvio(datos.visitas) : null), [datos]);
  const candidatos = useMemo(
    () => (datos && verContactos ? aQuienEscribir(datos.visitas, datos.miembros, leerEscritos(companyId)) : []),
    [datos, verContactos, companyId],
  );

  // El celular de cada uno, de uno en uno, hasta tener 5 que se puedan escribir.
  const [lista, setLista] = useState<ConCelular[] | null>(null);
  useEffect(() => {
    if (!verContactos || !datos) return;
    let vivo = true;
    (async () => {
      const con: ConCelular[] = [];
      for (const c of candidatos) {
        if (con.length >= MOSTRAR) break;
        try {
          const f = await accion<{ can_see_contacts: boolean; contacts: { kind: string; value?: string }[] | null }>('miembro.ficha', { companyId, memberId: c.id });
          const tel = f.can_see_contacts ? f.contacts?.find((x) => x.kind === 'phone')?.value : undefined;
          if (tel && enlaceWhatsapp(tel, '')) con.push({ ...c, telefono: tel });
        } catch {
          /* uno que falla no tumba la lista */
        }
        if (vivo) setLista([...con]);
      }
      if (vivo) setLista(con);
    })();
    return () => {
      vivo = false;
    };
  }, [candidatos, companyId, verContactos, datos]);

  const [escritos, setEscritos] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState<ConCelular | null>(null);
  const [texto, setTexto] = useState('');

  if (!plata) return null;
  // Un club sin visitas todavía: aquí no hay nada que contar (Primeros pasos va primero).
  const hayAlgo = plata.visitas + plata.visitasAntes > 0 || candidatos.length > 0;
  if (!hayAlgo) return null;

  const conImporte = plata.conImporte > 0;
  const actual = conImporte ? plata.plata : plata.visitas;
  const previo = conImporte ? plata.plataAntes : plata.visitasAntes;
  const d = delta(actual, previo);
  const techo = Math.max(1, ...plata.semanas);
  const etiquetas = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'];

  function abrir(c: ConCelular) {
    setTexto(mensajePara(c, { negocio, club, premio }));
    setAbierto(c);
  }
  const enlace = abierto ? enlaceWhatsapp(abierto.telefono, texto) : null;

  return (
    <div className={`fz-numeros__fila fz-valor${verContactos ? '' : ' fz-valor--solo'}`}>
      <article className="fz-numeros__card fz-plata">
        <div className="negocio-card-head">
          <h2>Plata que volvió</h2>
          <span className="negocio-currency">{plata.mes}</span>
        </div>
        <strong className="negocio-importe">
          {conImporte ? <ContadorAnimado valor={Math.round(plata.plata / 100)} moneda /> : <ContadorAnimado valor={plata.visitas} />}
        </strong>
        <div className="negocio-comparacion">
          <span className={`resumen-cambio ${d.clase}`}>{d.texto}</span>
          <span>vs. los mismos días de {plata.mesAnterior}</span>
        </div>
        <p className="fz-numeros__sub fz-plata__que">
          {conImporte
            ? `${plata.visitas} ${plata.visitas === 1 ? 'visita' : 'visitas'} de ${plata.clientes} ${plata.clientes === 1 ? 'cliente que volvió' : 'clientes que volvieron'}.`
            : `Visitas de ${plata.clientes} ${plata.clientes === 1 ? 'cliente que volvió' : 'clientes que volvieron'}. Anota el importe al dar el sello y aquí lo verás en soles.`}
        </p>
        <div className="fz-plata__barras" aria-hidden="true">
          {plata.semanas.map((v, i) => (
            <div key={i} className="fz-plata__semana">
              <i className={i === plata.semanaActual ? 'actual' : i < plata.semanaActual ? 'pasada' : ''} style={{ height: `${Math.max(4, (v / techo) * 100)}%` }} />
              <small>{i === plata.semanaActual ? 'Esta' : etiquetas[i]}</small>
            </div>
          ))}
        </div>
        {plata.recuperados.clientes > 0 && (
          <div className="fz-plata__recuperados">
            <span>
              <b>{plata.recuperados.clientes} {plata.recuperados.clientes === 1 ? 'recuperado' : 'recuperados'}</b> · llevaban más de {DIAS_RECUPERADO} días sin venir
            </span>
            {conImporte && plata.recuperados.plata > 0 && <b>{soles(plata.recuperados.plata)}</b>}
          </div>
        )}
        <Link className="nc-link fz-plata__mas" href="/panel/fideliza/numeros">Ver todos tus números →</Link>
      </article>

      {verContactos && (
        <article className="fz-numeros__card fz-escribe">
          <div className="negocio-card-head">
            <h2>Escríbeles hoy</h2>
            {lista && lista.length > 0 && <span className="negocio-currency">{escritos.size} de {lista.length}</span>}
          </div>
          <p className="fz-numeros__sub">Les escribes tú, uno por uno, desde tu WhatsApp. Si vuelven, cuentan en la plata que volvió.</p>
          {lista === null ? (
            <p className="fz-numeros__nota">Buscando a quién escribirle…</p>
          ) : lista.length === 0 ? (
            <p className="fz-numeros__nota">Hoy no hay nadie pendiente con celular. Vuelve mañana.</p>
          ) : (
            <ul className="fz-escribe__lista">
              {lista.map((c) => (
                <li key={c.id}>
                  <span className="fz-escribe__av" aria-hidden="true">{(c.nombre ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                  <div className="fz-escribe__quien">
                    <b>{c.nombre ?? 'Sin nombre'}</b>
                    <span className={`fz-escribe__motivo fz-escribe__motivo--${c.motivo}`}>{motivoTexto(c)}</span>
                  </div>
                  {escritos.has(c.id) ? (
                    <span className="fz-escribe__hecho"><Check size={15} /> Escrito</span>
                  ) : (
                    <button type="button" className="btn fz-escribe__wa" onClick={() => abrir(c)}>
                      <MessageCircle size={16} /> Escribir
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      {abierto && (
        <div className="modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(null); }}>
          <div className="modal fz-modal" role="dialog" aria-modal="true" aria-labelledby="fz-escribe-titulo">
            <div className="fz-modal__cab">
              <h3 id="fz-escribe-titulo">Escribir a {abierto.nombre?.split(/\s+/)[0] ?? 'tu cliente'}</h3>
              <button type="button" className="q-icon" aria-label="Cerrar" onClick={() => setAbierto(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="fz-modal__cuerpo">
              <p className="fz-def" style={{ marginTop: 0 }}>{abierto.telefono} · {motivoTexto(abierto)}</p>
              <div className="fz-campo">
                <label className="field-label" htmlFor="fz-escribe-texto">Mensaje (lo puedes cambiar)</label>
                <textarea id="fz-escribe-texto" className="textarea" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
              </div>
            </div>
            <div className="fz-modal__pie">
              {enlace ? (
                <a
                  className="btn fz-escribe__wa fz-escribe__wa--grande"
                  href={enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    guardarEscrito(companyId, abierto.id);
                    setEscritos((s) => new Set(s).add(abierto.id));
                    setAbierto(null);
                  }}
                >
                  <MessageCircle size={18} /> Abrir WhatsApp
                </a>
              ) : (
                <p className="fz-def">Ese celular no parece válido. Corrígelo en su ficha de Clientes.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
