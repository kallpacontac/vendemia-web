'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI PÁGINA · el editor tipo Linktree
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lo mínimo para el dueño: elegir plantilla y color, poner su nombre, marcar
 * sus redes y añadir botones pidiendo solo el dato. Lo demás, plegado en
 * «Opciones avanzadas».
 *
 * La vista previa NO es una imitación: es el HTML de la página pública
 * (dominio/paginaPublica) dentro de un iframe, el mismo que sirve
 * fideliza.vendemias.com/n/<negocio>. Las miniaturas de plantillas, también.
 *
 * «Guardar y publicar» guarda datos, estilo y enlaces, y publica una versión
 * nueva: lo ven los clientes al momento y el historial queda.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, SinPermiso } from '@/modules/fideliza/ui/Estados';
import LinkPublico from '@/modules/fideliza/ui/LinkPublico';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, ErrorFideliza, lecturas, mensaje } from '@/modules/fideliza/cliente/api';
import { FIDELIZA_URL } from '@/modules/fideliza/dominio/config';
import {
  BOTONES,
  BOTON_TARJETA,
  REDES,
  aUrl,
  defDe,
  deUrl,
  slugDe,
  urlMapa,
  urlResenas,
  type TipoBoton,
} from '@/modules/fideliza/dominio/botones';
import { COLORES, PLANTILLAS, resolverEstilo, type Estilo, type Plantilla } from '@/modules/fideliza/dominio/estilo';
import { ICONOS } from '@/modules/fideliza/dominio/iconos';
import { htmlPagina, type DatosPagina } from '@/modules/fideliza/dominio/paginaPublica';

interface Boton {
  clave: string;
  tipo: TipoBoton;
  label: string;
  valor: string;
  visible: boolean;
  subtitulo: string;
  destacado: boolean;
}
type Redes = Record<string, { activa: boolean; valor: string }>;

const nuevaClave = () => Math.random().toString(36).slice(2);
/** Icono propio (SVG nuestro, sin texto de usuarios). */
const Icono = ({ tipo, tam = 18 }: { tipo: string; tam?: number }) => (
  <span className="fz-ico" style={{ width: tam, height: tam }} dangerouslySetInnerHTML={{ __html: ICONOS[tipo] ?? ICONOS.enlace }} />
);

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
  const [estilo, setEstilo] = useState<Estilo>({ plantilla: 'clasica' });
  const [redes, setRedes] = useState<Redes>({});
  const [botones, setBotones] = useState<Boton[]>([]);
  const [slugTocado, setSlugTocado] = useState(false);
  const [menu, setMenu] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [google, setGoogle] = useState<{ q: string; buscando: boolean; res: { id: string; nombre: string; direccion: string }[] | null; error: string | null }>({
    q: '',
    buscando: false,
    res: null,
    error: null,
  });

  useEffect(() => {
    if (!ajustes) return;
    setNegocio({ nombre: ajustes.display_name, slug: ajustes.slug, frase: ajustes.tagline, color: ajustes.bg_color, logo: ajustes.logo_url ?? '' });
    setEstilo({ plantilla: 'clasica', ...((ajustes.page_style ?? {}) as Partial<Estilo>) });
    setSlugTocado(true);
  }, [ajustes]);

  useEffect(() => {
    if (!datos) return;
    const r: Redes = {};
    const bs: Boton[] = [];
    for (const l of datos.enlaces) {
      const tipo = (l.icon as TipoBoton | undefined) ?? deUrl(l.url, l.kind).tipo;
      const valor = l.kind === 'join' ? '' : deUrl(l.url, l.kind).valor || l.url || '';
      if (l.placement === 'social') r[tipo] = { activa: l.is_active, valor };
      else
        bs.push({
          clave: l.id ?? nuevaClave(),
          tipo,
          label: l.label,
          valor,
          visible: l.is_active,
          subtitulo: l.subtitle ?? '',
          destacado: l.is_primary,
        });
    }
    setRedes(r);
    setBotones(bs);
  }, [datos]);

  // ── ¿Hay cambios sin publicar? ──
  const huella = JSON.stringify({ negocio, estilo, redes, botones: botones.map(({ clave: _c, ...b }) => b) });
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

  // ── La página tal cual la verá el cliente ──
  const datosPagina: DatosPagina = useMemo(
    () => ({
      nombre: negocio.nombre,
      bio: negocio.frase,
      logo: negocio.logo,
      color: negocio.color,
      estilo,
      redes: REDES.filter((d) => redes[d.tipo]?.activa).map((d) => ({ tipo: d.tipo, url: aUrl(d.tipo, redes[d.tipo].valor) || '#' })),
      botones: botones
        .filter((b) => b.visible)
        .map((b) => ({
          tipo: b.tipo,
          label: b.label || defDe(b.tipo).label,
          url: '#',
          subtitulo: b.subtitulo || undefined,
          destacado: b.destacado,
        })),
    }),
    [negocio, estilo, redes, botones],
  );
  const vista = useMemo(() => htmlPagina(datosPagina, { vista: true }), [datosPagina]);
  const miniaturas = useMemo(
    () => PLANTILLAS.map((p) => ({ ...p, html: htmlPagina({ ...datosPagina, estilo: { ...estilo, plantilla: p.id } }, { vista: true }) })),
    [datosPagina, estilo],
  );
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
    setBotones((bs) => [...bs, { clave: nuevaClave(), tipo, label: d.label, valor: '', visible: true, subtitulo: '', destacado: false }]);
    setMenu(false);
  };
  /** Pone (o actualiza) un botón de un tipo con un dato ya resuelto. */
  const ponerBoton = (tipo: TipoBoton, valor: string, subtitulo: string) =>
    setBotones((bs) => {
      const i = bs.findIndex((b) => b.tipo === tipo);
      if (i >= 0) return bs.map((b, j) => (j === i ? { ...b, valor, visible: true } : b));
      return [...bs, { clave: nuevaClave(), tipo, label: defDe(tipo).label, valor, visible: true, subtitulo, destacado: false }];
    });

  async function buscarEnGoogle() {
    if (google.q.trim().length < 3) return;
    setGoogle((g) => ({ ...g, buscando: true, error: null, res: null }));
    try {
      const res = await accion<{ id: string; nombre: string; direccion: string }[]>('lugar.buscar', { q: google.q.trim() });
      setGoogle((g) => ({ ...g, buscando: false, res }));
    } catch (e) {
      setGoogle((g) => ({ ...g, buscando: false, error: e instanceof ErrorFideliza ? e.message : mensaje(e) }));
    }
  }
  function elegirLugar(l: { id: string; nombre: string; direccion: string }) {
    setEstilo((e) => ({ ...e, place_id: l.id, place_nombre: l.nombre }));
    ponerBoton('resenas', urlResenas(l.id), 'En Google');
    ponerBoton('maps', urlMapa(l.id, l.nombre), l.direccion.split(',').slice(0, 2).join(','));
    setGoogle((g) => ({ ...g, res: null }));
    avisar('Listo: botones de reseñas y de «Cómo llegar» creados. Revisa la vista previa.');
  }

  async function publicar() {
    setAviso(null);
    if (!negocio.nombre.trim()) return setAviso('Escribe el nombre de tu negocio.');
    if (negocio.slug.length < 3) return setAviso('Tu link necesita al menos 3 letras (minúsculas, números y guiones).');
    const links = [];
    for (const d of REDES) {
      const r = redes[d.tipo];
      if (!r) continue;
      const url = aUrl(d.tipo, r.valor);
      if (r.activa && !url) return setAviso(`Escribe ${d.pide.toLowerCase()} de ${d.nombre}, o desmárcalo.`);
      if (url) links.push({ label: d.nombre, kind: 'url', url, is_active: r.activa, is_primary: false, icon: d.tipo, placement: 'social', subtitle: null, starts_at: null, ends_at: null });
    }
    for (const b of botones) {
      if (!b.label.trim()) return setAviso('Hay un botón sin texto.');
      const url = b.tipo === 'tarjeta' ? null : aUrl(b.tipo, b.valor);
      if (b.tipo !== 'tarjeta' && !url) return setAviso(`Completa «${defDe(b.tipo).pide}» del botón «${b.label}».`);
      links.push({
        label: b.label.trim(),
        kind: b.tipo === 'tarjeta' ? 'join' : 'url',
        url,
        is_active: b.visible,
        is_primary: b.destacado,
        icon: b.tipo,
        subtitle: b.subtitulo.trim() || null,
        placement: 'button',
        starts_at: null,
        ends_at: null,
      });
    }
    if (!links.some((l) => l.is_active) && !window.confirm('Tu página quedará vacía. ¿Publicar igualmente?')) return;

    setOcupado(true);
    try {
      const r = await accion<{ logo: { ok: boolean; errores: string[] } | null }>('ajustes.guardar', {
        companyId,
        datos: { display_name: negocio.nombre.trim(), slug: negocio.slug, tagline: negocio.frase.trim(), bg_color: negocio.color, logo_url: negocio.logo },
      });
      let sinEstilo = false;
      try {
        await accion('estilo.guardar', { companyId, estilo: { ...estilo, categoria: estilo.categoria?.trim() ?? '' } });
      } catch {
        sinEstilo = true; // sql/0008 sin aplicar: se publica igual, con la plantilla por defecto.
      }
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
      if (sinEstilo) setAviso('Publicado, pero la plantilla no se guardó: falta aplicar la migración 0008 en la base.');
      else if (r.logo && !r.logo.ok) setAviso(`Publicado, pero el logo no se puede usar: ${r.logo.errores.join(' ')}`);
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

  const e = resolverEstilo(estilo);

  return (
    <>
      {ajustes && (
        <LinkPublico slug={ajustes.slug} nombre={ajustes.display_name} programaActivo={Boolean(datos?.programaActivo)} hayEnlaces={botones.some((b) => b.visible)} />
      )}

      <div className="fz-editor">
        <div className="fz-editor__form">
          {/* ── 1 · Plantilla y color ── */}
          <section className="card">
            <h3 className="fz-sec">1 · Elige cómo se ve</h3>
            <div className="fz-plantillas" role="radiogroup" aria-label="Plantilla">
              {miniaturas.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={e.plantilla === m.id}
                  className={`fz-plantilla ${e.plantilla === m.id ? 'activa' : ''}`}
                  disabled={!editable}
                  onClick={() => setEstilo((s) => ({ ...s, plantilla: m.id as Plantilla }))}
                >
                  <span className="fz-plantilla__mini">
                    <iframe title={m.nombre} srcDoc={m.html} tabIndex={-1} sandbox="" />
                  </span>
                  <b>{m.nombre}</b>
                  <small>{m.describe}</small>
                </button>
              ))}
            </div>
            <label className="field-label" style={{ marginTop: 16 }}>
              Tu color
            </label>
            <div className="fz-paletas">
              {COLORES.map((c) => (
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
              <label className="fz-paletas__otro" title="Elegir otro color">
                <input type="color" value={negocio.color} disabled={!editable} onChange={(ev) => setNegocio({ ...negocio, color: ev.target.value.toUpperCase() })} />
                Otro
              </label>
            </div>
            <small className="fz-def">Se usa en botones destacados, el borde de tu foto y, en algunas plantillas, el fondo. También en tu tarjeta de Google Wallet.</small>
          </section>

          {/* ── 2 · Perfil ── */}
          <section className="card">
            <h3 className="fz-sec">2 · Tu perfil</h3>
            <div className="fz-col2">
              <div className="fz-campo">
                <label className="field-label" htmlFor="nombre">Nombre del negocio</label>
                <input
                  id="nombre"
                  className="input"
                  maxLength={60}
                  value={negocio.nombre}
                  disabled={!editable}
                  placeholder="Barbería El Centro"
                  onChange={(ev) => setNegocio((n) => ({ ...n, nombre: ev.target.value, slug: slugTocado ? n.slug : slugDe(ev.target.value) }))}
                />
              </div>
              <div className="fz-campo">
                <label className="field-label" htmlFor="categoria">Qué haces (opcional)</label>
                <input id="categoria" className="input" maxLength={60} value={estilo.categoria ?? ''} disabled={!editable} placeholder="Barbería · Miraflores" onChange={(ev) => setEstilo({ ...estilo, categoria: ev.target.value })} />
              </div>
            </div>
            <div className="fz-campo">
              <label className="field-label" htmlFor="frase">Frase (opcional)</label>
              <input id="frase" className="input" maxLength={120} value={negocio.frase} disabled={!editable} placeholder="Cortes clásicos y modernos desde 2015" onChange={(ev) => setNegocio({ ...negocio, frase: ev.target.value })} />
            </div>
            <div className="fz-campo">
              <label className="field-label" htmlFor="logo">Tu foto o logo (opcional)</label>
              <input id="logo" className="input" value={negocio.logo} disabled={!editable} placeholder="https://…/logo.png" onChange={(ev) => setNegocio({ ...negocio, logo: ev.target.value.trim() })} />
              <small>Dirección https de la imagen, mejor cuadrada. Sin foto, se muestra la inicial.</small>
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
                  onChange={(ev) => {
                    setSlugTocado(true);
                    setNegocio((n) => ({ ...n, slug: ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }));
                  }}
                />
              </div>
              {ajustes && negocio.slug !== ajustes.slug && <small>Ojo: si ya compartiste tu link, el anterior dejará de funcionar. Tus placas NO cambian.</small>}
            </div>
          </section>

          {/* ── 3 · Google ── */}
          <section className="card">
            <h3 className="fz-sec">3 · Tu negocio en Google</h3>
            <p className="fz-def" style={{ marginTop: -6, marginBottom: 10 }}>
              Búscalo y elígelo: creamos solos el botón para <b>dejar una reseña</b> y el de <b>cómo llegar</b>.
            </p>
            {estilo.place_nombre && (
              <p className="fz-panel-aviso fz-panel-aviso--ok" style={{ marginBottom: 10 }}>
                Vinculado a: <b>{estilo.place_nombre}</b>
              </p>
            )}
            <div className="fz-fila">
              <input
                className="input"
                style={{ flex: 1 }}
                value={google.q}
                disabled={!editable}
                placeholder="Nombre de tu negocio y distrito"
                onChange={(ev) => setGoogle({ ...google, q: ev.target.value })}
                onKeyDown={(ev) => ev.key === 'Enter' && void buscarEnGoogle()}
              />
              <button className="btn btn-ghost" disabled={!editable || google.buscando || google.q.trim().length < 3} onClick={() => void buscarEnGoogle()}>
                <Search size={15} /> {google.buscando ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            {google.error && <p className="fz-def" style={{ color: '#B4232A' }}>{google.error}</p>}
            {google.res && (
              <ul className="fz-lugares">
                {google.res.length === 0 && <li className="muted">No encontramos nada. Prueba con el nombre y el distrito.</li>}
                {google.res.map((l) => (
                  <li key={l.id}>
                    <span>
                      <b>{l.nombre}</b>
                      <small>{l.direccion}</small>
                    </span>
                    <button className="btn btn-primary btn-sm" onClick={() => elegirLugar(l)}>
                      Es este
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── 4 · Redes ── */}
          <section className="card">
            <h3 className="fz-sec">4 · Tus redes</h3>
            <p className="fz-def" style={{ marginTop: -6, marginBottom: 10 }}>Marca las que usas: salen como iconos con su logo.</p>
            <div className="fz-redes">
              {REDES.map((d) => {
                const r = redes[d.tipo];
                return (
                  <button
                    key={d.tipo}
                    type="button"
                    className={`fz-red ${r?.activa ? 'activa' : ''}`}
                    aria-pressed={Boolean(r?.activa)}
                    disabled={!editable}
                    onClick={() => setRedes((x) => ({ ...x, [d.tipo]: { valor: x[d.tipo]?.valor ?? '', activa: !x[d.tipo]?.activa } }))}
                  >
                    <Icono tipo={d.tipo} tam={20} />
                    <span>{d.nombre}</span>
                  </button>
                );
              })}
            </div>
            {REDES.filter((d) => redes[d.tipo]?.activa).map((d) => (
              <div key={d.tipo} className="fz-campo fz-red__dato">
                <label className="field-label">
                  <Icono tipo={d.tipo} tam={14} /> {d.nombre}: {d.pide.toLowerCase()}
                </label>
                <input
                  className="input"
                  value={redes[d.tipo].valor}
                  disabled={!editable}
                  placeholder={d.placeholder}
                  inputMode={d.tipo === 'whatsapp' ? 'tel' : 'text'}
                  onChange={(ev) => setRedes((x) => ({ ...x, [d.tipo]: { ...x[d.tipo], valor: ev.target.value } }))}
                />
              </div>
            ))}
          </section>

          {/* ── 5 · Botones ── */}
          <section className="card">
            <h3 className="fz-sec">5 · Tus botones</h3>
            {botones.length === 0 && <p className="muted" style={{ fontSize: 13.5, marginBottom: 10 }}>Todavía no hay botones. Empieza por WhatsApp para reservar o por tu negocio en Google.</p>}
            {botones.map((b, i) => {
              const d = defDe(b.tipo);
              const url = b.tipo === 'tarjeta' ? '' : aUrl(b.tipo, b.valor);
              return (
                <div key={b.clave} className={`fz-boton ${b.visible ? '' : 'oculto'}`}>
                  <div className="fz-fila" style={{ justifyContent: 'space-between' }}>
                    <span className="fz-fila" style={{ gap: 8 }}>
                      <Icono tipo={b.tipo} />
                      <b style={{ fontSize: 13 }}>{d.nombre}</b>
                      {b.destacado && <span className="badge-pill b-warm">Destacado</span>}
                    </span>
                    {editable && (
                      <span className="fz-fila" style={{ gap: 4 }}>
                        <button className="icon-btn" title={b.visible ? 'Ocultar' : 'Mostrar'} aria-label={b.visible ? 'Ocultar' : 'Mostrar'} onClick={() => cambiar(b.clave, { visible: !b.visible })}>
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
                      <input className="input" maxLength={40} value={b.label} disabled={!editable} onChange={(ev) => cambiar(b.clave, { label: ev.target.value })} />
                    </div>
                    {b.tipo !== 'tarjeta' && (
                      <div>
                        <label className="field-label">{d.pide}</label>
                        <input className="input" value={b.valor} disabled={!editable} placeholder={d.placeholder} inputMode={b.tipo === 'whatsapp' ? 'tel' : 'url'} onChange={(ev) => cambiar(b.clave, { valor: ev.target.value })} />
                      </div>
                    )}
                  </div>
                  {b.tipo === 'tarjeta' ? (
                    <small className="fz-def">Lleva al alta en tu tarjeta de puntos.</small>
                  ) : url ? (
                    <small className="fz-def">Abre: {url.length > 70 ? url.slice(0, 70) + '…' : url}</small>
                  ) : (
                    d.ayuda && <small className="fz-def">{d.ayuda}</small>
                  )}
                  <details className="fz-mas">
                    <summary>Más opciones</summary>
                    <div className="fz-col2" style={{ marginTop: 8 }}>
                      <div>
                        <label className="field-label">Línea pequeña (opcional)</label>
                        <input className="input" maxLength={60} value={b.subtitulo} disabled={!editable} placeholder="Ej.: Respuesta en minutos" onChange={(ev) => cambiar(b.clave, { subtitulo: ev.target.value })} />
                      </div>
                      <label className="check-inline" style={{ alignSelf: 'end', paddingBottom: 12 }}>
                        <input type="checkbox" checked={b.destacado} disabled={!editable} onChange={(ev) => cambiar(b.clave, { destacado: ev.target.checked })} /> <Star size={13} /> Destacarlo con tu color
                      </label>
                    </div>
                  </details>
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
                        <Icono tipo={d.tipo} /> {d.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Avanzado ── */}
          <details className="card fz-avanzado">
            <summary>Opciones avanzadas</summary>
            <p className="fz-def">Cada plantilla ya trae lo suyo. Cambia esto solo si quieres algo distinto.</p>
            <div className="fz-campo">
              <label className="field-label" htmlFor="fondo">Foto de portada o de fondo</label>
              <input id="fondo" className="input" value={estilo.fondo ?? ''} disabled={!editable} placeholder="https://…/foto.jpg" onChange={(ev) => setEstilo({ ...estilo, fondo: ev.target.value.trim() })} />
              <small>En «Clásica» y «Oscura» es la franja de arriba; en «Vidrio», «Foto de fondo» y «Marco», el fondo entero. Mejor horizontal y de buena calidad.</small>
            </div>
            <div className="fz-col2">
              <div className="fz-campo">
                <label className="field-label">Botones</label>
                <select className="select" value={estilo.botones ?? 'auto'} disabled={!editable} onChange={(ev) => setEstilo({ ...estilo, botones: ev.target.value as Estilo['botones'] })}>
                  <option value="auto">Como la plantilla</option>
                  <option value="relleno">Rellenos</option>
                  <option value="contorno">Solo contorno</option>
                  <option value="vidrio">Vidrio translúcido</option>
                </select>
              </div>
              <div className="fz-campo">
                <label className="field-label">Esquinas</label>
                <select className="select" value={estilo.forma ?? 'auto'} disabled={!editable} onChange={(ev) => setEstilo({ ...estilo, forma: ev.target.value as Estilo['forma'] })}>
                  <option value="auto">Como la plantilla</option>
                  <option value="pildora">Redondas (píldora)</option>
                  <option value="redondeado">Suaves</option>
                  <option value="recto">Rectas</option>
                </select>
              </div>
              <div className="fz-campo">
                <label className="field-label">Iconos de redes</label>
                <select className="select" value={estilo.redes ?? 'auto'} disabled={!editable} onChange={(ev) => setEstilo({ ...estilo, redes: ev.target.value as Estilo['redes'] })}>
                  <option value="auto">Como la plantilla</option>
                  <option value="arriba">Arriba, bajo el nombre</option>
                  <option value="abajo">Abajo, al final</option>
                </select>
              </div>
            </div>
          </details>
        </div>

        <aside className="fz-editor__vista" aria-label="Vista previa">
          <div className="fz-movil fz-movil--real">
            <iframe title="Vista previa de tu página" srcDoc={vista} sandbox="" />
          </div>
          <small className="fz-def" style={{ textAlign: 'center', display: 'block' }}>
            Así la verán tus clientes. Es tu página real: cambia mientras editas.
          </small>
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
