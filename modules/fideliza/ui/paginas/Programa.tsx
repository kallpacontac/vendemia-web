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
import VistaTarjeta from '@/modules/fideliza/ui/VistaTarjeta';
import { Cargando, Fallo, SinPermiso } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje, sincronizarEnSegundoPlano, type Programa, type Version } from '@/modules/fideliza/cliente/api';
import { urlAyuda } from '@/modules/fideliza/dominio/botones';
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

/** Qué es cada paso, en palabras del dueño, y si lo ven sus clientes al momento. */
const TEXTO_PASO = [
  { d: 'Cómo te verán tus clientes y la dirección de tu link público.', vivo: true },
  { d: 'Ponle nombre a tu programa y elige qué quieres conseguir.', vivo: false },
  { d: '¿Qué suma para el premio: cada compra, lo que gastan o cada visita?', vivo: false },
  { d: 'Cuánto hace falta para ganar el premio y cuál es.', vivo: false },
  { d: 'Tu color y tu logo, para tu página y la tarjeta de Google Wallet. Puedes saltarlo y hacerlo luego.', vivo: true },
  { d: 'Revisa cómo queda y publícalo. Hasta publicar, nadie puede crear su tarjeta.', vivo: false },
];

/**
 * Para qué sirve cada campo, con un ejemplo, y qué parte de la tarjeta del
 * cliente toca (zona de VistaTarjeta). Se busca por el texto de la etiqueta.
 */
const GUIA: [string, string | null, string | null][] = [
  ['Nombre visible del negocio', 'negocio', 'Lo que verán tus clientes arriba de su tarjeta y de tu página.'],
  ['Dirección pública', null, null],
  ['Frase corta', 'frase', 'Una línea debajo del nombre. Ej.: «Cortes clásicos en Miraflores». Opcional.'],
  ['Nombre del programa', 'programa', 'Cómo se llama tu tarjeta. Ej.: «Club El Centro». Mejor 20 letras o menos: Google Wallet corta lo largo.'],
  ['Descripción corta', 'descripcion', 'Una línea que explica el beneficio. Ej.: «Junta 10 sellos y el corte 11 es gratis».'],
  ['Sellos por compra', 'regla', 'Cuántos sellos gana el cliente cada vez que compra. Lo normal es 1.'],
  ['Puntos', 'regla', 'Cuántos puntos da cada tramo de gasto (el tramo va en el campo de al lado).'],
  ['…por cada (S/)', 'regla', 'El tramo de gasto. Con 1 punto por cada S/ 1, una compra de S/ 35 da 35 puntos.'],
  ['Redondeo', 'regla', 'Qué hacer con los decimales. Ej.: 1 punto por cada S/ 10 y una compra de S/ 25 = 2,5 puntos → hacia abajo: 2 · al más cercano: 3 · hacia arriba: 3.'],
  ['Compra mínima', 'minimo', 'Las compras por debajo de este importe se registran, pero no suman. Déjalo vacío para que toda compra sume.'],
  ['Premio al llegar a', 'umbral', 'Cuántos hacen falta para ganar el premio. Ej.: 10. Al llegar, el premio aparece en su tarjeta para canjearlo en caja.'],
  ['Días para canjear', 'vence', 'Cuántos días tiene el cliente para usar el premio desde que lo gana. Vacío = no caduca.'],
  ['Premio', 'premio', 'Lo que gana, en pocas palabras. Ej.: «Un corte gratis», «Café de regalo».'],
  ['El programa termina', null, 'Solo para promociones con fecha de fin: después ya no se suma. Vacío = sin fin.'],
  ['Sucursales que participan', null, 'Marca los locales donde suma. Si en algún local no aplica, desmárcalo.'],
  ['Color de fondo', 'color', 'El fondo de la tarjeta (también en Google Wallet) y de tu página.'],
  ['Logo cuadrado', 'logo', 'Dirección https de tu logo, cuadrado (PNG, mínimo 660×660). Google lo recorta en círculo: deja margen alrededor.'],
  ['Web o ayuda', 'ayuda', 'Escribe tu número de WhatsApp y completamos el enlace automáticamente. También puedes poner tu web. Sale como «Ayuda» en Google Wallet. Opcional.'],
];
const guia = (label: string) => GUIA.find(([t]) => label === t) ?? GUIA.find(([t]) => label.startsWith(t));

/** Los campos de la regla: los del borrador contra los de la versión publicada. */
const CLAVES_REGLA = [
  'rule_type', 'stamps_per_purchase', 'points_per_unit', 'unit_cents', 'rounding', 'min_purchase_cents',
  'reward_threshold', 'reward_description', 'reward_valid_days', 'valid_to', 'location_ids',
] as const;
const mismoValor = (k: string, a: unknown, b: unknown) => {
  if (k === 'valid_to') return (a ? new Date(String(a)).getTime() : null) === (b ? new Date(String(b)).getTime() : null);
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
};

function ProgramaPagina() {
  const { companyId, ajustes, puede, recargar: recargarCtx } = useFideliza();
  const avisar = useAvisar();
  const [paso, setPaso] = useState(0);
  /** El campo en el que está el dueño: su parte de la tarjeta se resalta. */
  const [foco, setFoco] = useState<string | null>(null);
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

  /**
   * ¿Hay cambios sin guardar? Se compara lo que hay en pantalla con una foto
   * tomada al cargar y después de cada guardado. `tomarBase` espera un render
   * para que la foto salga con los valores ya puestos, no con los anteriores.
   */
  const huella = JSON.stringify({ negocio, marca, prog, b, min: textos.min, unidad: textos.unidad });
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
  const sucio = puede('program.edit') && base !== null && huella !== base;
  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sucio]);

  const publicada = datos?.versiones[0] ?? null;
  const borradorGuardado = (datos?.programa?.draft ?? {}) as Record<string, unknown>;
  const sinPublicar = Boolean(
    publicada &&
      Object.keys(borradorGuardado).length &&
      CLAVES_REGLA.some((k) => !mismoValor(k, borradorGuardado[k], (publicada as unknown as Record<string, unknown>)[k])),
  );
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

  async function guardarNegocio(): Promise<boolean> {
    if (!negocio.display_name.trim() || negocio.slug.length < 3) {
      avisar('Escribe el nombre y una dirección de al menos 3 letras.', 'error');
      return false;
    }
    try {
      await accion('ajustes.guardar', { companyId, datos: { display_name: negocio.display_name, slug: negocio.slug, tagline: negocio.tagline } });
      avisar('Datos del negocio guardados');
      recargarCtx();
      setTomarBase(true);
      return true;
    } catch (e) {
      avisar(mensaje(e), 'error');
      return false;
    }
  }

  /** 'logo' = guardado, pero el logo no sirve para Wallet (se enseña por qué). */
  async function guardarMarca(): Promise<'ok' | 'logo' | false> {
    const supportUrl = urlAyuda(marca.support_url);
    if (marca.support_url.trim() && !supportUrl) {
      avisar('Escribe un número de WhatsApp válido o una dirección web.', 'error');
      return false;
    }
    try {
      const r = await accion<{ logo: { ok: boolean; errores: string[]; avisos: string[] } | null }>('ajustes.guardar', {
        companyId,
        datos: { bg_color: marca.bg_color, logo_url: marca.logo_url, support_url: supportUrl, require_external_ref: marca.require_external_ref },
      });
      setMarca((actual) => ({ ...actual, support_url: supportUrl }));
      setLogo(r.logo);
      const malo = Boolean(r.logo && !r.logo.ok);
      avisar(malo ? 'Guardado. El logo no sirve para Google Wallet: mira el motivo abajo.' : 'Marca guardada', malo ? 'espera' : 'ok');
      recargarCtx();
      sincronizarEnSegundoPlano(companyId!);
      setTomarBase(true);
      return malo ? 'logo' : 'ok';
    } catch (e) {
      avisar(mensaje(e), 'error');
      return false;
    }
  }

  async function guardarPrograma(): Promise<boolean> {
    if (!prog.name.trim()) {
      avisar('Ponle nombre al programa (paso 2).', 'error');
      return false;
    }
    try {
      const draft: Borrador = {
        ...b,
        min_purchase_cents: textos.min ? aCentimos(textos.min) ?? 0 : 0,
        unit_cents: aCentimos(textos.unidad) ?? 100,
      };
      // Solo los campos que la base conoce: el resto de la versión no es borrador.
      const limpio = Object.fromEntries(Object.entries(draft).filter(([k]) => (CLAVES_REGLA as readonly string[]).includes(k)));
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
      // Crear el programa cambia el modo del negocio (pestañas de caja, clientes…).
      if (!datos?.programa) recargarCtx();
      avisar(publicada ? 'Guardado como borrador. Publícalo en el paso 6 para que lo vean tus clientes.' : 'Guardado');
      releer();
      setTomarBase(true);
      return true;
    } catch (e) {
      avisar(mensaje(e), 'error');
      return false;
    }
  }

  const guardarPaso = async (n: number): Promise<boolean> =>
    n === 0 ? guardarNegocio() : n <= 3 ? guardarPrograma() : n === 4 ? (await guardarMarca()) !== false : true;

  /** Cambiar de paso guarda ANTES lo que haya cambiado. Si falla, no se mueve. */
  async function irA(n: number) {
    if (n === paso || n < 0 || n > 5) return;
    if (sucio) {
      setOcupado(true);
      const ok = await guardarPaso(paso);
      setOcupado(false);
      if (!ok) return;
    }
    setPaso(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** «Guardar y seguir». En la marca, si el logo no sirve, se queda para enseñar por qué. */
  async function siguiente() {
    if (paso === 4 && sucio) {
      setOcupado(true);
      const r = await guardarMarca();
      setOcupado(false);
      if (r === 'ok') {
        setPaso(5);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    await irA(paso + 1);
  }

  async function publicar() {
    if (!datos?.programa) return;
    if (publicada && !window.confirm('Se creará una versión nueva de la regla, vigente desde ahora. Las operaciones anteriores no cambian. ¿Publicar?')) return;
    setOcupado(true);
    try {
      if (!(await guardarPrograma())) return;
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

  const campo = (label: string, hijo: React.ReactNode, ayuda?: string) => {
    const [, zona, texto] = guia(label) ?? [label, null, null];
    return (
      <div
        className={`fz-campo ${zona && foco === zona ? 'fz-campo--foco' : ''}`}
        onFocusCapture={() => setFoco(zona)}
        onMouseEnter={() => zona && setFoco(zona)}
      >
        <label className="field-label">{label}</label>
        {hijo}
        {(texto ?? ayuda) && <small>{texto ?? ayuda}</small>}
      </div>
    );
  };

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
          <button key={t} role="tab" aria-selected={paso === i} className={paso === i ? 'active' : i < paso ? 'done' : ''} onClick={() => void irA(i)}>
            {i < paso && <Check size={12} />} {i + 1}. {t}
          </button>
        ))}
      </div>

      {sinPublicar && (
        <div className="fz-panel-aviso" role="status">
          <span style={{ flex: 1 }}>
            <b>Tienes cambios guardados que tus clientes todavía no ven.</b> Publícalos para que empiecen a contar.
          </span>
          {paso !== 5 && (
            <button className="btn btn-primary btn-sm" onClick={() => void irA(5)}>
              Ir a publicar
            </button>
          )}
        </div>
      )}

      <div className="fz-editor fz-editor--asistente">
      <div className="card fz-caja" style={{ maxWidth: 'none' }}>
        <div className="fz-paso-cab">
          <div>
            <small className="fz-def">Paso {paso + 1} de 6</small>
            <h3>{PASOS[paso]}</h3>
            <p className="fz-def">{TEXTO_PASO[paso].d}</p>
            {editable && paso < 5 && (
              <p className="fz-def">
                {TEXTO_PASO[paso].vivo
                  ? 'Se aplica al momento al guardar.'
                  : publicada
                    ? 'Se guarda como borrador: tus clientes no ven el cambio hasta que publiques en el paso 6.'
                    : 'Se guarda como borrador hasta que publiques en el paso 6.'}
              </p>
            )}
          </div>
          {editable && (
            <span className={`fz-guardado ${ocupado ? 'fz-guardado--en-curso' : sucio ? 'fz-guardado--pendiente' : 'fz-guardado--ok'}`} role="status">
              {ocupado ? 'Guardando…' : sucio ? '● Cambios sin guardar' : base !== null ? '✓ Guardado' : ''}
            </span>
          )}
        </div>

        {paso === 0 && (
          <>
            {campo('Nombre visible del negocio', <input className="input" maxLength={60} value={negocio.display_name} disabled={!editable} onChange={(e) => setNegocio({ ...negocio, display_name: e.target.value })} />)}
            {campo(
              'Dirección pública',
              <input className="input" maxLength={40} value={negocio.slug} disabled={!editable} onChange={(e) => setNegocio({ ...negocio, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />,
              negocio.slug ? `Quedará en ${urlNegocio(negocio.slug)}. Cambiarla rompe los enlaces a la página, NO las placas.` : 'Minúsculas, números y guiones. Ej.: barberia-el-centro',
            )}
            {campo('Frase corta', <input className="input" maxLength={120} value={negocio.tagline} disabled={!editable} onChange={(e) => setNegocio({ ...negocio, tagline: e.target.value })} />)}
            <h3 style={{ fontSize: 15, margin: '18px 0 4px' }}>Sucursales</h3>
            <p className="fz-def" style={{ marginBottom: 8 }}>
              Solo si tienes más de un local: sirve para saber dónde se registró cada compra y para que cada cajero opere solo en el suyo. Con un solo local, no añadas nada.
            </p>
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
          </>
        )}

        {paso === 1 && (
          <>
            {campo('Nombre del programa', <input className="input" maxLength={40} value={prog.name} disabled={!editable} onChange={(e) => setProg({ ...prog, name: e.target.value })} placeholder="Club El Centro" />, 'Lo verá el cliente en su tarjeta y en Google Wallet (mejor 20 letras o menos).')}
            {campo('Descripción corta', <input className="input" maxLength={120} value={prog.description} disabled={!editable} onChange={(e) => setProg({ ...prog, description: e.target.value })} />)}
            <label className="field-label">¿Qué quieres conseguir?</label>
            <small className="fz-def" style={{ display: 'block', marginBottom: 8 }}>Solo te orienta para los siguientes pasos: no cambia cómo funciona el programa.</small>
            <div className="fz-grid">
              {OBJETIVOS.map((o) => (
                <button key={o.v} type="button" disabled={!editable} className={`card ${prog.objective === o.v ? 'fz-elegido' : ''}`} style={{ textAlign: 'left', cursor: 'pointer', border: prog.objective === o.v ? '2px solid var(--brand)' : '2px solid transparent' }} onClick={() => setProg({ ...prog, objective: o.v })}>
                  <b>{o.t}</b>
                  <p className="fz-def">{o.d}</p>
                </button>
              ))}
            </div>
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
                <button key={r.v} type="button" onMouseEnter={() => setFoco('regla')} disabled={!editable || tipoBloqueado} className="card" style={{ textAlign: 'left', cursor: 'pointer', border: b.rule_type === r.v ? '2px solid var(--brand)' : '2px solid transparent' }} onClick={() => setB({ ...b, rule_type: r.v })}>
                  <b>{r.t}</b>
                  <p className="fz-def">{r.d}</p>
                </button>
              ))}
            </div>
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
              <input type="checkbox" checked={marca.require_external_ref} disabled={!editable} onChange={(e) => setMarca({ ...marca, require_external_ref: e.target.checked })} /> Pedir el número de boleta o ticket en cada compra
            </label>
            <small className="fz-def" style={{ display: 'block', marginTop: -8, marginBottom: 14 }}>
              En caja tendrán que escribir el número de la boleta. Así la misma venta no puede sumar dos veces. Si no emites boleta en cada venta, déjalo sin marcar.
            </small>
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
              {campo(
                'Web o ayuda (opcional)',
                <input
                  className="input"
                  value={marca.support_url}
                  disabled={!editable}
                  onChange={(e) => setMarca({ ...marca, support_url: e.target.value })}
                  onBlur={() =>
                    setMarca((actual) => ({
                      ...actual,
                      support_url: urlAyuda(actual.support_url) || actual.support_url.trim(),
                    }))
                  }
                  placeholder="987 654 321 o tunegocio.com"
                />,
              )}
              <small className="fz-def">Al pulsar «Guardar y seguir» comprobamos si el logo sirve para Google Wallet.</small>
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
          <div className="fz-publicacion">
            {b.rule_type && b.reward_threshold && b.reward_description ? (
              <p className="fz-publicacion__regla">{fraseRegla({ ...b, rule_type: b.rule_type, threshold: b.reward_threshold, reward: b.reward_description, min_purchase_cents: aCentimos(textos.min || '0') ?? 0, unit_cents: aCentimos(textos.unidad) ?? 100 })}</p>
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
              <div className="fz-publicacion__acciones">
                <button className="btn btn-primary" disabled={ocupado || !ajustes || !p || !b.reward_threshold || !b.reward_description} onClick={() => void publicar()}>
                  {publicada ? 'Publicar nueva versión' : 'Publicar programa'}
                </button>
              </div>
            )}
            {datos!.versiones.length > 0 && (
              <section className="fz-publicacion__versiones">
                <h3>Versiones publicadas</h3>
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
              </section>
            )}
          </div>
        )}

        {editable && (
          <div className="fz-paso-pie">
            {paso > 0 ? (
              <button className="btn btn-ghost" disabled={ocupado} onClick={() => void irA(paso - 1)}>
                ← Atrás
              </button>
            ) : (
              <span />
            )}
            {paso < 5 && (
              <button
                className="btn btn-primary"
                disabled={
                  ocupado ||
                  (paso === 0 && (!negocio.display_name.trim() || negocio.slug.length < 3)) ||
                  (paso === 1 && !prog.name.trim()) ||
                  (paso === 3 && (!b.reward_threshold || !b.reward_description))
                }
                onClick={() => void siguiente()}
              >
                {ocupado ? 'Guardando…' : sucio ? 'Guardar y seguir →' : 'Seguir →'}
              </button>
            )}
          </div>
        )}
      </div>
      <aside className="fz-editor__vista" aria-label="Vista previa de la tarjeta del cliente">
        <VistaTarjeta
          foco={foco}
          d={{
            negocio: negocio.display_name,
            frase: negocio.tagline,
            color: marca.bg_color,
            logo: marca.logo_url,
            programa: prog.name,
            descripcion: prog.description,
            tipo: b.rule_type,
            umbral: b.reward_threshold,
            premio: b.reward_description ?? '',
            sellosPorCompra: b.stamps_per_purchase,
            puntosPorUnidad: b.points_per_unit,
            unidadCentimos: aCentimos(textos.unidad) ?? 100,
            minimoCentimos: textos.min ? aCentimos(textos.min) ?? 0 : 0,
            diasPremio: b.reward_valid_days,
            ayuda: marca.support_url,
          }}
        />
      </aside>
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
