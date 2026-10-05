'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI PÁGINA · el editor tipo Linktree
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una sola pantalla: datos, diseño y botones a la izquierda, el móvil con la
 * vista previa a la derecha. Un solo botón, «Guardar y publicar»: lo que se
 * guarda lo ven los clientes al momento.
 *
 * Por debajo es lo mismo de siempre — ajustes del negocio, el perfil de
 * enlaces por defecto y una versión publicada nueva en cada guardado —, así
 * que el historial sigue ahí y las placas que usan este perfil cambian solas.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, SinPermiso } from '@/modules/fideliza/ui/Estados';
import LinkPublico from '@/modules/fideliza/ui/LinkPublico';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje } from '@/modules/fideliza/cliente/api';
import { FIDELIZA_URL } from '@/modules/fideliza/dominio/config';
import { BOTONES, BOTON_TARJETA, PALETAS, aUrl, defDe, deUrl, slugDe, type TipoBoton } from '@/modules/fideliza/dominio/botones';

interface Boton {
  clave: string;
  tipo: TipoBoton;
  label: string;
  valor: string;
  visible: boolean;
}

const nuevaClave = () => Math.random().toString(36).slice(2);

/** Color de texto legible sobre el color de marca (mismo criterio que la página pública). */
function tintaSobre(hex: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return '#1A0A00';
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.055 ? '#FFFFFF' : '#1A0A00';
}

export default function MiPagina() {
  const { companyId, ajustes, puede, recargar: recargarCtx, modo } = useFideliza();
  const avisar = useAvisar();
  const editable = puede('links.manage') && puede('program.edit');

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [perfiles, enlaces, programas] = await Promise.all([
      lecturas.perfiles(companyId),
      lecturas.enlaces(companyId),
      lecturas.programas(companyId),
    ]);
    const perfil = perfiles.find((p) => p.id === ajustes?.default_profile_id) ?? perfiles[0] ?? null;
    return {
      perfil,
      enlaces: enlaces.filter((l) => l.profile_id === perfil?.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      programaActivo: programas.some((p) => p.status === 'active'),
    };
  }, [companyId, ajustes?.default_profile_id]);

  const [negocio, setNegocio] = useState({ nombre: '', slug: '', frase: '', color: '#FF4900', logo: '' });
  const [slugTocado, setSlugTocado] = useState(false);
  const [botones, setBotones] = useState<Boton[]>([]);
  const [menu, setMenu] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!ajustes) return;
    setNegocio({
      nombre: ajustes.display_name,
      slug: ajustes.slug,
      frase: ajustes.tagline,
      color: ajustes.bg_color,
      logo: ajustes.logo_url ?? '',
    });
    setSlugTocado(true);
  }, [ajustes]);

  useEffect(() => {
    if (!datos) return;
    setBotones(
      datos.enlaces.map((l) => {
        const { tipo, valor } = deUrl(l.url, l.kind);
        return { clave: l.id ?? nuevaClave(), tipo, label: l.label, valor, visible: l.is_active };
      }),
    );
  }, [datos]);

  // ── ¿Hay cambios sin publicar? (foto al cargar y tras cada publicación) ──
  const huella = JSON.stringify({ negocio, botones: botones.map(({ clave: _c, ...b }) => b) });
  const [base, setBase] = useState<string | null>(null);
  const [tomarBase, setTomarBase] = useState(false);
  useEffect(() => {
    if (datos) setTomarBase(true);
  }, [datos, ajustes]);
  useEffect(() => {
    if (!tomarBase) return;
    setBase(huella);
    setTomarBase(false);
  }, [tomarBase, huella]);
  const sucio = editable && base !== null && huella !== base;
  useEffect(() => {
    if (!sucio) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [sucio]);

  const disponibles = useMemo(
    () => [...(modo === 'fidelizacion' && datos?.programaActivo ? [BOTON_TARJETA] : []), ...BOTONES],
    [modo, datos?.programaActivo],
  );

  if (!puede('program.read')) return <SinPermiso que="tu página" />;
  if (cargando && !datos) return <Cargando texto="Cargando tu página…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;

  const cambiar = (clave: string, c: Partial<Boton>) => setBotones((bs) => bs.map((b) => (b.clave === clave ? { ...b, ...c } : b)));
  const mover = (i: number, d: -1 | 1) =>
    setBotones((bs) => {
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const c = [...bs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const anadir = (tipo: TipoBoton) => {
    const d = defDe(tipo);
    setBotones((bs) => [...bs, { clave: nuevaClave(), tipo, label: d.label, valor: '', visible: true }]);
    setMenu(false);
  };

  async function publicar() {
    setAviso(null);
    if (!negocio.nombre.trim()) return setAviso('Escribe el nombre de tu negocio.');
    if (negocio.slug.length < 3) return setAviso('Tu link necesita al menos 3 letras (minúsculas, números y guiones).');
    const links = [];
    for (const b of botones) {
      if (!b.label.trim()) return setAviso('Hay un botón sin texto.');
      const url = b.tipo === 'tarjeta' ? null : aUrl(b.tipo, b.valor);
      if (b.tipo !== 'tarjeta' && !url) return setAviso(`Completa «${defDe(b.tipo).pide}» del botón «${b.label}».`);
      links.push({ label: b.label.trim(), kind: b.tipo === 'tarjeta' ? 'join' : 'url', url, is_active: b.visible, is_primary: false, starts_at: null, ends_at: null });
    }
    if (!links.some((l) => l.is_active) && !window.confirm('Tu página quedará sin botones visibles. ¿Publicar igualmente?')) return;

    setOcupado(true);
    try {
      const r = await accion<{ logo: { ok: boolean; errores: string[] } | null }>('ajustes.guardar', {
        companyId,
        datos: { display_name: negocio.nombre.trim(), slug: negocio.slug, tagline: negocio.frase.trim(), bg_color: negocio.color, logo_url: negocio.logo },
      });
      const perfilId = await accion<string>('perfil.guardar', {
        companyId,
        profileId: datos?.perfil?.id ?? null,
        name: datos?.perfil?.name ?? 'Principal',
        title: '',
        tagline: '',
        links,
        makeDefault: true,
      });
      await accion('perfil.publicar', { companyId, profileId: perfilId, allowEmpty: true });
      avisar('¡Publicado! Tus clientes ya ven los cambios.');
      if (r.logo && !r.logo.ok) setAviso(`Publicado, pero el logo no se puede usar: ${r.logo.errores.join(' ')}`);
      recargarCtx();
      releer();
      setTomarBase(true);
    } catch (e) {
      avisar(mensaje(e), 'error');
      setAviso(mensaje(e));
    } finally {
      setOcupado(false);
    }
  }

  const tinta = tintaSobre(negocio.color);
  const visibles = botones.filter((b) => b.visible);

  return (
    <>
      {ajustes && (
        <LinkPublico slug={ajustes.slug} nombre={ajustes.display_name} programaActivo={Boolean(datos?.programaActivo)} hayEnlaces={botones.some((b) => b.visible)} />
      )}

      <div className="fz-editor">
        <div className="fz-editor__form">
          <section className="card">
            <h3 className="fz-sec">1 · Tu negocio</h3>
            <div className="fz-campo">
              <label className="field-label" htmlFor="nombre">Nombre</label>
              <input
                id="nombre"
                className="input"
                maxLength={60}
                value={negocio.nombre}
                disabled={!editable}
                placeholder="Barbería El Centro"
                onChange={(e) =>
                  setNegocio((n) => ({ ...n, nombre: e.target.value, slug: slugTocado ? n.slug : slugDe(e.target.value) }))
                }
              />
            </div>
            <div className="fz-campo">
              <label className="field-label" htmlFor="slug">Tu link</label>
              <div className="fz-slug">
                <span>{FIDELIZA_URL.replace(/^https?:\/\//, '')}/n/</span>
                <input
                  id="slug"
                  className="input"
                  maxLength={40}
                  value={negocio.slug}
                  disabled={!editable}
                  placeholder="tu-negocio"
                  onChange={(e) => {
                    setSlugTocado(true);
                    setNegocio((n) => ({ ...n, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }));
                  }}
                />
              </div>
              {ajustes && negocio.slug !== ajustes.slug && (
                <small>Ojo: si ya compartiste tu link, el anterior dejará de funcionar. Tus placas NO cambian.</small>
              )}
            </div>
            <div className="fz-campo">
              <label className="field-label" htmlFor="frase">Frase corta (opcional)</label>
              <input id="frase" className="input" maxLength={120} value={negocio.frase} disabled={!editable} placeholder="Cortes clásicos y modernos en Miraflores" onChange={(e) => setNegocio({ ...negocio, frase: e.target.value })} />
            </div>
          </section>

          <section className="card">
            <h3 className="fz-sec">2 · Diseño</h3>
            <label className="field-label">Color</label>
            <div className="fz-paletas">
              {PALETAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  className={negocio.color.toUpperCase() === c ? 'activa' : ''}
                  style={{ background: c }}
                  disabled={!editable}
                  onClick={() => setNegocio({ ...negocio, color: c })}
                />
              ))}
              <label className="fz-paletas__otro">
                Otro
                <input type="color" value={negocio.color} disabled={!editable} onChange={(e) => setNegocio({ ...negocio, color: e.target.value.toUpperCase() })} />
              </label>
            </div>
            <div className="fz-campo" style={{ marginTop: 14 }}>
              <label className="field-label" htmlFor="logo">Logo (opcional)</label>
              <input id="logo" className="input" value={negocio.logo} disabled={!editable} placeholder="https://…/logo.png" onChange={(e) => setNegocio({ ...negocio, logo: e.target.value.trim() })} />
              <small>Dirección https de tu logo, mejor cuadrado (PNG). Puedes copiarla de tu foto de perfil de Instagram o Facebook.</small>
            </div>
          </section>

          <section className="card">
            <h3 className="fz-sec">3 · Tus botones</h3>
            {botones.length === 0 && <p className="muted" style={{ fontSize: 13.5, marginBottom: 10 }}>Todavía no hay botones. Empieza por WhatsApp y tus reseñas de Google.</p>}
            {botones.map((b, i) => {
              const d = defDe(b.tipo);
              const url = b.tipo === 'tarjeta' ? '' : aUrl(b.tipo, b.valor);
              return (
                <div key={b.clave} className={`fz-boton ${b.visible ? '' : 'oculto'}`}>
                  <div className="fz-fila" style={{ justifyContent: 'space-between' }}>
                    <span className="badge-pill b-mute">{d.nombre}</span>
                    {editable && (
                      <span className="fz-fila" style={{ gap: 4 }}>
                        <button className="icon-btn" aria-label={b.visible ? 'Ocultar' : 'Mostrar'} title={b.visible ? 'Ocultar' : 'Mostrar'} onClick={() => cambiar(b.clave, { visible: !b.visible })}>
                          {b.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                        <button className="icon-btn" aria-label="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>
                          <ArrowUp size={15} />
                        </button>
                        <button className="icon-btn" aria-label="Bajar" onClick={() => mover(i, 1)} disabled={i === botones.length - 1}>
                          <ArrowDown size={15} />
                        </button>
                        <button className="icon-btn" aria-label="Quitar" onClick={() => setBotones((bs) => bs.filter((x) => x.clave !== b.clave))}>
                          <Trash2 size={15} />
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="fz-col2" style={{ marginTop: 8 }}>
                    <div>
                      <label className="field-label">Texto del botón</label>
                      <input className="input" maxLength={40} value={b.label} disabled={!editable} onChange={(e) => cambiar(b.clave, { label: e.target.value })} />
                    </div>
                    {b.tipo !== 'tarjeta' && (
                      <div>
                        <label className="field-label">{d.pide}</label>
                        <input
                          className="input"
                          value={b.valor}
                          disabled={!editable}
                          placeholder={d.placeholder}
                          inputMode={b.tipo === 'whatsapp' ? 'tel' : 'url'}
                          onChange={(e) => cambiar(b.clave, { valor: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                  {b.tipo === 'tarjeta' ? (
                    <small className="fz-def">Lleva al alta en tu tarjeta de puntos.</small>
                  ) : url ? (
                    <small className="fz-def">Abre: {url}</small>
                  ) : (
                    d.ayuda && <small className="fz-def">{d.ayuda}</small>
                  )}
                </div>
              );
            })}
            {editable && (
              <div style={{ position: 'relative' }}>
                <button className="btn btn-ghost" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                  <Plus size={16} /> Añadir botón
                </button>
                {menu && (
                  <div className="fz-menu-botones">
                    {disponibles.map((d) => (
                      <button key={d.tipo} type="button" onClick={() => anadir(d.tipo)}>
                        {d.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="fz-editor__vista" aria-label="Vista previa">
          <div className="fz-movil">
            <div className="fz-movil__cab" style={{ background: negocio.color, color: tinta }}>
              {negocio.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={negocio.logo} alt="" />
              ) : (
                <span className="fz-movil__logo">{(negocio.nombre || '?').slice(0, 1).toUpperCase()}</span>
              )}
              <b>{negocio.nombre || 'Tu negocio'}</b>
              {negocio.frase && <small>{negocio.frase}</small>}
            </div>
            <div className="fz-movil__botones">
              {visibles.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>Aquí aparecerán tus botones</p>
              ) : (
                visibles.map((b) => <span key={b.clave}>{b.label || defDe(b.tipo).label}</span>)
              )}
            </div>
          </div>
          <small className="fz-def" style={{ textAlign: 'center', display: 'block' }}>Así la verán tus clientes en el móvil</small>
        </aside>
      </div>

      {editable && (
        <div className="fz-barra-publicar">
          <span className={sucio ? 'fz-guardado fz-guardado--pendiente' : 'fz-guardado fz-guardado--ok'} role="status">
            {ocupado ? 'Publicando…' : sucio ? '● Cambios sin publicar' : base !== null && ajustes ? '✓ Publicado' : ''}
          </span>
          {aviso && <span className="fz-barra-publicar__aviso" role="alert">{aviso}</span>}
          <button className="btn btn-primary" disabled={ocupado || (!sucio && Boolean(ajustes))} onClick={() => void publicar()}>
            {ocupado ? 'Publicando…' : 'Guardar y publicar'}
          </button>
        </div>
      )}
    </>
  );
}
