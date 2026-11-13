'use client';

/**
 * FIDELIZA · PROGRAMA · Líneas de la tarjeta (0017, 13-nov-2026, para Kallpa).
 *
 * Una tarjeta, varias líneas con sus propias reglas. Kallpa: la principal es
 * «Asistencia» (niveles del mes, se edita en los pasos de arriba) y «Compra» es
 * una línea: 1 sello por compra, 12 → un kekito o un batido. En la caja y en
 * Clientes sale un botón por línea; el cliente sigue con un solo QR.
 *
 * Aquí se crean y se cambian las líneas SENCILLAS (sellos por compra o visitas,
 * meta y premio). Cada cambio publica una versión nueva de esa línea: lo que ya
 * llevaba cada cliente no se recalcula.
 */
import { useState } from 'react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje, sincronizarEnSegundoPlano, type Programa, type Version } from '@/modules/fideliza/cliente/api';

interface Forma {
  id: string | null;
  label: string;
  tipo: 'stamps' | 'visits';
  meta: string;
  premio: string;
  dias: string;
}

const VACIA: Forma = { id: null, label: '', tipo: 'stamps', meta: '12', premio: '', dias: '' };

export default function LineasDelClub({ companyId, principal, editable }: { companyId: string; principal: Programa; editable: boolean }) {
  const avisar = useAvisar();
  const [forma, setForma] = useState<Forma | null>(null);
  const [nombrePrincipal, setNombrePrincipal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** El nombre corto de la principal tal como quedó guardado (arranca con el del programa). */
  const [etiqueta, setEtiqueta] = useState(principal.line_label ?? null);

  const { datos, releer } = useCargar(async () => {
    const lineas = await lecturas.lineas(companyId);
    const versiones = await Promise.all(
      lineas.map(async (l) => (l.current_version_id ? (await lecturas.versiones(companyId, l.id)).find((v) => v.id === l.current_version_id) ?? null : null)),
    );
    return lineas.map((l, i) => ({ l, v: versiones[i] as Version | null }));
  }, [companyId, principal.id]);

  const lineas = datos ?? [];
  const etiquetaPrincipal = etiqueta || principal.name;

  async function guardarPrincipal() {
    if (nombrePrincipal === null) return;
    setOcupado(true);
    try {
      await accion('programa.linea', { companyId, programId: principal.id, parentId: null, label: nombrePrincipal.trim() || null });
      avisar('Nombre guardado.', 'ok');
      setNombrePrincipal(null);
      setEtiqueta(nombrePrincipal.trim() || null);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function guardar() {
    if (!forma) return;
    const meta = Number(forma.meta);
    const dias = forma.dias.trim() ? Number(forma.dias) : null;
    if (!forma.label.trim()) return avisar('Ponle nombre a la línea (ej. «Compra»).', 'error');
    if (!Number.isInteger(meta) || meta < 1 || meta > 1000) return avisar('La meta tiene que ser un número entre 1 y 1000.', 'error');
    if (!forma.premio.trim()) return avisar('Escribe el premio (ej. «Un kekito o un batido»).', 'error');
    if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 3650)) return avisar('Los días para usar el premio van de 1 a 3650.', 'error');
    setOcupado(true);
    try {
      const draft = {
        rule_type: forma.tipo,
        stamps_per_purchase: 1,
        reward_threshold: meta,
        reward_description: forma.premio.trim(),
        reward_valid_days: dias,
      };
      const nombre = `${principal.name} · ${forma.label.trim()}`.slice(0, 40);
      const id = await accion<string>('programa.guardar', {
        companyId,
        programId: forma.id,
        name: nombre,
        description: '',
        objective: 'repeat',
        draft,
      });
      // Nueva: primero se cuelga de la principal (si no, chocaría con ella al publicar).
      await accion('programa.linea', { companyId, programId: id, parentId: principal.id, label: forma.label.trim() });
      await accion('programa.publicar', { companyId, programId: id });
      avisar(forma.id ? 'Línea actualizada: cuenta desde ahora.' : `Línea «${forma.label.trim()}» creada: ya sale en la caja y en Clientes.`, 'ok');
      setForma(null);
      releer();
      sincronizarEnSegundoPlano(companyId);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function estado(p: Programa, status: 'active' | 'paused') {
    setOcupado(true);
    try {
      await accion('programa.estado', { companyId, programId: p.id, status });
      avisar(status === 'paused' ? 'Línea pausada: no suma; sus premios se pueden canjear.' : 'Línea activa.', 'ok');
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  if (!lineas.length && !editable) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <b>Líneas de la tarjeta</b>
      <p className="fz-def" style={{ marginTop: 4 }}>
        {lineas.length
          ? 'Una sola tarjeta y un solo QR por cliente; en la caja y en Clientes sale un botón por línea. Cada línea tiene sus reglas.'
          : '¿Quieres premiar dos cosas distintas con la misma tarjeta? Ej.: asistencia al gimnasio y compras en la cafetería. Añade una línea con sus propias reglas.'}
      </p>

      <ul className="fz-lista" style={{ marginTop: 8 }}>
        <li>
          {nombrePrincipal !== null ? (
            <span className="fz-fila" style={{ flex: 1, gap: 6 }}>
              <input className="input" maxLength={24} value={nombrePrincipal} onChange={(e) => setNombrePrincipal(e.target.value)} placeholder="Asistencia" aria-label="Nombre de la línea principal" style={{ maxWidth: 200 }} />
              <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void guardarPrincipal()}>
                Guardar
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setNombrePrincipal(null)}>
                Cancelar
              </button>
            </span>
          ) : (
            <>
              <span>
                <b>{etiquetaPrincipal}</b> <span className="muted">· principal (sus reglas, en los pasos de abajo)</span>
              </span>
              {editable && (
                <button className="btn btn-ghost btn-sm" onClick={() => setNombrePrincipal(etiqueta ?? '')}>
                  Renombrar
                </button>
              )}
            </>
          )}
        </li>
        {lineas.map(({ l, v }) => (
          <li key={l.id}>
            <span>
              <b>{l.line_label ?? l.name}</b>
              {l.status === 'paused' && <span className="badge-pill b-hot" style={{ marginLeft: 6 }}>Pausada</span>}
              <span className="muted">
                {' '}
                · {v ? `${v.rule_type === 'visits' ? '1 por visita' : `${v.stamps_per_purchase} por compra`} · con ${v.reward_threshold}: ${v.reward_description}` : 'sin publicar'}
              </span>
            </span>
            {editable && (
              <span className="fz-fila" style={{ gap: 6 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={ocupado}
                  onClick={() =>
                    setForma({
                      id: l.id,
                      label: l.line_label ?? '',
                      tipo: v?.rule_type === 'visits' ? 'visits' : 'stamps',
                      meta: String(v?.reward_threshold ?? 12),
                      premio: v?.reward_description ?? '',
                      dias: v?.reward_valid_days ? String(v.reward_valid_days) : '',
                    })
                  }
                >
                  Cambiar
                </button>
                {l.status === 'active' && (
                  <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => void estado(l, 'paused')}>
                    Pausar
                  </button>
                )}
                {l.status === 'paused' && (
                  <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => void estado(l, 'active')}>
                    Reactivar
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      {editable && !forma && lineas.length < 3 && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setForma({ ...VACIA })}>
          Añadir línea
        </button>
      )}

      {forma && (
        <div className="fz-col2" style={{ marginTop: 12 }}>
          <div className="fz-campo">
            <label className="field-label">Nombre en la caja</label>
            <input className="input" maxLength={24} value={forma.label} onChange={(e) => setForma({ ...forma, label: e.target.value })} placeholder="Compra" />
            <small>Sale en el botón: «+ {forma.label.trim() || 'Compra'}».</small>
          </div>
          <div className="fz-campo">
            <label className="field-label">Qué suma</label>
            <select className="select" value={forma.tipo} disabled={!!forma.id} onChange={(e) => setForma({ ...forma, tipo: e.target.value as Forma['tipo'] })}>
              <option value="stamps">1 sello por compra</option>
              <option value="visits">1 por visita</option>
            </select>
            {forma.id && <small>No se cambia en una línea publicada: los saldos dejarían de significar lo mismo.</small>}
          </div>
          <div className="fz-campo">
            <label className="field-label">Meta</label>
            <input className="input" inputMode="numeric" value={forma.meta} onChange={(e) => setForma({ ...forma, meta: e.target.value.replace(/\D/g, '') })} />
            <small>Al llegar, gana el premio y vuelve a empezar.</small>
          </div>
          <div className="fz-campo">
            <label className="field-label">Premio</label>
            <input className="input" maxLength={80} value={forma.premio} onChange={(e) => setForma({ ...forma, premio: e.target.value })} placeholder="Un kekito o un batido" />
          </div>
          <div className="fz-campo">
            <label className="field-label">Días para usar el premio (opcional)</label>
            <input className="input" inputMode="numeric" value={forma.dias} onChange={(e) => setForma({ ...forma, dias: e.target.value.replace(/\D/g, '') })} placeholder="Sin vencimiento" />
          </div>
          <div className="fz-fila" style={{ alignItems: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void guardar()}>
              {forma.id ? 'Publicar cambio' : 'Crear línea'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setForma(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
