'use client';

/**
 * «Trae a un amigo» en Mi club › Tu tarjeta (sql/0028). Maqueta aprobada por Alvaro el 26-nov-2026
 * (https://claude.ai/artifact/9BeiJ5K8c5zzGZwqgnNhh5): «que sea práctico de configurar, sin
 * scrollear hasta abajo, y que se pueda minimizar o desplegar».
 *
 *   · 26-nov-2026 (Alvaro: «deja claro el tema de las promociones y los referidos»): vive en
 *     Promociones › «Para atraer clientes nuevos», como una fila más (`enLista`): nombre,
 *     interruptor, lo que gana y «Cambiar» que la despliega. Ya no está en Tu tarjeta.
 *   · Por cada N (1–5) amigos que vienen, un premio: algo del catálogo del negocio o escrito a mano.
 *   · El amigo nuevo: nada (de fábrica) o 1 sello de regalo.
 *   · Se guarda sola, aparte de «Guardar y publicar» (no cambia la regla de sellos).
 * Sin la 0028 no se enseña.
 */
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Minus, Pencil, Plus } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, mensaje } from '@/modules/fideliza/cliente/api';
import { getCatalogo } from '@/lib/supabase/queries';

interface Config {
  activo: boolean;
  cada: number;
  premio: string;
  catalogo_id: string | null;
  regalo: boolean;
}
interface Item {
  id: string;
  nombre: string;
}

const igual = (a: Config, b: Config) =>
  a.activo === b.activo && a.cada === b.cada && a.premio.trim() === b.premio.trim() && a.catalogo_id === b.catalogo_id && a.regalo === b.regalo;

export default function TraeUnAmigo({ companyId, editable, enLista = false }: { companyId: string; editable: boolean; enLista?: boolean }) {
  const avisar = useAvisar();
  const { datos, releer } = useCargar(async () => {
    try {
      return await accion<Config>('amigos.leer', { companyId });
    } catch {
      return null; // sin la 0028
    }
  }, [companyId]);
  const [catalogo, setCatalogo] = useState<Item[]>([]);
  const [b, setB] = useState<Config | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    getCatalogo(companyId)
      .then((xs) => {
        if (vivo) setCatalogo(xs.filter((x) => x.activo && x.name?.trim()).map((x) => ({ id: String(x.id), nombre: x.name.trim().slice(0, 80) })));
      })
      .catch(() => {}); // negocio solo de Fideliza: sin catálogo, solo «Otro premio»
    return () => {
      vivo = false;
    };
  }, [companyId]);

  useEffect(() => {
    if (datos) setB({ activo: datos.activo, cada: datos.cada || 2, premio: datos.premio ?? '', catalogo_id: datos.catalogo_id ?? null, regalo: Boolean(datos.regalo) });
  }, [datos]);

  if (!datos || !b) return null;
  /** El borrador ya comprobado, para el formulario (una función: TypeScript no arrastra el `!b`). */
  const borrador: Config = b;
  const guardado: Config = { activo: datos.activo, cada: datos.cada || 2, premio: datos.premio ?? '', catalogo_id: datos.catalogo_id ?? null, regalo: Boolean(datos.regalo) };
  const delCatalogo = b.catalogo_id !== null && catalogo.some((x) => x.id === b.catalogo_id);
  const tipo: 'cat' | 'otro' = b.catalogo_id !== null && catalogo.length > 0 ? 'cat' : 'otro';
  const premioListo = b.premio.trim().length >= 2;
  const cambios = !igual(b, guardado);
  const resumen = guardado.activo
    ? `Cada ${guardado.cada} ${guardado.cada === 1 ? 'amigo' : 'amigos'} → ${guardado.premio}`
    : 'Apagado. Tus clientes invitan y ganan un premio.';

  async function guardar(c: Config, ok: string) {
    if (c.activo && c.premio.trim().length < 2) {
      setAbierto(true);
      setB(c);
      return avisar('Elige el premio antes de prenderlo.', 'error');
    }
    setOcupado(true);
    try {
      await accion('amigos.guardar', { companyId, datos: { ...c, premio: c.premio.trim() } });
      avisar(ok, 'ok');
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  function elegirTipo(t: 'cat' | 'otro') {
    if (t === 'cat' && catalogo[0]) {
      const x = delCatalogo ? catalogo.find((i) => i.id === b!.catalogo_id)! : catalogo[0];
      setB({ ...b!, catalogo_id: x.id, premio: x.nombre });
    } else if (t === 'otro') {
      setB({ ...b!, catalogo_id: null, premio: tipo === 'cat' ? '' : b!.premio });
    }
  }

  const interruptor = (
    <button
      type="button"
      className={`toggle${guardado.activo ? ' on' : ''}`}
      role="switch"
      aria-checked={guardado.activo}
      aria-label="Trae a un amigo"
      disabled={!editable || ocupado}
      onClick={() => void guardar({ ...b, activo: !guardado.activo }, guardado.activo ? 'Apagado: Trae a un amigo.' : 'Prendido: Trae a un amigo.')}
    />
  );

  // En Promociones: una fila como las demás (nombre, interruptor, lo que gana y «Cambiar»).
  if (enLista) {
    return (
      <li className={`fz-avisos__fila${guardado.activo ? '' : ' fz-avisos__fila--off'}`}>
        <div className="fz-avisos__cab">
          <div>
            <b>Trae a un amigo</b>
            <small>Tu cliente invita por su WhatsApp. Cuenta cuando el amigo viene y le ponen su primer sello.</small>
          </div>
          {interruptor}
        </div>
        <div className="fz-avisos__msg">
          <b>Lo que gana</b>
          <span>{guardado.premio.trim() ? `Cada ${guardado.cada} ${guardado.cada === 1 ? 'amigo' : 'amigos'}: ${guardado.premio}` : 'Elige el premio y se prende.'}{guardado.regalo ? ' · El amigo empieza con 1 sello.' : ''}</span>
        </div>
        <div className="fz-avisos__pie">
          <button type="button" className="nc-link fz-avisos__editar" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
            <Pencil size={13} /> {abierto ? 'Cerrar' : 'Cambiar'}
          </button>
        </div>
        {abierto && cuerpo()}
      </li>
    );
  }

  return (
    <section className={`card fz-club__sec fz-amigo${abierto ? ' fz-amigo--abierto' : ''}`} aria-label="Trae a un amigo">
      <div className="fz-amigo__cab">
        <button type="button" className="fz-amigo__abrir" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
          <span>
            <b>Trae a un amigo</b>
            <small>{resumen}</small>
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        {interruptor}
      </div>
      {abierto && cuerpo()}
    </section>
  );

  function cuerpo() {
    const b = borrador;
    return (
        <div className="fz-amigo__cuerpo">
          <div className="fz-amigo__frase">
            Por cada
            <span className="fz-club__stepper">
              <button type="button" aria-label="Menos amigos" disabled={!editable || b.cada <= 1} onClick={() => setB({ ...b, cada: b.cada - 1 })}><Minus size={16} /></button>
              <b aria-live="polite">{b.cada}</b>
              <button type="button" aria-label="Más amigos" disabled={!editable || b.cada >= 5} onClick={() => setB({ ...b, cada: b.cada + 1 })}><Plus size={16} /></button>
            </span>
            {b.cada === 1 ? 'amigo que venga' : 'amigos que vengan'}, tu cliente gana:
          </div>

          <div className="fz-amigo__opciones" role="radiogroup" aria-label="Premio">
            {catalogo.length > 0 && (
              <label className={`fz-amigo__op${tipo === 'cat' ? ' fz-amigo__op--si' : ''}`}>
                <input type="radio" name="fz-amigo-tipo" checked={tipo === 'cat'} disabled={!editable} onChange={() => elegirTipo('cat')} />
                <span>
                  <b>Algo de tu catálogo</b>
                  <select
                    className="input"
                    aria-label="Elegir del catálogo"
                    disabled={!editable}
                    value={delCatalogo ? b.catalogo_id! : ''}
                    onFocus={() => tipo !== 'cat' && elegirTipo('cat')}
                    onChange={(e) => {
                      const x = catalogo.find((i) => i.id === e.target.value);
                      if (x) setB({ ...b, catalogo_id: x.id, premio: x.nombre });
                    }}
                  >
                    {!delCatalogo && <option value="">Elige…</option>}
                    {catalogo.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                </span>
              </label>
            )}
            <label className={`fz-amigo__op${tipo === 'otro' ? ' fz-amigo__op--si' : ''}`}>
              {catalogo.length > 0 && <input type="radio" name="fz-amigo-tipo" checked={tipo === 'otro'} disabled={!editable} onChange={() => elegirTipo('otro')} />}
              <span>
                <b>{catalogo.length > 0 ? 'Otro premio' : 'El premio'}</b>
                <input
                  className="input"
                  maxLength={80}
                  disabled={!editable}
                  placeholder="Ej.: Lavado de barba gratis"
                  value={tipo === 'otro' ? b.premio : ''}
                  onFocus={() => tipo !== 'otro' && elegirTipo('otro')}
                  onChange={(e) => setB({ ...b, catalogo_id: null, premio: e.target.value })}
                />
              </span>
            </label>
          </div>

          <div>
            <span className="field-label">¿El amigo nuevo también gana?</span>
            <div className="chip-tabs" role="group" aria-label="Regalo para el amigo nuevo">
              <button type="button" className={!b.regalo ? 'active' : ''} aria-pressed={!b.regalo} disabled={!editable} onClick={() => setB({ ...b, regalo: false })}>Nada</button>
              <button type="button" className={b.regalo ? 'active' : ''} aria-pressed={b.regalo} disabled={!editable} onClick={() => setB({ ...b, regalo: true })}>1 sello extra</button>
            </div>
          </div>

          <p className="fz-amigo__resumen">
            {premioListo
              ? <>Cada {b.cada} {b.cada === 1 ? 'amigo que venga' : 'amigos que vengan'}, tu cliente gana <b>{b.premio.trim()}</b>.{b.regalo ? ' El amigo nuevo empieza con 1 sello de regalo.' : ''}</>
              : 'Elige el premio.'}
          </p>

          <details className="fz-mas">
            <summary>Lo que Vendemia cuida por ti</summary>
            <ul className="fz-amigo__reglas">
              <li>El amigo cuenta en su <b>primera visita</b>, cuando le ponen su primer sello. Sacar la tarjeta no basta.</li>
              <li>No cuenta si tiene el mismo celular que quien lo invitó, ni si ya era tu cliente.</li>
              <li>Cada amigo cuenta una vez. Máximo 2 premios de este tipo por cliente al mes.</li>
              <li>El premio vence igual que los de sellos y se entrega en la Caja como siempre.</li>
            </ul>
          </details>

          {editable && cambios && (
            <button type="button" className="btn btn-primary" disabled={ocupado || (b.activo && !premioListo)} onClick={() => void guardar(b, 'Cambios guardados')}>
              <Check size={17} /> {ocupado ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
        </div>
    );
  }
}
