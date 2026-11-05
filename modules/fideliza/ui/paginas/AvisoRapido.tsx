'use client';

/**
 * FIDELIZA · ENVIAR UN AVISO AHORA — el mensaje suelto del dueño.
 *
 * Las plantillas de abajo salen solas; esto sale cuando él quiere, a quien elige.
 * Enviar no se puede deshacer: antes se dice a cuántos llegará y hay que confirmar.
 * Las reglas son las de las campañas (loyalty_aviso_enviar, 0014).
 */
import { useState } from 'react';
import { Send } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { accion, mensaje, sincronizarEnSegundoPlano } from '@/modules/fideliza/cliente/api';

type Publico = 'todos' | 'inactivos' | 'cerca';
const OPCIONES: { p: Publico; nombre: string; titulo: string; texto: string; valor: number }[] = [
  { p: 'todos', nombre: 'A todos', titulo: '', texto: '', valor: 1 },
  { p: 'inactivos', nombre: 'Hace tiempo no vienen', titulo: 'Te extrañamos', texto: 'Hace tiempo no te vemos. Vuelve pronto: tu tarjeta sigue aquí.', valor: 30 },
  { p: 'cerca', nombre: 'Les falta poco', titulo: '¡Ya casi tienes tu premio!', texto: 'Solo {faltan} más para canjear tu premio.', valor: 2 },
];

interface Audiencia {
  matching: number;
  reachable: number;
  ejemplo: string;
}
const clientes = (n: number) => `${n} ${n === 1 ? 'cliente' : 'clientes'}`;

export default function AvisoRapido(props: { companyId: string; push: boolean; resumen: string | null; alEnviar: () => void }) {
  const { companyId } = props;
  const avisar = useAvisar();
  const [elegida, setElegida] = useState(OPCIONES[0]);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [valor, setValor] = useState(1);
  const [audiencia, setAudiencia] = useState<Audiencia | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function elegir(o: (typeof OPCIONES)[number]) {
    // Lo que él escribió no se pisa; el texto de ejemplo sí se cambia.
    const sinTocar = titulo === elegida.titulo && texto === elegida.texto;
    setElegida(o);
    setValor(o.valor);
    setAudiencia(null);
    if (sinTocar) {
      setTitulo(o.titulo);
      setTexto(o.texto);
    }
  }

  async function pedir<T>(fn: () => Promise<T>) {
    setOcupado(true);
    try {
      return await fn();
    } catch (e) {
      avisar(mensaje(e), 'error');
      return null;
    } finally {
      setOcupado(false);
    }
  }

  const datos = { companyId, audiencia: elegida.p, valor };

  async function revisar() {
    const r = await pedir(() => accion<Audiencia>('aviso.audiencia', datos));
    if (r) setAudiencia(r);
  }

  async function enviar() {
    const r = await pedir(() =>
      accion<{ queued: number; immediate: boolean }>('aviso.enviar', { ...datos, title: titulo, body: texto }),
    );
    if (!r) return;
    setAudiencia(null);
    if (r.queued === 0) {
      avisar('No salió a nadie nuevo: ya lo recibieron hace un momento o dejaron de cumplir el filtro.', 'error');
    } else if (r.immediate) {
      avisar(`Enviando a ${clientes(r.queued)}.`);
      sincronizarEnSegundoPlano(companyId);
    } else {
      avisar(`Programado para ${clientes(r.queued)}: saldrá a las 09:00.`);
    }
    props.alEnviar();
  }

  const conFaltan = (s: string) => s.split('{faltan}').join(audiencia?.ejemplo ?? `${valor} ${valor === 1 ? 'sello' : 'sellos'}`);
  const listo = titulo.trim() !== '' && texto.trim() !== '';

  return (
    <div className="card" style={{ marginBottom: 16, maxWidth: 640 }}>
      <h3 style={{ fontSize: 16 }}>Enviar un aviso ahora</h3>
      <p className="fz-def">Llega como notificación a quien activó los avisos. Fuera de horario sale a las 09:00. Máximo 4 por persona cada 30 días.</p>

      <div className="fz-fila" role="group" aria-label="A quién enviarlo" style={{ margin: '12px 0' }}>
        {OPCIONES.map((o) => (
          <button
            key={o.p}
            type="button"
            className={`btn btn-sm ${o.p === elegida.p ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={o.p === elegida.p}
            onClick={() => elegir(o)}
          >
            {o.nombre}
          </button>
        ))}
      </div>

      {elegida.p === 'inactivos' && (
        <div className="fz-campo">
          <label className="field-label" htmlFor="aviso-dias">Días sin venir (7–365)</label>
          <input id="aviso-dias" className="input" type="number" min={7} max={365} value={valor} onChange={(e) => { setValor(Number(e.target.value)); setAudiencia(null); }} />
        </div>
      )}
      {elegida.p === 'cerca' && (
        <div className="fz-campo">
          <label className="field-label" htmlFor="aviso-faltan">Les falta esta cantidad o menos</label>
          <input id="aviso-faltan" className="input" type="number" min={1} value={valor} onChange={(e) => { setValor(Number(e.target.value)); setAudiencia(null); }} />
          <small>{'{faltan}'} se cambia por lo que le falta a cada cliente: sellos, puntos o visitas, según tu programa.</small>
        </div>
      )}

      <div className="fz-campo">
        <label className="field-label" htmlFor="aviso-titulo">Título (máx. 60)</label>
        <input id="aviso-titulo" className="input" maxLength={60} placeholder="Ej.: Promo de esta semana" value={titulo} onChange={(e) => { setTitulo(e.target.value); setAudiencia(null); }} />
      </div>
      <div className="fz-campo">
        <label className="field-label" htmlFor="aviso-texto">Texto (máx. 160)</label>
        <textarea id="aviso-texto" className="textarea" maxLength={160} placeholder="Ej.: Este sábado, sellos dobles en todos los servicios." value={texto} onChange={(e) => { setTexto(e.target.value); setAudiencia(null); }} />
      </div>

      {listo && (
        <>
          <label className="field-label">Vista previa</label>
          <div className="card" style={{ boxShadow: 'none', border: '1.5px solid var(--line)', maxWidth: 360, padding: 12, marginBottom: 12 }}>
            <b style={{ fontSize: 14 }}>{conFaltan(titulo)}</b>
            <p style={{ fontSize: 13 }}>{conFaltan(texto)}</p>
          </div>
        </>
      )}

      {!audiencia ? (
        <button type="button" className="btn btn-primary btn-sm" disabled={!listo || ocupado || !props.push} onClick={() => void revisar()}>
          Revisar envío
        </button>
      ) : (
        <>
          <p style={{ fontSize: 14, marginBottom: 10 }} aria-live="polite">
            {audiencia.reachable > 0 ? (
              <>Llegará a <b>{clientes(audiencia.reachable)}</b>{audiencia.matching > audiencia.reachable ? ` de ${audiencia.matching} que cumplen el filtro; el resto no tiene avisos activos o ya llegó al tope.` : '.'}</>
            ) : (
              <>No llegaría a nadie: {audiencia.matching > 0 ? `${clientes(audiencia.matching)} cumplen el filtro, pero sin avisos activos o con el tope alcanzado.` : 'ningún cliente cumple el filtro.'}</>
            )}
          </p>
          <div className="fz-fila">
            {audiencia.reachable > 0 && (
              <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void enviar()}>
                <Send size={15} aria-hidden="true" /> Enviar a {clientes(audiencia.reachable)}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => setAudiencia(null)}>
              Cambiar
            </button>
          </div>
        </>
      )}
      {props.resumen && <p className="fz-def" style={{ marginTop: 12 }}>Últimos 30 días: {props.resumen}</p>}
    </div>
  );
}
