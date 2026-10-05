'use client';

/**
 * FIDELIZA · ENLACES — perfiles de enlaces que usan las placas.
 *
 * Se edita un BORRADOR; «Publicar» saca una foto atómica que es lo único que
 * ve el público. Lo que decide el comportamiento de la placa son los enlaces
 * publicados, activos y dentro de fechas: 0 → no disponible, 1 → redirección
 * directa, 2 o más → página con botones.
 */
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, Vacio } from '@/modules/fideliza/ui/Estados';
import LinkPublico from '@/modules/fideliza/ui/LinkPublico';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, ErrorFideliza, lecturas, mensaje, type Enlace } from '@/modules/fideliza/cliente/api';
import { urlNegocio } from '@/modules/fideliza/dominio/config';
import { fechaHora } from '@/modules/fideliza/dominio/formato';

const SUGERIDOS = ['Mi tarjeta y beneficios', 'Reservar por WhatsApp', 'Cómo llegar', 'Dejar una reseña'];

const vigente = (l: Enlace) =>
  l.is_active && (!l.starts_at || new Date(l.starts_at) <= new Date()) && (!l.ends_at || new Date(l.ends_at) > new Date());

const comportamiento = (n: number) =>
  n === 0 ? 'Sin enlaces: las placas muestran «no disponible».' : n === 1 ? 'Un enlace: la placa abre directamente ese destino (302).' : `${n} enlaces: la placa abre una página con los botones.`;

export default function Enlaces() {
  const { companyId, ajustes, puede, recargar: recargarCtx } = useFideliza();
  const avisar = useAvisar();
  const [elegido, setElegido] = useState<string | 'nuevo' | null>(null);
  const [borrador, setBorrador] = useState<{ name: string; title: string; tagline: string; links: Enlace[]; makeDefault: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [perfiles, enlaces, placas, programas] = await Promise.all([
      lecturas.perfiles(companyId),
      lecturas.enlaces(companyId),
      lecturas.placas(companyId),
      lecturas.programas(companyId),
    ]);
    const publicadas = await lecturas.publicadas(companyId, perfiles.map((p) => p.published_version_id).filter(Boolean) as string[]);
    return { perfiles, enlaces, placas, publicadas, programaActivo: programas.some((p) => p.status === 'active') };
  }, [companyId]);

  useEffect(() => {
    if (!datos || elegido) return;
    if (datos.perfiles[0]) setElegido(datos.perfiles[0].id);
  }, [datos, elegido]);

  useEffect(() => {
    if (!datos || !elegido) return;
    if (elegido === 'nuevo') {
      setBorrador({ name: 'Principal', title: '', tagline: '', links: [], makeDefault: !datos.perfiles.length });
      return;
    }
    const p = datos.perfiles.find((x) => x.id === elegido);
    if (p) {
      setBorrador({
        name: p.name,
        title: p.title,
        tagline: p.tagline,
        links: datos.enlaces.filter((l) => l.profile_id === p.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        makeDefault: ajustes?.default_profile_id === p.id,
      });
    }
  }, [elegido, datos, ajustes?.default_profile_id]);

  if (cargando && !datos) return <Cargando texto="Cargando enlaces…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!datos) return null;
  if (!ajustes)
    return <Vacio titulo="Primero completa los datos del negocio">Ve a Programa → paso 1. La página pública necesita una dirección.</Vacio>;
  const editable = puede('links.manage');
  const perfil = datos.perfiles.find((p) => p.id === elegido);
  const publicada = datos.publicadas.find((v) => v.id === perfil?.published_version_id);
  const placasDelPerfil = datos.placas.filter((d) => d.profile_id === perfil?.id && d.status === 'active');

  const cambiar = (i: number, cambio: Partial<Enlace>) =>
    setBorrador((b) => (b ? { ...b, links: b.links.map((l, j) => (j === i ? { ...l, ...cambio } : l)) } : b));
  const mover = (i: number, d: -1 | 1) =>
    setBorrador((b) => {
      if (!b) return b;
      const l = [...b.links];
      const j = i + d;
      if (j < 0 || j >= l.length) return b;
      [l[i], l[j]] = [l[j], l[i]];
      return { ...b, links: l };
    });

  async function guardar(): Promise<string | null> {
    if (!borrador) return null;
    for (const l of borrador.links) {
      if (l.kind === 'url' && !/^https:\/\/\S+$/.test(l.url ?? '')) {
        avisar(`«${l.label}»: el enlace tiene que empezar por https://`, 'error');
        return null;
      }
    }
    setOcupado(true);
    try {
      const id = await accion<string>('perfil.guardar', {
        companyId,
        profileId: elegido === 'nuevo' ? null : elegido,
        name: borrador.name,
        title: borrador.title,
        tagline: borrador.tagline,
        links: borrador.links.map(({ label, kind, url, is_active, is_primary, starts_at, ends_at }) => ({
          label,
          kind,
          url: kind === 'url' ? url : null,
          is_active,
          is_primary,
          starts_at,
          ends_at,
        })),
        makeDefault: borrador.makeDefault,
      });
      setElegido(id);
      releer();
      recargarCtx();
      return id;
    } catch (e) {
      avisar(mensaje(e), 'error');
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function publicar() {
    const id = await guardar();
    if (!id) return;
    const vigentes = borrador!.links.filter(vigente).length;
    const enUso = placasDelPerfil.length;
    if (vigentes === 0 && enUso && !window.confirm(`${enUso} placa(s) activa(s) usan este perfil y se quedarán sin destino. ¿Publicar igualmente?`)) return;
    setOcupado(true);
    try {
      const r = await accion<{ version: number; effective: number }>('perfil.publicar', { companyId, profileId: id, allowEmpty: vigentes === 0 });
      avisar(`Publicada la versión ${r.version}. ${comportamiento(r.effective)}`);
      releer();
    } catch (e) {
      avisar(e instanceof ErrorFideliza ? e.message : mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  const publicadaPrincipal = datos.publicadas.find(
    (v) => v.id === datos.perfiles.find((p) => p.id === ajustes.default_profile_id)?.published_version_id,
  );

  return (
    <>
      <LinkPublico
        slug={ajustes.slug}
        nombre={ajustes.display_name}
        programaActivo={datos.programaActivo}
        hayEnlaces={Boolean(publicadaPrincipal?.links.some(vigente))}
      />
      <div className="fz-panel-aviso fz-panel-aviso--info">
        <span>
          <b>Cómo funciona:</b> 1) añade tus botones abajo · 2) pulsa <b>Publicar</b> · 3) copia tu link de arriba y compártelo.
          Hasta que publiques, tus clientes no ven los cambios.
        </span>
      </div>
      <div className="toolbar">
        <select className="select" value={elegido ?? ''} onChange={(e) => setElegido(e.target.value)} aria-label="Perfil">
          {datos.perfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {ajustes.default_profile_id === p.id ? ' (página del negocio)' : ''}
            </option>
          ))}
          {elegido === 'nuevo' && <option value="nuevo">Nuevo perfil</option>}
        </select>
        {editable && (
          <button className="btn btn-ghost btn-sm" onClick={() => setElegido('nuevo')}>
            <Plus size={14} /> Nuevo perfil
          </button>
        )}
        <a className="btn btn-ghost btn-sm" href={urlNegocio(ajustes.slug)} target="_blank" rel="noopener noreferrer">
          Ver página pública <ExternalLink size={14} />
        </a>
      </div>

      {!datos.perfiles.length && elegido !== 'nuevo' && (
        <Vacio titulo="Todavía no hay enlaces">Crea un perfil: es lo que abre la placa al acercar el teléfono.</Vacio>
      )}

      {borrador && (
        <div className="fz-col2">
          <div className="card">
            <div className="fz-col2">
              <div className="fz-campo">
                <label className="field-label">Nombre interno</label>
                <input className="input" maxLength={60} value={borrador.name} disabled={!editable} onChange={(e) => setBorrador({ ...borrador, name: e.target.value })} placeholder="Caja, Recepción, Mesa…" />
              </div>
              <div className="fz-campo">
                <label className="field-label">Título visible</label>
                <input className="input" maxLength={60} value={borrador.title} disabled={!editable} onChange={(e) => setBorrador({ ...borrador, title: e.target.value })} placeholder={ajustes.display_name} />
              </div>
            </div>
            <div className="fz-campo">
              <label className="field-label">Frase</label>
              <input className="input" maxLength={120} value={borrador.tagline} disabled={!editable} onChange={(e) => setBorrador({ ...borrador, tagline: e.target.value })} />
            </div>
            <label className="check-inline" style={{ display: 'block', marginBottom: 12 }}>
              <input type="checkbox" checked={borrador.makeDefault} disabled={!editable} onChange={(e) => setBorrador({ ...borrador, makeDefault: e.target.checked })} /> Usarlo también como página del negocio ({urlNegocio(ajustes.slug)})
            </label>

            <ul className="fz-ayudas" style={{ marginBottom: 12 }}>
              <li><b>Nombre interno:</b> para reconocer este perfil tú (ej. «Caja», «Mesas»). El cliente no lo ve.</li>
              <li><b>Título visible y frase:</b> lo que sale arriba de la página. Vacío = el nombre de tu negocio.</li>
              <li><b>Página del negocio:</b> si lo marcas, este perfil es también el de tu link fideliza.vendemias.com/n/…</li>
              <li><b>Visible:</b> desmárcalo para esconder un botón sin borrarlo. <b>Destacado:</b> va primero y en tu color. <b>Hasta:</b> el botón desaparece solo después de esa fecha (para promociones).</li>
            </ul>
            <h3 style={{ fontSize: 15, margin: '6px 0 8px' }}>Enlaces (borrador)</h3>
            {borrador.links.map((l, i) => (
              <div key={i} className="card" style={{ boxShadow: 'none', border: '1.5px solid var(--line)', padding: 12, marginBottom: 10 }}>
                <div className="fz-fila">
                  <input className="input" style={{ flex: 1 }} maxLength={40} value={l.label} disabled={!editable} onChange={(e) => cambiar(i, { label: e.target.value })} aria-label="Texto del botón" />
                  <select className="select" style={{ width: 'auto' }} value={l.kind} disabled={!editable} onChange={(e) => cambiar(i, { kind: e.target.value as Enlace['kind'] })} aria-label="Tipo">
                    <option value="url">Enlace web</option>
                    <option value="join">Alta en la tarjeta</option>
                  </select>
                </div>
                {l.kind === 'url' && (
                  <input className="input" style={{ marginTop: 8 }} placeholder="https://…" value={l.url ?? ''} disabled={!editable} onChange={(e) => cambiar(i, { url: e.target.value.trim() })} aria-label="Dirección" />
                )}
                <div className="fz-fila" style={{ marginTop: 8, fontSize: 13 }}>
                  <label className="check-inline">
                    <input type="checkbox" checked={l.is_active} disabled={!editable} onChange={(e) => cambiar(i, { is_active: e.target.checked })} /> Visible
                  </label>
                  <label className="check-inline">
                    <input type="checkbox" checked={l.is_primary} disabled={!editable} onChange={(e) => cambiar(i, { is_primary: e.target.checked })} /> Destacado
                  </label>
                  <label className="check-inline">
                    Hasta{' '}
                    <input type="date" className="input" style={{ width: 'auto', padding: '6px 8px' }} value={l.ends_at?.slice(0, 10) ?? ''} disabled={!editable} onChange={(e) => cambiar(i, { ends_at: e.target.value ? `${e.target.value}T23:59:59-05:00` : null })} />
                  </label>
                  {editable && (
                    <span style={{ marginLeft: 'auto' }} className="fz-fila">
                      <button className="icon-btn" aria-label="Subir" onClick={() => mover(i, -1)}>
                        <ArrowUp size={14} />
                      </button>
                      <button className="icon-btn" aria-label="Bajar" onClick={() => mover(i, 1)}>
                        <ArrowDown size={14} />
                      </button>
                      <button className="icon-btn" aria-label="Quitar" onClick={() => setBorrador({ ...borrador, links: borrador.links.filter((_, j) => j !== i) })}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))}
            {editable && (
              <div className="fz-fila">
                {SUGERIDOS.map((s) => (
                  <button
                    key={s}
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setBorrador({
                        ...borrador,
                        links: [...borrador.links, { label: s, kind: s.startsWith('Mi tarjeta') ? 'join' : 'url', url: null, is_active: true, is_primary: false, starts_at: null, ends_at: null }],
                      })
                    }
                  >
                    <Plus size={13} /> {s}
                  </button>
                ))}
              </div>
            )}
            <p className="fz-def">Borrador: {comportamiento(borrador.links.filter(vigente).length)}</p>
            {editable && (
              <div className="fz-fila" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost" disabled={ocupado} onClick={() => void guardar().then((id) => id && avisar('Borrador guardado. Aún no lo ve nadie: publícalo.'))}>
                  Guardar borrador
                </button>
                <button className="btn btn-primary" disabled={ocupado} onClick={() => void publicar()}>
                  Publicar
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Lo que ve el público ahora</h3>
            {publicada ? (
              <>
                <p className="fz-def" style={{ marginTop: 0 }}>
                  Versión {publicada.version} · publicada {fechaHora(publicada.published_at)} · {placasDelPerfil.length} placa(s) activa(s)
                </p>
                <p style={{ fontWeight: 700, margin: '8px 0' }}>{comportamiento(publicada.links.filter(vigente).length)}</p>
                <ul className="fz-lista">
                  {publicada.links.map((l, i) => (
                    <li key={i} style={{ opacity: vigente(l) ? 1 : 0.5 }}>
                      <span>
                        {l.is_primary ? '★ ' : ''}
                        {l.label}
                      </span>
                      <span className="muted" style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {l.kind === 'join' ? 'Alta en la tarjeta' : l.url}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">Nada publicado todavía.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
