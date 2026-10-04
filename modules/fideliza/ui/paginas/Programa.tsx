'use client';

/**
 * FIDELIZA · PROGRAMA — el asistente de seis pasos.
 *
 * Lo que se edita es un BORRADOR (loyalty_programs.draft y loyalty_settings).
 * Publicar crea una versión nueva con vigencia desde ese momento; las
 * operaciones anteriores siguen con la regla con la que se hicieron.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Plus } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, SinPermiso } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje, sincronizarEnSegundoPlano, type Programa, type Version } from '@/modules/fideliza/cliente/api';
import { urlNegocio } from '@/modules/fideliza/dominio/config';
import { aCentimos, fecha, fraseRegla, soles, unidades, type TipoRegla } from '@/modules/fideliza/dominio/formato';

const PASOS = ['Negocio y sucursal', 'Objetivo', 'Tipo de regla', 'Beneficio', 'Marca', 'Probar y publicar'];
const OBJETIVOS = [
  { v: 'repeat', t: 'Que vuelvan', d: 'Clientes que vienen una vez y no regresan.' },
  { v: 'frequency', t: 'Que vengan más seguido', d: 'Acortar el tiempo entre visitas.' },
  { v: 'ticket', t: 'Que gasten un poco más', d: 'Premiar el gasto, no solo la visita.' },
  { v: 'winback', t: 'Recuperar inactivos', d: 'Volver a ver a quien dejó de venir.' },
] as const;
const REGLAS: { v: TipoRegla; t: string; d: string }[] = [
  { v: 'stamps', t: 'Sellos por compra', d: 'Cada compra elegible suma sellos. Con N sellos, premio. El clásico «10 cortes, el 11 gratis».' },
  { v: 'points', t: 'Puntos por gasto', d: 'Puntos según el importe. Con N puntos, premio. Premia más a quien gasta más.' },
  { v: 'visits', t: 'Visitas completadas', d: 'Cada visita suma 1, sin importe. Para academias, gimnasios o clases.' },
];

type Borrador = Programa['draft'];

function ProgramaPagina() {
  const { companyId, ajustes, puede, recargar: recargarCtx } = useFideliza();
  const avisar = useAvisar();
  const [paso, setPaso] = useState(0);
  // Desde «Primeros pasos» se llega directo al paso que falta (?paso=0…5).
  const params = useSearchParams();
  useEffect(() => {
    const n = Number(params.get('paso'));
    if (params.get('paso') !== null && Number.isInteger(n) && n >= 0 && n <= 5) setPaso(n);
  }, [params]);
  const [ocupado, setOcupado] = useState(false);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [programas, sucursales] = await Promise.all([lecturas.programas(companyId), lecturas.sucursales(companyId)]);
    const programa = programas.find((p) => p.status !== 'draft') ?? programas[0] ?? null;
    const versiones = programa ? await lecturas.versiones(companyId, programa.id) : [];
    return { programa, sucursales, versiones };
  }, [companyId]);

  // ── Borrador local ────────────────────────────────────────────────────
  const [negocio, setNegocio] = useState({ display_name: '', slug: '', tagline: '' });
  const [marca, setMarca] = useState({ bg_color: '#FF4900', logo_url: '', support_url: '', require_external_ref: false });
  const [prog, setProg] = useState({ name: '', description: '', objective: null as string | null });
  const [b, setB] = useState<Borrador>({ rule_type: 'stamps', stamps_per_purchase: 1, points_per_unit: 1, unit_cents: 100, rounding: 'floor', min_purchase_cents: 0 });
  const [textos, setTextos] = useState({ min: '', unidad: '1,00', ejemplo: '50' });
  const [logo, setLogo] = useState<{ ok: boolean; errores: string[]; avisos: string[] } | null>(null);
  const [nuevaSucursal, setNuevaSucursal] = useState('');

  useEffect(() => {
    if (ajustes) {
      setNegocio({ display_name: ajustes.display_name, slug: ajustes.slug, tagline: ajustes.tagline });
      setMarca({
        bg_color: ajustes.bg_color,
        logo_url: ajustes.logo_url ?? '',
        support_url: ajustes.support_url ?? '',
        require_external_ref: ajustes.require_external_ref,
      });
      if (ajustes.logo_checked) setLogo({ ok: Boolean(ajustes.logo_checked.ok), errores: ajustes.logo_checked.errores ?? [], avisos: ajustes.logo_checked.avisos ?? [] });
    }
  }, [ajustes]);

  useEffect(() => {
    const p = datos?.programa;
    if (!p) return;
    setProg({ name: p.name, description: p.short_description, objective: p.objective });
    const base = Object.keys(p.draft ?? {}).length ? p.draft : (datos?.versiones[0] ?? {});
    setB((x) => ({ ...x, ...base }));
    setTextos((t) => ({
      ...t,
      min: base.min_purchase_cents ? String(base.min_purchase_cents / 100) : '',
      unidad: base.unit_cents ? String(base.unit_cents / 100) : t.unidad,
    }));
  }, [datos?.programa, datos?.versiones]);

  const publicada = datos?.versiones[0] ?? null;
  const tipoBloqueado = Boolean(publicada);
  const ejemploCent = aCentimos(textos.ejemplo) ?? 0;
  const ejemplo = useMemo(() => {
    if (!b.rule_type) return '';
    if (b.rule_type === 'visits') return 'Cada visita suma 1.';
    if (ejemploCent < (b.min_purchase_cents ?? 0)) return `Una compra de ${soles(ejemploCent)} no suma: está por debajo del mínimo.`;
    if (b.rule_type === 'stamps') return `Una compra de ${soles(ejemploCent)} suma ${unidades(b.stamps_per_purchase ?? 1, 'stamps')}.`;
    const x = (ejemploCent * (b.points_per_unit ?? 1)) / (b.unit_cents ?? 100);
    const n = b.rounding === 'ceil' ? Math.ceil(x) : b.rounding === 'round' ? Math.round(x) : Math.floor(x);
    return `Una compra de ${soles(ejemploCent)} suma ${unidades(n, 'points')} (${x.toFixed(2)} redondeado ${b.rounding === 'floor' ? 'hacia abajo' : b.rounding === 'ceil' ? 'hacia arriba' : 'al más cercano'}).`;
  }, [b, ejemploCent]);

  if (!puede('program.read')) return <SinPermiso que="el programa" />;
  if (cargando && !datos) return <Cargando texto="Cargando el programa…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  const editable = puede('program.edit');

  async function guardarNegocio() {
    setOcupado(true);
    try {
      await accion('ajustes.guardar', { companyId, datos: { display_name: negocio.display_name, slug: negocio.slug, tagline: negocio.tagline } });
      avisar('Datos del negocio guardados');
      recargarCtx();
      setPaso(1);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function guardarMarca() {
    setOcupado(true);
    try {
      const r = await accion<{ logo: { ok: boolean; errores: string[]; avisos: string[] } | null }>('ajustes.guardar', {
        companyId,
        datos: { bg_color: marca.bg_color, logo_url: marca.logo_url, support_url: marca.support_url, require_external_ref: marca.require_external_ref },
      });
      setLogo(r.logo);
      avisar(r.logo && !r.logo.ok ? 'Guardado. El logo no sirve para Google Wallet: se usará el de Vendemia hasta corregirlo.' : 'Marca guardada', r.logo && !r.logo.ok ? 'espera' : 'ok');
      recargarCtx();
      sincronizarEnSegundoPlano(companyId!);
      if (!r.logo || r.logo.ok) setPaso(5);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function guardarPrograma(siguiente: number) {
    if (!prog.name.trim()) return avisar('Ponle nombre al programa.', 'error');
    setOcupado(true);
    try {
      const draft: Borrador = {
        ...b,
        min_purchase_cents: textos.min ? aCentimos(textos.min) ?? 0 : 0,
        unit_cents: aCentimos(textos.unidad) ?? 100,
      };
      // Solo los campos que la base conoce: el resto de la versión no es borrador.
      const limpio = Object.fromEntries(
        Object.entries(draft).filter(([k]) =>
          ['rule_type', 'stamps_per_purchase', 'points_per_unit', 'unit_cents', 'rounding', 'min_purchase_cents', 'reward_threshold', 'reward_description', 'reward_valid_days', 'valid_to', 'location_ids'].includes(k),
        ),
      );
      if (ajustes && marca.require_external_ref !== ajustes.require_external_ref) {
        await accion('ajustes.guardar', { companyId, datos: { require_external_ref: marca.require_external_ref } });
        recargarCtx();
      }
      await accion('programa.guardar', {
        companyId,
        programId: datos?.programa?.id ?? null,
        name: prog.name,
        description: prog.description,
        objective: prog.objective,
        draft: limpio,
      });
      releer();
      setPaso(siguiente);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function publicar() {
    if (!datos?.programa) return;
    if (publicada && !window.confirm('Se creará una versión nueva de la regla, vigente desde ahora. Las operaciones anteriores no cambian. ¿Publicar?')) return;
    setOcupado(true);
    try {
      await guardarPrograma(5);
      const v = await accion<Version>('programa.publicar', { companyId, programId: datos.programa.id });
      avisar(`Publicada la versión ${v.version}. La tarjeta de Google Wallet se está creando.`);
      sincronizarEnSegundoPlano(companyId!);
      releer();
      recargarCtx();
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarEstado(status: 'active' | 'paused') {
    if (!datos?.programa) return;
    try {
      await accion('programa.estado', { companyId, programId: datos.programa.id, status });
      avisar(status === 'paused' ? 'Programa pausado: no se acumula, los premios ya ganados se pueden canjear.' : 'Programa activo');
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  async function anadirSucursal() {
    if (!nuevaSucursal.trim()) return;
    try {
      await accion('sucursal.guardar', { companyId, id: null, name: nuevaSucursal.trim(), active: true });
      setNuevaSucursal('');
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  const campo = (label: string, hijo: React.ReactNode, ayuda?: string) => (
    <div className="fz-campo">
      <label className="field-label">{label}</label>
      {hijo}
      {ayuda && <small>{ayuda}</small>}
    </div>
  );

  const p = datos?.programa;
  return (
    <>
      {p && (
        <div className="fz-panel-aviso fz-panel-aviso--info">
          <span style={{ flex: 1 }}>
            <b>{p.name}</b> · {p.status === 'active' ? 'Activo' : p.status === 'paused' ? 'Pausado' : p.status === 'error' ? 'Con error' : 'Borrador'}
            {publicada && ` · versión ${publicada.version} desde ${fecha(publicada.valid_from)}`}
          </span>
          {editable && p.status === 'active' && (
            <button className="btn btn-ghost btn-sm" onClick={() => void cambiarEstado('paused')}>
              Pausar
            </button>
          )}
          {editable && p.status === 'paused' && (
            <button className="btn btn-primary btn-sm" onClick={() => void cambiarEstado('active')}>
              Reactivar
            </button>
          )}
        </div>
      )}

      <div className="fz-pasos" role="tablist">
        {PASOS.map((t, i) => (
          <button key={t} role="tab" aria-selected={paso === i} className={paso === i ? 'active' : i < paso ? 'done' : ''} onClick={() => setPaso(i)}>
            {i < paso && <Check size={12} />} {i + 1}. {t}
          </button>
        ))}
      </div>

      <div className="card fz-caja" style={{ maxWidth: 720 }}>
        {paso === 0 && (
          <>
            {campo('Nombre visible del negocio', <input className="input" maxLength={60} value={negocio.display_name} disabled={!editable} onChange={(e) => setNegocio({ ...negocio, display_name: e.target.value })} />)}
            {campo(
              'Dirección pública',
              <input className="input" maxLength={40} value={negocio.slug} disabled={!editable} onChange={(e) => setNegocio({ ...negocio, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />,
              negocio.slug ? `Quedará en ${urlNegocio(negocio.slug)}. Cambiarla rompe los enlaces a la página, NO las placas.` : 'Minúsculas, números y guiones. Ej.: barberia-el-centro',
            )}
            {campo('Frase corta', <input className="input" maxLength={120} value={negocio.tagline} disabled={!editable} onChange={(e) => setNegocio({ ...negocio, tagline: e.target.value })} />)}
            <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>Sucursales</h3>
            {datos!.sucursales.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Sin sucursales: todo cuenta como el local principal.</p>}
            <ul className="fz-lista">
              {datos!.sucursales.map((s) => (
                <li key={s.id}>
                  <span>{s.name}</span>
                  <span className={`badge-pill ${s.is_active ? 'b-new' : 'b-mute'}`}>{s.is_active ? 'Activa' : 'Desactivada'}</span>
                </li>
              ))}
            </ul>
            {editable && ajustes && (
              <div className="fz-fila" style={{ marginTop: 8 }}>
                <input className="input" style={{ flex: 1 }} placeholder="Nueva sucursal" value={nuevaSucursal} onChange={(e) => setNuevaSucursal(e.target.value)} />
                <button className="btn btn-ghost btn-sm" onClick={() => void anadirSucursal()}>
                  <Plus size={14} /> Añadir
                </button>
              </div>
            )}
            {editable && (
              <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={ocupado || !negocio.display_name || negocio.slug.length < 3} onClick={() => void guardarNegocio()}>
                Guardar y seguir
              </button>
            )}
          </>
        )}

        {paso === 1 && (
          <>
            {campo('Nombre del programa', <input className="input" maxLength={40} value={prog.name} disabled={!editable} onChange={(e) => setProg({ ...prog, name: e.target.value })} placeholder="Club El Centro" />, 'Lo verá el cliente en su tarjeta y en Google Wallet (mejor 20 letras o menos).')}
            {campo('Descripción corta', <input className="input" maxLength={120} value={prog.description} disabled={!editable} onChange={(e) => setProg({ ...prog, description: e.target.value })} />)}
            <label className="field-label">¿Qué quieres conseguir?</label>
            <div className="fz-grid">
              {OBJETIVOS.map((o) => (
                <button key={o.v} type="button" disabled={!editable} className={`card ${prog.objective === o.v ? 'fz-elegido' : ''}`} style={{ textAlign: 'left', cursor: 'pointer', border: prog.objective === o.v ? '2px solid var(--brand)' : '2px solid transparent' }} onClick={() => setProg({ ...prog, objective: o.v })}>
                  <b>{o.t}</b>
                  <p className="fz-def">{o.d}</p>
                </button>
              ))}
            </div>
            {editable && <button className="btn btn-primary" disabled={ocupado} onClick={() => void guardarPrograma(2)}>Guardar y seguir</button>}
          </>
        )}

        {paso === 2 && (
          <>
            {tipoBloqueado && (
              <div className="fz-panel-aviso">
                El tipo de regla no se puede cambiar en un programa publicado: los saldos dejarían de significar lo mismo. Para cambiarlo, crea un programa nuevo.
              </div>
            )}
            <div className="fz-grid">
              {REGLAS.map((r) => (
                <button key={r.v} type="button" disabled={!editable || tipoBloqueado} className="card" style={{ textAlign: 'left', cursor: 'pointer', border: b.rule_type === r.v ? '2px solid var(--brand)' : '2px solid transparent' }} onClick={() => setB({ ...b, rule_type: r.v })}>
                  <b>{r.t}</b>
                  <p className="fz-def">{r.d}</p>
                </button>
              ))}
            </div>
            {editable && <button className="btn btn-primary" disabled={ocupado} onClick={() => void guardarPrograma(3)}>Guardar y seguir</button>}
          </>
        )}

        {paso === 3 && (
          <>
            {b.rule_type === 'stamps' && campo('Sellos por compra', <input className="input" type="number" min={1} max={100} value={b.stamps_per_purchase ?? 1} disabled={!editable} onChange={(e) => setB({ ...b, stamps_per_purchase: Number(e.target.value) })} />)}
            {b.rule_type === 'points' && (
              <div className="fz-col2">
                {campo('Puntos', <input className="input" type="number" min={1} value={b.points_per_unit ?? 1} disabled={!editable} onChange={(e) => setB({ ...b, points_per_unit: Number(e.target.value) })} />)}
                {campo('…por cada (S/)', <input className="input" inputMode="decimal" value={textos.unidad} disabled={!editable} onChange={(e) => setTextos({ ...textos, unidad: e.target.value })} />)}
                {campo(
                  'Redondeo',
                  <select className="select" value={b.rounding} disabled={!editable} onChange={(e) => setB({ ...b, rounding: e.target.value as 'floor' })}>
                    <option value="floor">Hacia abajo (recomendado)</option>
                    <option value="round">Al más cercano</option>
                    <option value="ceil">Hacia arriba</option>
                  </select>,
                )}
              </div>
            )}
            {b.rule_type !== 'visits' && campo('Compra mínima (S/, opcional)', <input className="input" inputMode="decimal" value={textos.min} disabled={!editable} onChange={(e) => setTextos({ ...textos, min: e.target.value })} placeholder="0" />, 'Por debajo de este importe la compra se registra pero no suma.')}
            <div className="fz-col2">
              {campo(`Premio al llegar a (${b.rule_type === 'points' ? 'puntos' : b.rule_type === 'visits' ? 'visitas' : 'sellos'})`, <input className="input" type="number" min={1} value={b.reward_threshold ?? ''} disabled={!editable} onChange={(e) => setB({ ...b, reward_threshold: Number(e.target.value) || undefined })} />)}
              {campo('Días para canjear el premio (opcional)', <input className="input" type="number" min={1} max={3650} value={b.reward_valid_days ?? ''} disabled={!editable} onChange={(e) => setB({ ...b, reward_valid_days: e.target.value ? Number(e.target.value) : null })} />, 'Vacío = no vence.')}
            </div>
            {campo('Premio', <input className="input" maxLength={80} value={b.reward_description ?? ''} disabled={!editable} onChange={(e) => setB({ ...b, reward_description: e.target.value })} placeholder="Un corte gratis" />)}
            {campo('El programa termina el (opcional)', <input className="input" type="date" value={b.valid_to ? b.valid_to.slice(0, 10) : ''} disabled={!editable} onChange={(e) => setB({ ...b, valid_to: e.target.value ? `${e.target.value}T23:59:59-05:00` : null })} />, 'Pasada esa fecha no se acumula hasta que publiques otra regla.')}
            {datos!.sucursales.length > 0 &&
              campo(
                'Sucursales que participan',
                <div className="fz-fila">
                  {datos!.sucursales.map((s) => {
                    const todas = !b.location_ids;
                    const dentro = todas || b.location_ids!.includes(s.id);
                    return (
                      <label key={s.id} className="check-inline">
                        <input
                          type="checkbox"
                          checked={dentro}
                          disabled={!editable}
                          onChange={() => {
                            const actuales = todas ? datos!.sucursales.map((x) => x.id) : b.location_ids!;
                            const nuevas = dentro ? actuales.filter((x) => x !== s.id) : [...actuales, s.id];
                            setB({ ...b, location_ids: nuevas.length === datos!.sucursales.length ? null : nuevas });
                          }}
                        />{' '}
                        {s.name}
                      </label>
                    );
                  })}
                </div>,
              )}
            <label className="check-inline" style={{ display: 'block', margin: '6px 0 14px' }}>
              <input type="checkbox" checked={marca.require_external_ref} disabled={!editable} onChange={(e) => setMarca({ ...marca, require_external_ref: e.target.checked })} /> Exigir número de comprobante en cada compra (evita registrar dos veces la misma venta)
            </label>
            {editable && (
              <button className="btn btn-primary" disabled={ocupado || !b.reward_threshold || !b.reward_description} onClick={() => void guardarPrograma(4)}>
                Guardar y seguir
              </button>
            )}
          </>
        )}

        {paso === 4 && (
          <div className="fz-col2">
            <div>
              {campo('Color de fondo', <input className="input" type="color" value={marca.bg_color} disabled={!editable} onChange={(e) => setMarca({ ...marca, bg_color: e.target.value.toUpperCase() })} style={{ height: 48, padding: 4 }} />)}
              {campo('Logo cuadrado (URL https pública)', <input className="input" value={marca.logo_url} disabled={!editable} onChange={(e) => setMarca({ ...marca, logo_url: e.target.value.trim() })} placeholder="https://…/logo.png" />, 'PNG cuadrado, mínimo 660×660, con margen alrededor: Google lo recorta en círculo.')}
              {logo && (
                <div className={`fz-panel-aviso ${logo.ok ? 'fz-panel-aviso--ok' : 'fz-panel-aviso--error'}`}>
                  <span>{logo.ok ? 'El logo sirve para Google Wallet.' : logo.errores.join(' ')} {logo.avisos.join(' ')}</span>
                </div>
              )}
              {campo('Web o ayuda (opcional)', <input className="input" value={marca.support_url} disabled={!editable} onChange={(e) => setMarca({ ...marca, support_url: e.target.value.trim() })} placeholder="https://wa.me/51…" />)}
              {editable && (
                <button className="btn btn-primary" disabled={ocupado} onClick={() => void guardarMarca()}>
                  Guardar y comprobar logo
                </button>
              )}
            </div>
            <div>
              <label className="field-label">Vista previa</label>
              <div className="fz-prev" style={{ background: marca.bg_color }}>
                <div className="fz-fila">
                  {marca.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="fz-prev__logo" src={marca.logo_url} alt="" />
                  ) : (
                    <div className="fz-prev__logo" />
                  )}
                  <b style={{ background: '#fff', padding: '2px 8px', borderRadius: 8 }}>{negocio.display_name || 'Tu negocio'}</b>
                </div>
                <p style={{ marginTop: 14, background: 'rgba(255,255,255,.9)', padding: 8, borderRadius: 10, fontSize: 13 }}>
                  {prog.name || 'Tu programa'} · {b.reward_threshold && b.reward_description && b.rule_type ? fraseRegla({ ...b, rule_type: b.rule_type, threshold: b.reward_threshold, reward: b.reward_description }) : 'Configura la regla'}
                </p>
              </div>
              <p className="fz-def">Aproximada: Google Wallet compone la tarjeta con su propio diseño.</p>
            </div>
          </div>
        )}

        {paso === 5 && (
          <>
            {b.rule_type && b.reward_threshold && b.reward_description ? (
              <p style={{ fontSize: 16, fontWeight: 700 }}>{fraseRegla({ ...b, rule_type: b.rule_type, threshold: b.reward_threshold, reward: b.reward_description, min_purchase_cents: aCentimos(textos.min || '0') ?? 0, unit_cents: aCentimos(textos.unidad) ?? 100 })}</p>
            ) : (
              <div className="fz-panel-aviso">Falta completar la regla (paso 4).</div>
            )}
            {b.rule_type !== 'visits' && (
              <div className="fz-campo">
                <label className="field-label">Probar con un importe (S/)</label>
                <input className="input" inputMode="decimal" value={textos.ejemplo} onChange={(e) => setTextos({ ...textos, ejemplo: e.target.value })} style={{ maxWidth: 160 }} />
                <small>{ejemplo}</small>
              </div>
            )}
            {!ajustes && <div className="fz-panel-aviso">Falta el paso 1 (datos del negocio).</div>}
            {editable && (
              <button className="btn btn-primary" disabled={ocupado || !ajustes || !p || !b.reward_threshold || !b.reward_description} onClick={() => void publicar()}>
                {publicada ? 'Publicar nueva versión' : 'Publicar programa'}
              </button>
            )}
            {datos!.versiones.length > 0 && (
              <>
                <h3 style={{ fontSize: 15, margin: '20px 0 8px' }}>Versiones publicadas</h3>
                <ul className="fz-lista">
                  {datos!.versiones.map((v) => (
                    <li key={v.id}>
                      <span>
                        <b>v{v.version}</b> · {fraseRegla({ ...v, threshold: v.reward_threshold, reward: v.reward_description })}
                      </span>
                      <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {fecha(v.valid_from)} → {v.valid_to ? fecha(v.valid_to) : 'vigente'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function Programa() {
  return (
    <Suspense fallback={null}>
      <ProgramaPagina />
    </Suspense>
  );
}
