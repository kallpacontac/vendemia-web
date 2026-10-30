'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FIDELIZA · TU CLUB EN UNA PANTALLA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lo que de verdad hace falta para tener tarjeta de sellos, de una vez y con
 * la tarjeta del cliente cambiando al lado: nombre, logo, color, diseño,
 * icono del sello, cuántos sellos y el premio → «Guardar y publicar».
 *
 * Lo demás (puntos por gasto, compra mínima, sucursales, vencimiento,
 * boleta…) sigue en el asistente completo: «Opciones avanzadas».
 *
 * Por dentro usa las mismas acciones que el asistente (ajustes.guardar,
 * estilo.guardar, programa.guardar, programa.publicar): no hay otra lógica.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ImagePlus, Minus, Plus, Settings2, Trash2 } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, SinPermiso } from '@/modules/fideliza/ui/Estados';
import VistaTarjeta from '@/modules/fideliza/ui/VistaTarjeta';
import { useValidacion, type Errores } from '@/modules/fideliza/ui/Validacion';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, ErrorFideliza, lecturas, mensaje, sincronizarEnSegundoPlano, type Version } from '@/modules/fideliza/cliente/api';
import { subirImagenMarca } from '@/modules/fideliza/cliente/imagenMarca';
import { slugDe } from '@/modules/fideliza/dominio/botones';
import { COLORES, PLANTILLAS_TARJETA, colorValido, tarjetaValida, type Estilo, type PlantillaTarjeta } from '@/modules/fideliza/dominio/estilo';
import { RUBROS, SELLOS, sellosDe, selloValido, sugerirRubro, type Rubro, type Sello } from '@/modules/fideliza/dominio/sellos';
import { datosArteWallet, svgArteWallet } from '@/modules/fideliza/dominio/wallet-arte';

interface Club {
  negocio: string;
  nombre: string;
  logo: string;
  color: string;
  tarjeta: PlantillaTarjeta;
  sello: Sello;
  sellos: number;
  premio: string;
}

export default function CrearClub() {
  const { companyId, ajustes, puede, recargar: recargarCtx } = useFideliza();
  const avisar = useAvisar();
  const [c, setC] = useState<Club>({ negocio: '', nombre: '', logo: '', color: '#FF4900', tarjeta: 'viva', sello: 'check', sellos: 8, premio: '' });
  const [rubroVisto, setRubroVisto] = useState<Rubro | null>(null);
  const [vista, setVista] = useState<'web' | 'wallet'>('web');
  const [ocupado, setOcupado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [publicado, setPublicado] = useState(false);
  const [slugOcupado, setSlugOcupado] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const listo = useRef(false);

  const { datos, cargando, error } = useCargar(async () => {
    if (!companyId) return null;
    const programas = await lecturas.programas(companyId);
    const programa = programas.find((p) => p.status !== 'draft') ?? programas[0] ?? null;
    const versiones = programa ? await lecturas.versiones(companyId, programa.id) : [];
    return { programa, version: (versiones[0] ?? null) as Version | null };
  }, [companyId]);

  // Se rellena una vez con lo que ya haya (negocio, marca, programa).
  useEffect(() => {
    if (listo.current || cargando || !datos) return;
    listo.current = true;
    const estilo = (ajustes?.page_style ?? null) as Partial<Estilo> | null;
    const p = datos.programa;
    const regla = { ...(datos.version ?? {}), ...(p?.draft ?? {}) } as Partial<Version>;
    const negocio = ajustes?.display_name ?? '';
    setC({
      negocio,
      nombre: p?.name ?? (negocio ? `Club ${negocio}`.slice(0, 40) : ''),
      logo: ajustes?.logo_url ?? '',
      color: colorValido(ajustes?.bg_color),
      tarjeta: tarjetaValida(estilo?.tarjeta),
      sello: selloValido(estilo?.sello),
      sellos: regla.reward_threshold && regla.reward_threshold > 0 ? Math.min(20, regla.reward_threshold) : 8,
      premio: regla.reward_description ?? '',
    });
  }, [datos, cargando, ajustes]);

  const programa = datos?.programa ?? null;
  const reglaActual = programa?.draft?.rule_type ?? datos?.version?.rule_type ?? null;
  const otroTipo = Boolean(reglaActual && reglaActual !== 'stamps');

  const errores: Errores = {};
  if (!ajustes && c.negocio.trim().length < 2) errores.negocio = 'Escribe el nombre de tu negocio.';
  if (!c.nombre.trim()) errores.nombre = 'Ponle nombre a tu club (ej. «Club Panadería Sol»).';
  if (!c.premio.trim()) errores.premio = 'Escribe la recompensa (ej. «Una concha gratis»).';
  if (slugOcupado && slugDe(c.negocio) === slugOcupado) errores.negocio = 'Ya hay un negocio con ese nombre. Añade tu distrito (ej. «Panadería Sol Miraflores»).';
  const v = useValidacion(errores);

  if (!puede('program.read')) return <SinPermiso que="el programa" />;
  if (cargando && !datos) return <Cargando texto="Preparando tu club…" />;
  if (error) return <Fallo texto={error} />;
  const editable = puede('program.edit');

  if (otroTipo) {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <b>Tu programa es de {reglaActual === 'points' ? 'puntos por gasto' : 'visitas'}</b>
        <p className="fz-def">Esta pantalla es para tarjetas de sellos. Edítalo en el asistente completo.</p>
        <Link className="btn btn-primary" href="/panel/fideliza/programa">Abrir el asistente</Link>
      </div>
    );
  }

  const estilo = { ...((ajustes?.page_style ?? {}) as Partial<Estilo>), sello: c.sello, tarjeta: c.tarjeta };
  const rubroSugerido = sugerirRubro(c.negocio || ajustes?.display_name, ajustes?.tagline, (ajustes?.page_style as Partial<Estilo> | null)?.categoria);
  const rubroActivo: Rubro = rubroVisto ?? (c.sello !== 'check' ? SELLOS.find((x) => x.id === c.sello)!.rubro : rubroSugerido ?? 'general');
  const arte = (t: PlantillaTarjeta, llenos = Math.min(3, c.sellos - 1)) =>
    `data:image/svg+xml,${encodeURIComponent(svgArteWallet(datosArteWallet(c.color, { ...estilo, tarjeta: t }, 'stamps', c.sellos, llenos)))}`;

  async function subirLogo(file: File) {
    if (!companyId) return;
    setSubiendo(true);
    try {
      const url = await subirImagenMarca(file, companyId);
      setC((x) => ({ ...x, logo: url }));
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = '';
    }
  }

  async function publicar() {
    if (!v.comprobar()) return avisar('Faltan datos: revisa lo marcado en rojo.', 'error');
    setOcupado(true);
    try {
      // 1 · El negocio y su marca.
      const r = await accion<{ logo: { ok: boolean; errores: string[] } | null }>('ajustes.guardar', {
        companyId,
        datos: { ...(ajustes ? {} : { display_name: c.negocio.trim(), slug: slugDe(c.negocio) }), bg_color: c.color, logo_url: c.logo },
      });
      // 2 · Diseño de la tarjeta e icono (page_style se guarda entero: se conserva lo de «Mi página»).
      await accion('estilo.guardar', { companyId, estilo: { plantilla: 'clasica', ...((ajustes?.page_style ?? {}) as Partial<Estilo>), sello: c.sello, tarjeta: c.tarjeta } });
      // 3 · La regla: lo que ya hubiera (compra mínima, sucursales…) se conserva; cambian sellos y premio.
      const base = { ...(datos?.version ?? {}), ...(programa?.draft ?? {}) } as Record<string, unknown>;
      const claves = ['rule_type', 'stamps_per_purchase', 'points_per_unit', 'unit_cents', 'rounding', 'min_purchase_cents', 'reward_threshold', 'reward_description', 'reward_valid_days', 'valid_to', 'location_ids'];
      const draft = {
        ...Object.fromEntries(Object.entries(base).filter(([k]) => claves.includes(k))),
        rule_type: 'stamps',
        stamps_per_purchase: (base.stamps_per_purchase as number) || 1,
        min_purchase_cents: (base.min_purchase_cents as number) ?? 0,
        reward_threshold: c.sellos,
        reward_description: c.premio.trim(),
      };
      const id = await accion<string>('programa.guardar', {
        companyId,
        programId: programa?.id ?? null,
        name: c.nombre.trim(),
        description: programa?.short_description ?? '',
        objective: programa?.objective ?? 'repeat',
        draft,
      });
      // 4 · Publicar: desde ahora la gente puede crear su tarjeta.
      await accion('programa.publicar', { companyId, programId: id ?? programa?.id });
      sincronizarEnSegundoPlano(companyId!);
      recargarCtx();
      setPublicado(true);
      avisar(r.logo && !r.logo.ok ? `Club publicado. El logo no sirve para Google Wallet: ${r.logo.errores.join(' ')}` : '¡Tu club está publicado!', r.logo && !r.logo.ok ? 'espera' : 'ok');
    } catch (e) {
      if (e instanceof ErrorFideliza && e.codigo === 'slug_taken') {
        setSlugOcupado(slugDe(c.negocio));
        v.comprobar();
      }
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  if (publicado) {
    return (
      <div className="card fz-club-listo">
        <h2>¡Tu club está publicado!</h2>
        <p>Tus clientes ya pueden crear su tarjeta desde tu QR, tu placa o tu link.</p>
        <div className="fz-fila" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" href="/panel/fideliza#invitar">Invitar a tus clientes</Link>
          <Link className="btn btn-ghost" href="/panel/fideliza/caja">Ir a la caja</Link>
          <button className="btn btn-ghost" onClick={() => setPublicado(false)}>Seguir editando</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fz-editor fz-club">
      <div className="fz-club__form">
        <div className="fz-club__cab">
          <div>
            <h2>{programa ? 'Tu club' : 'Crea tu club'}</h2>
            <p className="fz-def">Así lo verán tus clientes. Todo cambia aquí al momento, antes de guardar.</p>
          </div>
          <Link className="btn btn-ghost btn-sm" href="/panel/fideliza/programa"><Settings2 size={15} /> Opciones avanzadas</Link>
        </div>

        {!ajustes && (
          <section className="card fz-club__sec">
            <label className="field-label" htmlFor="fz-c-negocio">Tu negocio</label>
            <input {...v.campo('negocio')} className="input" maxLength={60} value={c.negocio} disabled={!editable} placeholder="Panadería Sol"
              onChange={(e) => setC({ ...c, negocio: e.target.value, nombre: c.nombre && c.nombre !== `Club ${c.negocio}`.slice(0, 40) ? c.nombre : `Club ${e.target.value}`.slice(0, 40) })} />
            {v.error('negocio')}
          </section>
        )}

        <section className="card fz-club__sec">
          <small className="fz-club__paso">Club · Nombre</small>
          <input {...v.campo('nombre')} className="input fz-input-gran" maxLength={40} value={c.nombre} disabled={!editable} placeholder="Club Panadería Sol" onChange={(e) => setC({ ...c, nombre: e.target.value })} aria-label="Nombre del club" />
          {v.error('nombre')}
        </section>

        <section className="card fz-club__sec">
          <small className="fz-club__paso">Tarjeta · Logotipo</small>
          <div className="fz-club__logo">
            <span className="fz-club__logo-vista" style={{ background: c.logo ? '#fff' : c.color }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.logo ? <img src={c.logo} alt="" /> : (c.negocio || ajustes?.display_name || '?').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <button type="button" className="btn btn-ghost btn-sm" disabled={!editable || subiendo} onClick={() => archivo.current?.click()}>
                <ImagePlus size={15} /> {subiendo ? 'Subiendo…' : c.logo ? 'Cambiar logo' : 'Subir tu logo'}
              </button>
              {c.logo && editable && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setC({ ...c, logo: '' })}><Trash2 size={14} /> Quitar</button>}
              <small className="fz-def" style={{ display: 'block' }}>PNG o JPG cuadrado. Google Wallet lo recorta en círculo.</small>
            </div>
            <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirLogo(f); }} />
          </div>
        </section>

        <section className="card fz-club__sec">
          <small className="fz-club__paso">Tarjeta · Color principal</small>
          <div className="fz-paletas">
            {COLORES.map((col) => (
              <button key={col} type="button" className={c.color.toUpperCase() === col ? 'activa' : ''} style={{ background: col }} aria-label={`Color ${col}`} aria-pressed={c.color.toUpperCase() === col} disabled={!editable} onClick={() => setC({ ...c, color: col })} />
            ))}
            <label className="fz-paletas__otro" title="Elegir otro color">
              <input type="color" value={c.color} disabled={!editable} onChange={(e) => setC({ ...c, color: e.target.value.toUpperCase() })} aria-label="Otro color" /> Otro
            </label>
            <span className="fz-mono" style={{ alignSelf: 'center', fontSize: 12 }}>{c.color.toUpperCase()}</span>
          </div>
        </section>

        <section className="card fz-club__sec">
          <small className="fz-club__paso">Tarjeta · Diseño</small>
          <div className="fz-club__disenos">
            {PLANTILLAS_TARJETA.map((t) => (
              <button key={t.id} type="button" className="fz-club__diseno" aria-pressed={c.tarjeta === t.id} disabled={!editable} onClick={() => setC({ ...c, tarjeta: t.id })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={arte(t.id)} />
                <b>{t.nombre}</b>
                <small>{t.describe}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="card fz-club__sec">
          <small className="fz-club__paso">Tarjeta · El sello</small>
          <div className="fz-rubros" role="tablist" aria-label="Tipo de negocio">
            {RUBROS.map((r) => (
              <button key={r.id} type="button" role="tab" className="fz-rubro" aria-selected={rubroActivo === r.id} onClick={() => setRubroVisto(r.id)}>
                {r.nombre}{r.id === rubroSugerido && <small> · sugerido</small>}
              </button>
            ))}
          </div>
          <div className="fz-sellos" role="group" aria-label="Icono del sello">
            {sellosDe(rubroActivo).map((s) => (
              <button key={s.id} type="button" className="fz-sello" aria-pressed={c.sello === s.id} disabled={!editable} onClick={() => setC({ ...c, sello: s.id })}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: s.trazo }} />
                {s.nombre}
              </button>
            ))}
          </div>
        </section>

        <section className="card fz-club__sec">
          <small className="fz-club__paso">Club · Metas y recompensas</small>
          <div className="fz-club__meta">
            <div>
              <label className="field-label">Sellos</label>
              <div className="fz-club__stepper">
                <button type="button" aria-label="Menos sellos" disabled={!editable || c.sellos <= 2} onClick={() => setC({ ...c, sellos: c.sellos - 1 })}><Minus size={16} /></button>
                <b aria-live="polite">{c.sellos}</b>
                <button type="button" aria-label="Más sellos" disabled={!editable || c.sellos >= 20} onClick={() => setC({ ...c, sellos: c.sellos + 1 })}><Plus size={16} /></button>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label" htmlFor="fz-c-premio">Recompensa</label>
              <input {...v.campo('premio')} className="input" maxLength={80} value={c.premio} disabled={!editable} placeholder="Una concha gratis" onChange={(e) => setC({ ...c, premio: e.target.value })} />
              {v.error('premio')}
            </div>
          </div>
          <small className="fz-def">Un sello por compra. Con {c.sellos} sellos, {c.premio.trim() || 'el premio'}. {c.sellos > 12 ? 'Con más de 12, la tarjeta muestra una barra en vez de casillas.' : ''}</small>
        </section>

        {editable && (
          <div className="fz-club__acciones">
            {v.resumen('Antes de publicar, revisa:')}
            <button className="btn btn-primary fz-club__publicar" disabled={ocupado} onClick={() => void publicar()}>
              {ocupado ? 'Publicando…' : programa?.current_version_id ? 'Guardar y publicar cambios' : 'Guardar y publicar'}
            </button>
            <small className="fz-def">Al publicar, tus clientes ya pueden unirse. Cambiar la meta después solo afecta a lo que se sume desde entonces.</small>
          </div>
        )}
      </div>

      <aside className="fz-editor__vista" aria-label="Vista previa">
        <div className="chip-tabs" style={{ marginBottom: 10 }}>
          <button className={vista === 'web' ? 'active' : ''} onClick={() => setVista('web')}>Tarjeta y app</button>
          <button className={vista === 'wallet' ? 'active' : ''} onClick={() => setVista('wallet')}>Google Wallet</button>
        </div>
        {vista === 'web' ? (
          <VistaTarjeta
            foco={null}
            d={{
              negocio: ajustes?.display_name || c.negocio,
              frase: ajustes?.tagline ?? '',
              color: c.color,
              estilo,
              logo: c.logo,
              programa: c.nombre,
              descripcion: programa?.short_description ?? '',
              tipo: 'stamps',
              umbral: c.sellos,
              premio: c.premio,
              sellosPorCompra: 1,
              ayuda: ajustes?.support_url ?? '',
            }}
          />
        ) : (
          <div className="fz-club__wallet" style={{ background: c.color, color: '#fff' }}>
            <div className="fz-club__wallet-cab">
              <span className="fz-club__wallet-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.logo ? <img src={c.logo} alt="" /> : (c.negocio || ajustes?.display_name || '?').slice(0, 1).toUpperCase()}
              </span>
              <b>{ajustes?.display_name || c.negocio || 'Tu negocio'}</b>
            </div>
            <h3>{c.nombre || 'Tu club'}</h3>
            <div className="fz-club__wallet-datos"><span><small>SELLOS</small><b>3</b></span><span><small>PREMIOS</small><b>0</b></span></div>
            <div className="fz-club__wallet-qr" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="fz-club__wallet-arte" alt="" src={arte(c.tarjeta)} />
          </div>
        )}
        <small className="fz-def" style={{ display: 'block', textAlign: 'center', marginTop: 8 }}>Vista con 3 sellos de ejemplo.</small>
      </aside>
    </div>
  );
}
