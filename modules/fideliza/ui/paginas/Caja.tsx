'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FIDELIZA · CAJA — de pie, con el móvil en una mano
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tres reglas que no se negocian:
 *
 * 1 · NADA SE PINTA COMO HECHO HASTA QUE POSTGRES LO CONFIRMA. El saldo que
 *     se enseña después es el que devuelve la RPC, no una suma en el navegador.
 * 2 · CADA INTENTO TIENE SU CLAVE. Si la red se cae a mitad, «Reintentar»
 *     reenvía la MISMA clave: si ya se había registrado, la base devuelve la
 *     misma operación («replayed») y no suma dos veces.
 * 3 · SIN CONEXIÓN NO SE OPERA. No hay canje offline: un premio canjeado sin
 *     confirmar podría canjearse otra vez en otra caja.
 *
 * LÍNEAS (0017, Kallpa): una tarjeta, varias líneas con sus reglas («Asistencia»,
 * «Compra»). Quien atiende elige la línea arriba y la caja opera sobre ella; cada
 * equipo recuerda la suya (la cafetería se queda en «Compra»).
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, CameraOff, Check, Gift, MonitorSmartphone, Plus, Search, ShoppingBag, Undo2, UserRound } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { useSesion } from '@/components/panel/Sesion';
import { Cargando, Qr, SinPermiso } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, ErrorFideliza, lecturas, mensaje, nuevaClave, sincronizarEnSegundoPlano, type Linea } from '@/modules/fideliza/cliente/api';
import { urlTarjeta } from '@/modules/fideliza/dominio/config';
import { aCentimos, soles, unidades, type TipoRegla } from '@/modules/fideliza/dominio/formato';
import { selloValido, trazoSello } from '@/modules/fideliza/dominio/sellos';
import type { Estilo } from '@/modules/fideliza/dominio/estilo';

interface MiembroCaja {
  id: string;
  public_code: string;
  alias: string | null;
  status: string;
  balance: number;
  rewards_available: number;
  rule_type: TipoRegla | null;
  threshold: number | null;
  reward_description: string | null;
  verified_contact: boolean;
  /** part (0016): 'level' = beneficio del nivel (p. ej. % de membresía), 'gift' = regalo, null = premio de siempre. */
  rewards: { id: string; description: string; expires_at: string | null; part?: 'level' | 'gift' | null }[];
  /** 0015: con 'month' el saldo es el del mes y threshold/reward_description son el SIGUIENTE nivel. */
  period?: 'none' | 'month';
  bonus_label?: string | null;
  bonus_units?: number | null;
  /**
   * Puesto por el panel (no viene de la base): la tarjeta es de OTRO negocio de quien
   * atiende. Caso Kallpa: el batido se gana en la academia y se recoge en la cafetería.
   */
  negocio?: { id: string; nombre: string };
  /** 0017: las líneas de la persona, la principal primero. */
  lines?: Linea[];
  /** Puesto por el panel: esta vista es de una línea que no es la principal. */
  programId?: string;
}

/** En otro negocio solo se entregan regalos y premios de siempre; el beneficio del nivel se usa allí. */
const entregableFuera = (r: MiembroCaja['rewards'][number]) => r.part !== 'level';

/**
 * 0017 · La tarjeta vista desde UNA línea. En la principal es la persona tal cual; en
 * otra, saldo, meta, premios y bono son los de esa línea e `id` es su miembro allí (o
 * la persona, si aún no tiene: la base lo crea al registrar con `programId`).
 */
function vistaDeLinea(x: MiembroCaja, programa: string | null): MiembroCaja {
  const l = x.negocio || !x.lines || x.lines.length < 2 ? null : x.lines.find((y) => y.program_id === programa && !y.main);
  if (!l) return x;
  return {
    ...x,
    id: l.member_id ?? x.id,
    balance: l.balance,
    rewards_available: l.rewards_available,
    rule_type: l.rule_type,
    threshold: l.threshold,
    reward_description: l.reward,
    rewards: l.rewards,
    period: l.period,
    bonus_label: l.bonus_label,
    bonus_units: l.bonus_units,
    programId: l.program_id,
  };
}

/** «Compra · » delante del texto cuando la persona tiene más de una línea. */
function etiquetaDe(x: MiembroCaja): string {
  if (!x.lines || x.lines.length < 2) return '';
  const l = x.lines.find((y) => (x.programId ? y.program_id === x.programId : y.main));
  return l ? `${l.label} · ` : '';
}

interface Resultado {
  status: 'created' | 'replayed';
  transaction_id?: string;
  kind?: string;
  units?: number;
  amount_cents?: number;
  rewards_issued?: number;
  description?: string;
  member: MiembroCaja;
}

type Pendiente = { tipo: 'registrar' | 'canjear' | 'bono'; clave: string; datos: Record<string, unknown> } | null;

declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
  }
}

export default function Caja() {
  const { companyId, ajustes, puede } = useFideliza();
  const { companias } = useSesion();
  const avisar = useAvisar();
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [candidatos, setCandidatos] = useState<MiembroCaja[]>([]);
  /** La tarjeta de la PERSONA, tal como la devuelve la base. */
  const [persona, setM] = useState<MiembroCaja | null>(null);
  /** 0017: la línea en la que se opera (null = la principal). */
  const [linea, setLinea] = useState<string | null>(null);
  /** Lo que la caja enseña y opera: la persona vista desde la línea elegida. */
  const m = persona ? vistaDeLinea(persona, linea) : null;
  const [importe, setImporte] = useState('');
  const [ref, setRef] = useState('');
  const [sucursal, setSucursal] = useState<string>('');
  const [ocupado, setOcupado] = useState(false);
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const [ultimo, setUltimo] = useState<{ texto: string; tono: 'ok' | 'info' } | null>(null);
  const [camara, setCamara] = useState(false);
  const [alta, setAlta] = useState<null | { alias: string; phone: string; verificado: boolean; clave: string; creado?: { code: string; token: string | null } }>(null);
  const video = useRef<HTMLVideoElement>(null);
  /**
   * MODO MOSTRADOR: la pantalla de la caja pensada para el mostrador (tableta o
   * móvil apoyado): cartilla grande, un botón «Dar sello», y después «Sello
   * puesto · Deshacer · Otro cliente» o «¡Ganó!». Se recuerda por equipo.
   */
  const [mostrador, setMostrador] = useState(false);
  const [hecho, setHecho] = useState<null | { tipo: 'registrar' | 'canjear' | 'deshacer'; r: Resultado }>(null);

  const { datos: sucursales } = useCargar(async () => (companyId ? lecturas.sucursales(companyId) : []), [companyId]);
  const activas = (sucursales ?? []).filter((s) => s.is_active);

  // Clientes manda aquí con ?q=VDM-… cuando la regla es de puntos (hace falta el importe).
  // Se lee de location y no con useSearchParams para no exigir un Suspense a la página.
  useEffect(() => {
    if (!companyId) return;
    const pedido = new URLSearchParams(window.location.search).get('q')?.trim();
    if (!pedido) return;
    setQ(pedido);
    void buscar(pedido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    try {
      setMostrador(localStorage.getItem(`fz:mostrador:${companyId}`) === '1');
    } catch {
      /* nada */
    }
    try {
      setSucursal(localStorage.getItem(`fz:sucursal:${companyId}`) ?? '');
    } catch {
      /* nada */
    }
    // Clientes manda ?linea= (puntos en una línea); si no, la que usa este equipo.
    let l = new URLSearchParams(window.location.search).get('linea');
    try {
      l ||= localStorage.getItem(`fz:linea:${companyId}`);
    } catch {
      /* nada */
    }
    setLinea(l || null);
  }, [companyId]);

  // ── Escáner ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!camara) return;
    let flujo: MediaStream | null = null;
    let vivo = true;
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = flujo;
        await video.current.play();
        // Con lector nativo (Chrome en Android) se usa ese; si no (Chrome en
        // Windows, iPhone, Firefox…), jsQR lee el fotograma desde un canvas.
        const nativo = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
        const jsQR = nativo ? null : (await import('jsqr')).default;
        const lienzo = document.createElement('canvas');
        const ctx = lienzo.getContext('2d', { willReadFrequently: true });
        const leer = async (v: HTMLVideoElement): Promise<string | null> => {
          if (nativo) return (await nativo.detect(v).catch(() => []))[0]?.rawValue ?? null;
          if (!jsQR || !ctx || !v.videoWidth) return null;
          // Basta con 640 px de ancho: más grande solo gasta batería.
          const escala = Math.min(1, 640 / v.videoWidth);
          lienzo.width = Math.round(v.videoWidth * escala);
          lienzo.height = Math.round(v.videoHeight * escala);
          ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
          const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
          return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
        };
        while (vivo && video.current) {
          const valor = await leer(video.current);
          if (valor) {
            setCamara(false);
            setQ(valor);
            void buscar(valor);
            break;
          }
          await new Promise((res) => setTimeout(res, 200));
        }
      } catch {
        avisar('No se pudo abrir la cámara. Escribe el código de la tarjeta.', 'error');
        setCamara(false);
      }
    })();
    return () => {
      vivo = false;
      flujo?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camara]);

  if (!puede('ops.record')) return <SinPermiso que="la caja" />;
  if (!companyId) return <Cargando />;
  // Cualquier navegador con cámara: el lector nativo o, si no hay, jsQR.
  const escanerPosible = typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  async function buscar(texto = q) {
    if (!texto.trim()) return;
    setBuscando(true);
    setCandidatos([]);
    try {
      let r = await accion<MiembroCaja[]>('caja.buscar', { companyId, q: texto.trim() });
      // ¿Es la tarjeta de otro negocio de quien atiende? (la cafetería leyendo la de la academia)
      if (r.length === 0) r = await buscarEnOtros(texto.trim());
      if (r.length === 1) elegir(r[0]);
      else if (r.length === 0) avisar('No hay ninguna tarjeta con ese código en este negocio.', 'espera');
      else setCandidatos(r);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setBuscando(false);
    }
  }

  /**
   * Busca en los OTROS negocios a los que tiene acceso quien atiende (como mucho 5).
   * Sin permiso allí, la base dice «forbidden» y ese negocio se salta: no se ve nada ajeno.
   */
  async function buscarEnOtros(texto: string): Promise<MiembroCaja[]> {
    const otros = companias.filter((c) => c.id !== companyId).slice(0, 5);
    for (const c of otros) {
      try {
        const r = await accion<MiembroCaja[]>('caja.buscar', { companyId: c.id, q: texto });
        if (r.length) return r.map((x) => ({ ...x, negocio: { id: c.id, nombre: c.nombre } }));
      } catch {
        /* sin acceso o sin club: siguiente */
      }
    }
    return [];
  }

  function elegir(x: MiembroCaja) {
    setM(x);
    setCandidatos([]);
    setImporte('');
    setRef('');
    setPendiente(null);
  }

  function elegirLinea(id: string | null) {
    setLinea(id);
    setImporte('');
    setPendiente(null);
    try {
      localStorage.setItem(`fz:linea:${companyId}`, id ?? '');
    } catch {
      /* nada */
    }
  }

  function elegirSucursal(id: string) {
    setSucursal(id);
    try {
      localStorage.setItem(`fz:sucursal:${companyId}`, id);
    } catch {
      /* nada */
    }
  }

  async function enviar(p: NonNullable<Pendiente>) {
    setOcupado(true);
    setPendiente(p);
    try {
      const nombre = p.tipo === 'registrar' ? 'caja.registrar' : p.tipo === 'bono' ? 'caja.bono' : 'caja.canjear';
      const r = await accion<Resultado>(nombre, { ...p.datos, idempotencyKey: p.clave });
      setPendiente(null);
      const negocio = (p.datos.companyId as string) !== companyId ? m?.negocio : undefined;
      setM(negocio ? { ...r.member, negocio } : r.member);
      setImporte('');
      setRef('');
      // La base devuelve la tarjeta de la persona: el texto es el de la línea donde se operó.
      const vm = vistaDeLinea(r.member, linea);
      const tipo = vm.rule_type;
      const texto =
        etiquetaDe(vm) +
        (p.tipo === 'canjear'
          ? `Canjeado: ${r.description ?? 'premio'}. Le quedan ${vm.rewards_available} premio(s).`
          : `${r.units ? `+${unidades(r.units, tipo)}` : 'Registrada, sin sumar (por debajo del mínimo)'}. Saldo: ${unidades(vm.balance, tipo)}.${r.rewards_issued ? ` ¡Premio conseguido! (${r.rewards_issued})` : ''}`);
      setUltimo({ texto: r.status === 'replayed' ? `Ya estaba registrado: ${texto}` : texto, tono: 'ok' });
      if (mostrador) setHecho({ tipo: p.tipo === 'bono' ? 'registrar' : p.tipo, r });
      sincronizarEnSegundoPlano((p.datos.companyId as string) ?? companyId!);
    } catch (e) {
      const sinRespuesta = e instanceof ErrorFideliza && (e.status === 0 || e.status >= 500);
      if (!sinRespuesta) setPendiente(null);
      avisar(sinRespuesta ? 'No llegó la confirmación. Pulsa «Reintentar»: si ya se había registrado, no se suma dos veces.' : mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  function registrar() {
    if (!m) return;
    const tipo = m.rule_type;
    const centimos = importe.trim() ? aCentimos(importe) : 0;
    if (centimos === null) return avisar('Importe no válido. Ej.: 35 o 35,50', 'error');
    if (tipo === 'points' && !centimos) return avisar('Indica el importe de la compra.', 'error');
    if (ajustes?.require_external_ref && !ref.trim()) return avisar('Indica el número de comprobante.', 'error');
    void enviar({
      tipo: 'registrar',
      clave: nuevaClave(),
      datos: {
        companyId,
        memberId: m.id,
        kind: tipo === 'visits' ? 'visit' : 'purchase',
        amountCents: centimos,
        locationId: sucursal || null,
        externalRef: ref.trim() || null,
        ...(m.programId ? { programId: m.programId } : {}),
      },
    });
  }

  function canjear(rewardId: string | null) {
    if (!m) return;
    if (!mostrador && !window.confirm(`¿Entregar ahora el premio «${m.rewards.find((r) => r.id === rewardId)?.description ?? m.reward_description}»?`)) return;
    void enviar({
      tipo: 'canjear',
      clave: nuevaClave(),
      // En otro negocio, su caja: sin la sucursal de este (no existe allí).
      datos: m.negocio
        ? { companyId: m.negocio.id, memberId: m.id, rewardId, locationId: null }
        : { companyId, memberId: m.id, rewardId, locationId: sucursal || null },
    });
  }

  /** El bono de la regla (0015), p. ej. «Reto del BOX +4». No cuenta para la espera. */
  function bono() {
    if (!m?.bonus_units) return;
    void enviar({ tipo: 'bono', clave: nuevaClave(), datos: { companyId, memberId: m.id, ...(m.programId ? { programId: m.programId } : {}) } });
  }

  function cambiarMostrador(v: boolean) {
    setMostrador(v);
    setHecho(null);
    try {
      localStorage.setItem(`fz:mostrador:${companyId}`, v ? '1' : '0');
    } catch {
      /* nada */
    }
  }

  /** «Deshacer»: devuelve la operación recién hecha (queda en el historial como devolución). */
  async function deshacer() {
    const tx = hecho?.r.transaction_id;
    if (!tx) return;
    setOcupado(true);
    try {
      await accion('caja.devolver', { companyId, transactionId: tx, amountCents: null, reason: 'Deshecho en el mostrador', idempotencyKey: nuevaClave() });
      const lista = await accion<MiembroCaja[]>('caja.buscar', { companyId, q: hecho!.r.member.public_code });
      if (lista[0]) setM(lista[0]);
      setHecho(null);
      setUltimo({ texto: 'Deshecho: la última operación se devolvió.', tono: 'info' });
      sincronizarEnSegundoPlano(companyId!);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  function otroCliente() {
    setHecho(null);
    setM(null);
    setQ('');
    setImporte('');
    setRef('');
    if (escanerPosible) setCamara(true);
  }

  async function crearCliente() {
    if (!alta) return;
    setOcupado(true);
    try {
      const r = await accion<{ public_code: string; card_token: string | null; replayed: boolean }>('miembro.crear', {
        companyId,
        alias: alta.alias,
        phone: alta.phone,
        verified: alta.verificado,
        creationKey: alta.clave,
        via: 'caja',
      });
      setAlta({ ...alta, creado: { code: r.public_code, token: r.card_token } });
      const lista = await accion<MiembroCaja[]>('caja.buscar', { companyId, q: r.public_code });
      if (lista[0]) elegir(lista[0]);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  const umbral = m?.threshold ?? 0;
  const sello = selloValido((ajustes?.page_style as Partial<Estilo> | null)?.sello);
  const nombreDe = (x: MiembroCaja) => x.alias?.trim() || x.public_code;
  const cartilla = (x: MiembroCaja, saldo: number) =>
    x.rule_type !== 'points' && (x.threshold ?? 0) > 0 && (x.threshold ?? 0) <= 12 ? (
      <div className="fz-mo__sellos" role="img" aria-label={`${saldo} de ${x.threshold}`}>
        {Array.from({ length: x.threshold! }, (_, i) => (
          <span key={i} className={i < saldo ? 'lleno' : ''}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: trazoSello(i === x.threshold! - 1 ? 'regalo' : sello) }} />
          </span>
        ))}
      </div>
    ) : (
      <div className="fz-mo__puntos">
        <b>{saldo.toLocaleString('es-PE')}</b> <span>de {x.threshold ?? '—'} {x.rule_type === 'visits' ? 'visitas' : 'puntos'}</span>
        <div className="fz-barra"><i style={{ width: `${Math.max(0, Math.min(1, saldo / Math.max(1, x.threshold ?? 1))) * 100}%` }} /></div>
      </div>
    );
  const verbo = (x: MiembroCaja) => (x.rule_type === 'visits' ? 'Registrar visita' : x.rule_type === 'points' ? 'Sumar puntos' : 'Dar sello');

  // ── Pantallas del mostrador ────────────────────────────────────────────
  if (mostrador && hecho) {
    const r = hecho.r;
    const x = vistaDeLinea(r.member, linea);
    const meta = x.threshold ?? 0;
    const gano = hecho.tipo === 'registrar' && (r.rewards_issued ?? 0) > 0;
    return (
      <div className="fz-caja fz-mo">
        {gano ? (
          <div className="fz-mo__fin fz-mo__fin--premio" role="status">
            <Gift size={44} aria-hidden="true" />
            <h2>¡{nombreDe(x)} ganó {x.reward_description ?? 'su premio'}!</h2>
            <p>Entrégaselo ahora o en su siguiente visita: queda guardado en su tarjeta.</p>
            <div className="fz-col2">
              <button className="fz-gran fz-gran--sec" disabled={ocupado} onClick={() => canjear(x.rewards[0]?.id ?? null)}>
                Entregar ahora
              </button>
              <button className="fz-gran fz-gran--ghost" onClick={otroCliente}>
                Otro cliente
              </button>
            </div>
          </div>
        ) : (
          <div className="fz-mo__fin" role="status">
            <span className="fz-mo__ok"><Check size={34} aria-hidden="true" /></span>
            <h2>{etiquetaDe(x)}{hecho.tipo === 'canjear' ? 'Premio entregado' : r.kind === 'adjustment' ? `${x.bonus_label ?? 'Bono'}: +${r.units ?? 0}` : x.rule_type === 'points' ? `+${r.units ?? 0} puntos` : r.units ? (x.rule_type === 'visits' ? 'Visita registrada' : 'Sello puesto') : 'Registrado, sin sumar'}</h2>
            <p>
              {hecho.tipo === 'canjear'
                ? `A ${nombreDe(x)} le quedan ${x.rewards_available} premio(s).`
                : meta
                  ? `${nombreDe(x)} lleva ${x.balance} de ${meta}${x.period === 'month' ? ' este mes' : ''}.${x.rewards_available ? ` Tiene ${x.rewards_available} premio(s) por entregar.` : ''}`
                  : `${nombreDe(x)} lleva ${x.balance}.`}
            </p>
            {hecho.tipo === 'registrar' && cartilla(x, x.balance)}
            <div className="fz-col2">
              {hecho.tipo === 'registrar' && r.transaction_id && r.status === 'created' && r.kind !== 'adjustment' ? (
                <button className="fz-gran fz-gran--ghost" disabled={ocupado} onClick={() => void deshacer()}>
                  <Undo2 size={18} /> Deshacer
                </button>
              ) : <span />}
              <button className="fz-gran fz-gran--prim" onClick={otroCliente}>
                Otro cliente
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fz-caja">
      <div className="fz-fila" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <label className="check-inline" title="Pantalla grande para el mostrador: cartilla del cliente y un botón «Dar sello».">
          <input type="checkbox" checked={mostrador} onChange={(e) => cambiarMostrador(e.target.checked)} /> <MonitorSmartphone size={15} /> Modo mostrador
        </label>
      </div>
      {activas.length > 0 && (
        <div className="fz-campo">
          <label className="field-label" htmlFor="suc">
            Sucursal
          </label>
          <select id="suc" className="select" value={sucursal} onChange={(e) => elegirSucursal(e.target.value)}>
            <option value="">— Elige la sucursal —</option>
            {activas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {ultimo && (
        <div className={`fz-panel-aviso ${ultimo.tono === 'ok' ? 'fz-panel-aviso--ok' : ''}`} role="status" aria-live="polite">
          <b>Última operación:</b> {ultimo.texto}
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        {camara && <video ref={video} className="fz-video" playsInline muted aria-label="Cámara para leer el QR" />}
        <div className="fz-fila" style={{ marginTop: camara ? 10 : 0 }}>
          <input
            className="input fz-input-gran"
            style={{ flex: 1 }}
            placeholder="VDM-XXXXXX o teléfono"
            value={q}
            autoCapitalize="characters"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void buscar()}
            aria-label="Código de la tarjeta o teléfono"
          />
        </div>
        <div className="fz-col2" style={{ marginTop: 10 }}>
          <button className="fz-gran fz-gran--ghost" onClick={() => void buscar()} disabled={buscando || !q.trim()}>
            <Search size={18} /> {buscando ? 'Buscando…' : 'Buscar'}
          </button>
          {escanerPosible ? (
            <button className="fz-gran fz-gran--ghost" onClick={() => setCamara((c) => !c)}>
              {camara ? <CameraOff size={18} /> : <Camera size={18} />} {camara ? 'Cerrar cámara' : 'Escanear QR'}
            </button>
          ) : (
            <button className="fz-gran fz-gran--ghost" onClick={() => setAlta({ alias: '', phone: '', verificado: false, clave: nuevaClave() })}>
              <Plus size={18} /> Nuevo cliente
            </button>
          )}
        </div>
        {!escanerPosible && <p className="fz-def">Este navegador no puede usar la cámara (o la página no se abrió con https): escribe el código que sale bajo el QR.</p>}
        {escanerPosible && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setAlta({ alias: '', phone: '', verificado: false, clave: nuevaClave() })}>
            <Plus size={14} /> Nuevo cliente
          </button>
        )}
      </div>

      {candidatos.length > 1 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <b>Hay {candidatos.length} tarjetas con ese teléfono</b>
          <p className="fz-def">Elige la de la persona que tienes delante. No se unen solas: pueden ser dos personas.</p>
          <ul className="fz-lista">
            {candidatos.map((c) => (
              <li key={c.id}>
                <span>
                  <span className="fz-mono">{c.public_code}</span> {c.alias ?? ''}
                  {c.negocio && <span className="muted"> · {c.negocio.nombre}</span>}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => elegir(c)}>
                  Elegir
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {alta && (
        <div className="card" style={{ marginBottom: 14 }}>
          {alta.creado ? (
            <>
              <b>Tarjeta creada: <span className="fz-mono">{alta.creado.code}</span></b>
              {alta.creado.token ? (
                <>
                  <p className="fz-def">Que la persona escanee este QR con su teléfono para abrir y guardar su tarjeta. Solo se enseña ahora.</p>
                  <Qr valor={urlTarjeta(alta.creado.token)} tam={220} />
                </>
              ) : (
                <p className="fz-def">Ya estaba creada. Para darle el enlace, ábrela en Clientes y pulsa «Nuevo enlace de tarjeta».</p>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setAlta(null)}>
                Cerrar
              </button>
            </>
          ) : (
            <>
              <b>Nuevo cliente</b>
              <div className="fz-campo" style={{ marginTop: 10 }}>
                <label className="field-label">Nombre (opcional)</label>
                <input className="input" maxLength={40} value={alta.alias} onChange={(e) => setAlta({ ...alta, alias: e.target.value })} />
              </div>
              <div className="fz-campo">
                <label className="field-label">Teléfono (opcional)</label>
                <input className="input" inputMode="tel" placeholder="+51 9…" value={alta.phone} onChange={(e) => setAlta({ ...alta, phone: e.target.value })} />
                <small>Sirve para encontrarle en caja. Dos personas pueden dar el mismo: no se unen.</small>
              </div>
              {alta.phone.trim() && (
                <label className="check-inline" style={{ display: 'block', marginBottom: 12 }}>
                  <input type="checkbox" checked={alta.verificado} onChange={(e) => setAlta({ ...alta, verificado: e.target.checked })} /> He comprobado en persona que el teléfono es suyo
                </label>
              )}
              <div className="fz-fila">
                <button className="btn btn-primary" disabled={ocupado} onClick={() => void crearCliente()}>
                  Crear tarjeta
                </button>
                <button className="btn btn-ghost" onClick={() => setAlta(null)}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {m?.negocio && (
        <div className="card">
          <div className="fz-miembro">
            <div>
              <div className="fz-mono" style={{ fontWeight: 800 }}>{m.public_code}</div>
              <div className="muted">{m.alias ?? 'Sin nombre'}</div>
            </div>
            <span className="badge-pill">Tarjeta de {m.negocio.nombre}</span>
          </div>
          {m.rewards.filter(entregableFuera).length ? (
            <ul className="fz-lista" style={{ marginTop: 12 }}>
              {m.rewards.filter(entregableFuera).map((r) => (
                <li key={r.id}>
                  <span><Gift size={16} aria-hidden="true" /> {r.description}</span>
                  <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => canjear(r.id)}>
                    Entregar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fz-def" style={{ marginTop: 12 }}>No tiene nada que recoger aquí.</p>
          )}
          {m.rewards.some((r) => !entregableFuera(r)) && (
            <p className="fz-def">
              {m.rewards.filter((r) => !entregableFuera(r)).map((r) => r.description).join(' · ')}: se usa en {m.negocio.nombre}.
            </p>
          )}
          <p className="fz-def">Aquí solo se entregan sus premios. Las visitas y los sellos se suman en {m.negocio.nombre}.</p>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={otroCliente}>Otro cliente</button>
        </div>
      )}

      {persona && !persona.negocio && (persona.lines?.length ?? 0) > 1 && (
        <div className="fz-lineas" role="radiogroup" aria-label="¿Qué se le suma?">
          {persona.lines!.map((l) => {
            const activa = l.main ? !m?.programId : m?.programId === l.program_id;
            return (
              <button
                key={l.program_id}
                type="button"
                role="radio"
                aria-checked={activa}
                className={`fz-linea${activa ? ' activa' : ''}`}
                disabled={ocupado || l.status !== 'active'}
                onClick={() => elegirLinea(l.main ? null : l.program_id)}
              >
                <b>{l.label}</b>
                <small>
                  {l.balance} / {l.threshold ?? '—'}
                  {l.period === 'month' ? ' este mes' : ''}
                  {l.rewards_available ? ` · ${l.rewards_available} premio${l.rewards_available === 1 ? '' : 's'}` : ''}
                </small>
              </button>
            );
          })}
        </div>
      )}

      {m && !m.negocio && mostrador && m.status === 'active' && (
        <div className="card fz-mo">
          <div className="fz-mo__quien">
            <span className="fz-mo__avatar"><UserRound size={26} aria-hidden="true" /></span>
            <div>
              <b>{nombreDe(m)}</b>
              <small className="fz-mono">{m.public_code}</small>
            </div>
          </div>
          {cartilla(m, m.balance)}
          {umbral > 0 && (
            <p className="fz-mo__falta">
              {m.balance >= umbral ? (m.period === 'month' ? 'Ya llegó al nivel más alto del mes' : 'Ya llegó a la meta') : <>Le falta{umbral - m.balance === 1 ? '' : 'n'} <b>{umbral - m.balance}</b> para <b>{m.reward_description}</b>{m.period === 'month' ? ' (este mes)' : ''}</>}
            </p>
          )}
          {m.rewards_available > 0 && (
            <div className="fz-mo__aviso-premio">
              <Gift size={20} aria-hidden="true" /> <span>Tiene {m.rewards_available === 1 ? 'un premio' : `${m.rewards_available} premios`}: <b>{m.rewards[0]?.description ?? m.reward_description}</b></span>
              <button className="btn btn-sm" disabled={ocupado || (activas.length > 0 && !sucursal)} onClick={() => canjear(m.rewards[0]?.id ?? null)}>Entregar</button>
            </div>
          )}
          {m.rule_type === 'points' && (
            <input className="input fz-input-gran" inputMode="decimal" placeholder="Importe S/ 0,00" aria-label="Importe de la compra" value={importe} onChange={(e) => setImporte(e.target.value)} style={{ marginBottom: 10 }} />
          )}
          {ajustes?.require_external_ref && (
            <input className="input" maxLength={64} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="N.º de comprobante" aria-label="Número de comprobante" style={{ marginBottom: 10 }} />
          )}
          <button className="fz-gran fz-gran--prim fz-mo__dar" disabled={ocupado || (activas.length > 0 && !sucursal)} onClick={registrar}>
            {ocupado ? 'Un momento…' : verbo(m)}
          </button>
          {!!m.bonus_units && (
            <button className="fz-gran fz-gran--sec" style={{ marginTop: 10, width: '100%' }} disabled={ocupado} onClick={bono}>
              {m.bonus_label} +{m.bonus_units}
            </button>
          )}
          {activas.length > 0 && !sucursal && <p className="fz-def">Elige la sucursal arriba para poder operar.</p>}
          {pendiente && !ocupado && (
            <div className="fz-panel-aviso fz-panel-aviso--error" role="alert" style={{ marginTop: 12 }}>
              <span style={{ flex: 1 }}>No llegó la confirmación. Nada se ha dado por hecho.</span>
              <button className="btn btn-primary btn-sm" onClick={() => void enviar(pendiente)}>Reintentar</button>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={otroCliente}>Otro cliente</button>
        </div>
      )}

      {m && !m.negocio && !(mostrador && m.status === 'active') && (
        <div className="card">
          <div className="fz-miembro">
            <div>
              <div className="fz-mono" style={{ fontWeight: 800 }}>
                {m.public_code}
              </div>
              <div className="muted">{m.alias ?? 'Sin nombre'}</div>
              {m.status !== 'active' && <span className="badge-pill b-hot">Suspendida</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="fz-saldo">{m.balance.toLocaleString('es-PE')}</div>
              <div className="muted">{m.rule_type ? unidades(m.balance, m.rule_type).replace(/^[-\d.,\s]+/, '') : ''}</div>
            </div>
          </div>
          {umbral > 0 && (
            <>
              <div className="fz-barra">
                <i style={{ width: `${Math.max(0, Math.min(1, m.balance / umbral)) * 100}%` }} />
              </div>
              <p className="fz-def">
                {m.period === 'month' ? `Este mes · siguiente nivel con ${umbral}: ` : `Premio con ${umbral}: `}
                {m.reward_description}
              </p>
            </>
          )}

          {m.status === 'active' && (
            <>
              {m.rule_type !== 'visits' && (
                <div className="fz-campo" style={{ marginTop: 12 }}>
                  <label className="field-label" htmlFor="imp">
                    Importe (S/){m.rule_type === 'stamps' ? ' — opcional si no hay compra mínima' : ''}
                  </label>
                  <input id="imp" className="input fz-input-gran" inputMode="decimal" placeholder="0,00" value={importe} onChange={(e) => setImporte(e.target.value)} />
                  {importe && aCentimos(importe) !== null && <small>{soles(aCentimos(importe))}</small>}
                </div>
              )}
              <div className="fz-campo">
                <label className="field-label" htmlFor="ref">
                  N.º de comprobante {ajustes?.require_external_ref ? '' : '(opcional)'}
                </label>
                <input id="ref" className="input" maxLength={64} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="B001-000123" />
                <small>Si se pone, la misma venta no se puede registrar dos veces.</small>
              </div>
              <div className="fz-col2">
                <button className="fz-gran fz-gran--prim" disabled={ocupado || (activas.length > 0 && !sucursal)} onClick={registrar}>
                  <ShoppingBag size={20} /> {m.rule_type === 'visits' ? 'Registrar visita' : 'Registrar compra'}
                </button>
                <button
                  className="fz-gran fz-gran--sec"
                  disabled={ocupado || m.rewards_available === 0 || (activas.length > 0 && !sucursal)}
                  onClick={() => canjear(m.rewards[0]?.id ?? null)}
                >
                  <Gift size={20} /> Canjear{m.rewards_available ? ` (${m.rewards_available})` : ''}
                </button>
              </div>
              {!!m.bonus_units && (
                <button className="fz-gran fz-gran--ghost" style={{ marginTop: 10, width: '100%' }} disabled={ocupado} onClick={bono}>
                  {m.bonus_label} +{m.bonus_units}
                </button>
              )}
              {activas.length > 0 && !sucursal && <p className="fz-def">Elige la sucursal arriba para poder operar.</p>}
              {m.rewards.length > 1 && (
                <ul className="fz-lista" style={{ marginTop: 10 }}>
                  {m.rewards.map((r) => (
                    <li key={r.id}>
                      <span>{r.description}</span>
                      <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => canjear(r.id)}>
                        Canjear este
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {pendiente && !ocupado && (
            <div className="fz-panel-aviso fz-panel-aviso--error" role="alert" style={{ marginTop: 12 }}>
              <span style={{ flex: 1 }}>No llegó la confirmación de la última operación. Nada se ha dado por hecho.</span>
              <button className="btn btn-primary btn-sm" onClick={() => void enviar(pendiente)}>
                Reintentar
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPendiente(null)}>
                Descartar
              </button>
            </div>
          )}
          {puede('members.read') && (
            <Link className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} href={`/panel/fideliza/clientes/${(persona ?? m).id}`}>
              Ver ficha
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
