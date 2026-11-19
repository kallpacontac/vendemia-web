'use client';

/**
 * FIDELIZA · MIS AVISOS — los avisos propios del dueño, guardados con su regla (19-nov-2026, The 24/7:
 * «si quiero uno en específico, que lo configure y establezca las reglas; si lo quiere enviar
 * ahora, que lo mande»).
 *
 * Una lista de avisos guardados (sql/0022) con «Enviar ahora / Editar / Borrar», y «+ Crear aviso».
 * La ventana: a quién (todos / hace N días que no vienen / les faltan N o menos), nombre, título,
 * texto, cómo le llega y a cuántos llegaría (calculado solo). «Guardar» lo deja en la lista;
 * «Enviar ahora» lo guarda y lo manda, previa confirmación. Si se envió hace menos de 7 días,
 * se avisa antes de repetirlo. Enviar usa loyalty_aviso_enviar (0014) con sus topes.
 */
import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { accion, mensaje, sincronizarEnSegundoPlano } from '@/modules/fideliza/cliente/api';

type Publico = 'todos' | 'inactivos' | 'cerca';
interface Guardado {
  id: string;
  nombre: string;
  audiencia: Publico;
  valor: number;
  titulo: string;
  texto: string;
  ultimo_envio: string | null;
  ultimo_alcance: number;
  envios: number;
}
interface Audiencia {
  matching: number;
  reachable: number;
  ejemplo: string;
}

const OPCIONES: { p: Publico; nombre: string; valor: number }[] = [
  { p: 'todos', nombre: 'A todos', valor: 1 },
  { p: 'inactivos', nombre: 'Hace tiempo no vienen', valor: 30 },
  { p: 'cerca', nombre: 'Les falta poco', valor: 2 },
];
const NUEVO: Omit<Guardado, 'id' | 'ultimo_envio' | 'ultimo_alcance' | 'envios'> = { nombre: '', audiencia: 'todos', valor: 1, titulo: '', texto: '' };
const DIAS_ENTRE_ENVIOS = 7;

const clientes = (n: number) => `${n} ${n === 1 ? 'cliente' : 'clientes'}`;
const regla = (a: Publico, v: number) =>
  a === 'todos' ? 'A todos' : a === 'inactivos' ? `No vienen hace ${v} días o más` : `Les faltan ${v} o menos para su premio`;
const haceDias = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);
const cuandoFue = (iso: string | null) => {
  const d = haceDias(iso);
  return d === null ? 'Nunca enviado' : d === 0 ? 'Enviado hoy' : d === 1 ? 'Enviado ayer' : `Enviado hace ${d} días`;
};

async function leerGuardados(companyId: string): Promise<Guardado[] | null> {
  const { data, error } = await supabase().rpc('loyalty_avisos_guardados_leer', { p_company: companyId });
  return error ? null : ((data ?? []) as Guardado[]);
}

export default function MisAvisos({ companyId, push, resumen, alEnviar }: { companyId: string; push: boolean; resumen: string | null; alEnviar: () => void }) {
  const avisar = useAvisar();
  const [ronda, setRonda] = useState(0);
  const { datos: guardados } = useCargar(() => leerGuardados(companyId), [companyId, ronda]);
  const [editando, setEditando] = useState<(typeof NUEVO & { id?: string; ultimo_envio?: string | null }) | null>(null);
  const sinTabla = guardados === null;

  async function borrar(g: Guardado) {
    if (!window.confirm(`¿Borrar el aviso «${g.nombre}»? No afecta a lo ya enviado.`)) return;
    const { error } = await supabase().rpc('loyalty_aviso_guardado_borrar', { p_company: companyId, p_id: g.id });
    if (error) avisar(error.message, 'error');
    else {
      avisar('Aviso borrado.', 'ok');
      setRonda((r) => r + 1);
    }
  }

  return (
    <section className="mis-avisos" aria-label="Mis avisos">
      <div className="mis-avisos__cab">
        <div>
          <h3>Mis avisos</h3>
          <p className="fz-def">Los tuyos: escribe el mensaje, elige a quién, guárdalo y envíalo cuando quieras.</p>
        </div>
        <button type="button" className="btn btn-primary mis-avisos__crear" onClick={() => setEditando({ ...NUEVO })}>
          <Plus size={17} /> Crear aviso
        </button>
      </div>

      {sinTabla ? (
        <p className="fz-def">Para guardar tus avisos falta instalar modules/fideliza/sql/0022_mis_avisos.sql. Mientras tanto puedes crearlos y enviarlos al momento.</p>
      ) : guardados && guardados.length === 0 ? (
        <p className="fz-def">Todavía no tienes avisos guardados. Toca «Crear aviso»: por ejemplo «Promo 2×1 los miércoles».</p>
      ) : (
        <div className="mis-avisos__lista">
          {(guardados ?? []).map((g) => (
            <div key={g.id} className="card mis-aviso">
              <div className="mis-aviso__info">
                <b>{g.nombre}</b>
                <small className="mis-aviso__regla">{regla(g.audiencia, g.valor)}</small>
                <div className="fz-campana__guardado">
                  <b>{g.titulo}</b>
                  <span>{g.texto}</span>
                </div>
                <small className="muted">
                  {cuandoFue(g.ultimo_envio)}
                  {g.ultimo_envio ? ` a ${clientes(g.ultimo_alcance)}` : ''}
                  {g.envios > 1 ? ` · ${g.envios} veces en total` : ''}
                </small>
              </div>
              <div className="mis-aviso__acciones">
                <button type="button" className="btn btn-primary" onClick={() => setEditando({ ...g })}>
                  <Send size={16} /> Enviar ahora
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditando({ ...g })}>
                  <Pencil size={16} /> Editar
                </button>
                <button type="button" className="q-icon" aria-label={`Borrar ${g.nombre}`} onClick={() => void borrar(g)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {resumen && <p className="fz-def">Avisos sueltos, últimos 30 días: {resumen}</p>}

      {editando && (
        <EditorAviso
          companyId={companyId}
          push={push}
          inicial={editando}
          puedeGuardar={!sinTabla}
          alCerrar={() => setEditando(null)}
          alCambiar={() => setRonda((r) => r + 1)}
          alEnviar={alEnviar}
        />
      )}
    </section>
  );
}

function EditorAviso({
  companyId, push, inicial, puedeGuardar, alCerrar, alCambiar, alEnviar,
}: {
  companyId: string;
  push: boolean;
  inicial: typeof NUEVO & { id?: string; ultimo_envio?: string | null };
  puedeGuardar: boolean;
  alCerrar: () => void;
  alCambiar: () => void;
  alEnviar: () => void;
}) {
  const avisar = useAvisar();
  const [b, setB] = useState(inicial);
  const [id, setId] = useState(inicial.id);
  const [audiencia, setAudiencia] = useState<Audiencia | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const listo = b.titulo.trim() !== '' && b.texto.trim() !== '';
  const reciente = haceDias(inicial.ultimo_envio ?? null);
  const repiteMuyPronto = reciente !== null && reciente < DIAS_ENTRE_ENVIOS;

  // A cuántos llegaría: se calcula solo al abrir y al cambiar la regla.
  useEffect(() => {
    let vivo = true;
    setAudiencia(null);
    const t = window.setTimeout(() => {
      accion<Audiencia>('aviso.audiencia', { companyId, audiencia: b.audiencia, valor: b.valor })
        .then((r) => vivo && setAudiencia(r))
        .catch(() => undefined);
    }, 300);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [companyId, b.audiencia, b.valor]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !ocupado && alCerrar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [alCerrar, ocupado]);

  async function guardar(): Promise<string | undefined> {
    const { data, error } = await supabase().rpc('loyalty_aviso_guardado_guardar', {
      p_company: companyId,
      p_datos: { id: id ?? '', nombre: b.nombre, audiencia: b.audiencia, valor: b.valor, titulo: b.titulo, texto: b.texto },
    });
    if (error) throw new Error(error.message);
    const nuevoId = (data as { id: string }).id;
    setId(nuevoId);
    alCambiar();
    return nuevoId;
  }

  async function soloGuardar() {
    if (!listo || ocupado) return;
    setOcupado(true);
    try {
      await guardar();
      avisar(`✓ Aviso «${b.nombre.trim() || b.titulo.trim()}» guardado. Está en «Mis avisos» para enviarlo cuando quieras.`, 'ok');
      alCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function enviarAhora() {
    if (!listo || ocupado || !audiencia || audiencia.reachable <= 0) return;
    const ojo = repiteMuyPronto ? `\n\nOjo: este aviso ya salió hace ${reciente === 0 ? 'unas horas' : `${reciente} día(s)`}. Repetirlo tan seguido cansa y hace que desactiven los avisos.` : '';
    if (!window.confirm(`¿Enviar «${b.titulo.trim()}» a ${clientes(audiencia.reachable)} ahora? No se puede deshacer.${ojo}`)) return;
    setOcupado(true);
    try {
      // Guardado primero (si se puede): así queda en la lista con su último envío.
      let guardadoId: string | undefined = id;
      if (puedeGuardar) guardadoId = await guardar().catch(() => id);
      const r = await accion<{ queued: number; immediate: boolean }>('aviso.enviar', {
        companyId, audiencia: b.audiencia, valor: b.valor, title: b.titulo, body: b.texto,
      });
      if (r.queued === 0) {
        avisar('No salió a nadie nuevo: ya lo recibieron hace un momento, llegaron a su tope o dejaron de cumplir la regla.', 'error');
      } else {
        if (guardadoId) await supabase().rpc('loyalty_aviso_guardado_enviado', { p_company: companyId, p_id: guardadoId, p_alcance: r.queued });
        if (r.immediate) {
          avisar(`✓ Aviso enviado a ${clientes(r.queued)}.`, 'ok');
          sincronizarEnSegundoPlano(companyId);
        } else {
          avisar(`✓ Aviso programado para ${clientes(r.queued)}: saldrá a las 09:00.`, 'ok');
        }
        alCambiar();
        alEnviar();
        alCerrar();
      }
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  const conFaltan = (s: string) => s.split('{faltan}').join(audiencia?.ejemplo ?? `${b.valor} ${b.valor === 1 ? 'sello' : 'sellos'}`);

  return (
    <div className="modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) alCerrar(); }}>
      <div className="modal fz-modal" role="dialog" aria-modal="true" aria-labelledby="aviso-titulo-modal">
        <div className="fz-modal__cab">
          <h3 id="aviso-titulo-modal">{id ? 'Tu aviso' : 'Crear aviso'}</h3>
          <button type="button" className="q-icon" aria-label="Cerrar" onClick={alCerrar} disabled={ocupado}><X size={18} /></button>
        </div>
        <div className="fz-modal__cuerpo">
          <label className="field-label">¿A quién?</label>
          <div className="fz-fila aviso-quien" role="group" aria-label="A quién enviarlo">
            {OPCIONES.map((o) => (
              <button key={o.p} type="button" className={`btn ${o.p === b.audiencia ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={o.p === b.audiencia}
                onClick={() => setB({ ...b, audiencia: o.p, valor: o.p === b.audiencia ? b.valor : o.valor })}>
                {o.nombre}
              </button>
            ))}
          </div>
          {b.audiencia === 'inactivos' && (
            <div className="fz-campo">
              <label className="field-label" htmlFor="ma-dias">Que no vienen hace (días, 7–365)</label>
              <input id="ma-dias" className="input" type="number" inputMode="numeric" min={7} max={365} value={b.valor} onChange={(e) => setB({ ...b, valor: Number(e.target.value) })} />
            </div>
          )}
          {b.audiencia === 'cerca' && (
            <div className="fz-campo">
              <label className="field-label" htmlFor="ma-faltan">Les falta esta cantidad o menos para su premio</label>
              <input id="ma-faltan" className="input" type="number" inputMode="numeric" min={1} value={b.valor} onChange={(e) => setB({ ...b, valor: Number(e.target.value) })} />
              <small className="muted">Escribe {'{faltan}'} en el texto y a cada uno le llega lo que le falta.</small>
            </div>
          )}
          <div className="fz-campo">
            <label className="field-label" htmlFor="ma-nombre">Nombre para encontrarlo <span className="muted">(opcional, solo lo ves tú)</span></label>
            <input id="ma-nombre" className="input" maxLength={60} placeholder="Ej.: Promo miércoles" value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} />
          </div>
          <div className="fz-campo">
            <label className="field-label" htmlFor="ma-titulo">Título (máx. 60)</label>
            <input id="ma-titulo" className="input" maxLength={60} placeholder="Ej.: 2×1 solo este miércoles" value={b.titulo} onChange={(e) => setB({ ...b, titulo: e.target.value })} />
          </div>
          <div className="fz-campo">
            <label className="field-label" htmlFor="ma-texto">Texto (máx. 160)</label>
            <textarea id="ma-texto" className="textarea" maxLength={160} placeholder="Ej.: Ven con un amigo y el segundo corte es gratis." value={b.texto} onChange={(e) => setB({ ...b, texto: e.target.value })} />
          </div>
          <label className="field-label">Así le llega al cliente</label>
          <div className="fz-modal__vista">
            <b>{conFaltan(b.titulo) || 'Título'}</b>
            <span>{conFaltan(b.texto) || 'Texto del aviso'}</span>
          </div>
          <p className="fz-modal__alcance" aria-live="polite">
            {!push ? 'Los avisos push no están configurados en el servidor: se puede guardar, pero no se enviará.'
              : audiencia === null ? 'Calculando a cuántos llegaría…'
                : audiencia.reachable > 0
                  ? <>Llegaría a <b>{clientes(audiencia.reachable)}</b>{audiencia.matching > audiencia.reachable ? ` de ${audiencia.matching} que cumplen la regla (el resto no activó avisos o ya llegó a su tope).` : '.'}</>
                  : <>No llegaría a nadie: {audiencia.matching > 0 ? `${clientes(audiencia.matching)} cumplen la regla, pero sin avisos activos o con el tope alcanzado.` : 'ningún cliente cumple la regla hoy.'}</>}
          </p>
          {repiteMuyPronto && (
            <p className="mis-aviso__ojo">Este aviso salió {reciente === 0 ? 'hoy' : `hace ${reciente} día(s)`}. Espera al menos {DIAS_ENTRE_ENVIOS} días para repetirlo: si no, cansa.</p>
          )}
        </div>
        <div className="fz-modal__pie">
          <button className="btn btn-primary" disabled={!listo || ocupado || !push || !audiencia || audiencia.reachable <= 0} onClick={() => void enviarAhora()}>
            <Send size={17} /> {ocupado ? 'Un momento…' : !listo ? 'Escribe el título y el texto' : audiencia && audiencia.reachable > 0 ? `Enviar ahora a ${clientes(audiencia.reachable)}` : 'Enviar ahora'}
          </button>
          {puedeGuardar && (
            <button className="btn btn-ghost" disabled={!listo || ocupado} onClick={() => void soloGuardar()}>
              <Check size={17} /> {id ? 'Guardar cambios' : 'Guardar para después'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
