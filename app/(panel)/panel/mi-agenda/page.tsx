'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MI AGENDA · lo que ve el empleado (barbero, estilista, profesor)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Es una pantalla aparte de la Agenda, y no una Agenda «recortada», por una
 * razón concreta: aquella lee `leads`, `employees` y `companies`, y tras el
 * corte de roles esas tablas le devuelven CERO filas al empleado. Esta lee lo
 * que sí le toca (lib/supabase/queries.ts, «Lo que lee el empleado»).
 *
 * ── Qué ve (Alvaro, 13-oct-2026) ─────────────────────────────────────────
 *
 *   · Sus citas, y las que no tienen a nadie asignado. Una cita sin empleado la
 *     ven TODOS, marcada «Sin asignar», hasta que alguien la asigne.
 *   · Del cliente: el nombre, las notas del salón, las notas de Mia y los
 *     campos propios que el dueño marcó «Lo ve el empleado». Nada de contacto.
 *   · No cobra: marca «vino» o «no vino». El cobro lo apunta la caja.
 *     Salvo que el negocio lo haya pedido (datos 0012, Alvaro 12-nov-2026): con
 *     «los empleados cobran» encendido —lo enciende Vendemia, apagado de serie—
 *     sale «Cobrar S/ X» en lo que tenga saldo. Cobra lo que falta, exacto, y
 *     siempre con foto, también en efectivo. Postgres lo vuelve a comprobar todo.
 *
 * ── Cómo se ve (Alvaro, 27-oct-2026: «práctica, intuitiva») ──────────────
 *
 * Pensada para el celular, con una mano, y con las piezas del panel (no con
 * las de la app que sirvió de modelo): la semana con el calendario de siempre
 * (.cal), y el día como lista de filas dentro de una tarjeta, cada cita con su
 * sello (badge-pill) y los mismos Vino / No vino de la Agenda del dueño. Nada
 * de resúmenes ni de números del negocio: al barbero el Dashboard no le sirve.
 *
 * Los avisos al celular (modules/avisos, 0004) abren esta pantalla con
 * `?dia=AAAA-MM-DD&cita=<id>`: cae en ese día y con esa cita marcada. El aviso
 * RECARGA la página (public/panel-sw.js), así que no hace falta sondear: lo
 * que se ve al tocarlo es lo de ahora. Al volver a la app desde otra, se
 * relee una vez.
 *
 * En una academia los grupos no tienen profesor asignado, así que todos salen
 * «Sin asignar» y los ven todos los profesores: horarios, cupos y alumnos, sin
 * importes. Es la misma regla, no una aparte.
 *
 * ⚠️ El filtro de abajo (`esMia`) repite lo que hará el RLS. No es la barrera:
 * existe para que la pantalla enseñe lo mismo antes y después del corte, y para
 * que nadie vea de más el rato que las dos cosas no estén sincronizadas.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Banknote, Check, ChevronLeft, ChevronRight, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import Topbar from '@/components/panel/Topbar';
import AvisosDelEquipo from '@/components/panel/AvisosDelEquipo';
import QrDelClub from '@/components/panel/QrDelClub';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import FotoDelPago from '@/components/panel/FotoDelPago';
import { supabase } from '@/lib/supabase/client';
import { fotoParaCobro, type FotoPago } from '@/lib/panel/fotoPago';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import { esRecurrente } from '@/lib/panel/modo';
import { hora, isoLocal, soles } from '@/lib/panel/format';
import { pideRevision, selloCumplido } from '@/lib/panel/confirmacion';
import { vocabulario } from '@/lib/panel/vocabulario';
import { claveGrupo, hoyLima, ocupa, reservando } from '@/lib/panel/inscripciones';
import { quienDeCita } from '@/lib/panel/ficha';
import { calcularComisiones } from '@/lib/panel/comisiones';
import {
  getCatalogoDelEquipo,
  getCitasDelPeriodo,
  getComisionesCongeladas,
  getEquipoFichas,
  getInscripcionesVivas,
  getServiciosDeCitas,
  getMiNegocio,
  getMisClientes,
  type Cita,
  type ClienteDelEquipo,
  type MiNegocio,
} from '@/lib/supabase/queries';
import type { FranjaRecurrente } from '@/lib/supabase/types';

export default function MiAgendaPagina() {
  return (
    <Suspense fallback={<main className="main"><div className="wrap"><p className="vacio">Cargando tu agenda…</p></div></main>}>
      <MiAgenda />
    </Suspense>
  );
}

function MiAgenda() {
  const { companyId, compania } = useSesion();
  if (!companyId) return null;
  return esRecurrente(compania?.business_mode) ? (
    <MisClases companyId={companyId} />
  ) : (
    <MisCitas companyId={companyId} />
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

const DIA_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const cap = (t: string) => t.replace(/^./, (l) => l.toUpperCase());

const deIso = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const sumarDias = (iso: string, n: number) => {
  const d = deIso(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};
/** El lunes de la semana de ese día. */
const lunesDe = (iso: string) => sumarDias(iso, -((deIso(iso).getDay() + 6) % 7));

const duracion = (min: number) => (min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} h ${min % 60}` : `${min / 60} h`);

/** Cuánto dura: lo que diga la cita, o lo que haya entre su inicio y su fin. */
function minutosDe(c: Cita): number {
  if (c.slot_minutes && c.slot_minutes > 0) return c.slot_minutes;
  const fin = c.slot_end ? new Date(c.slot_end.replace(' ', 'T')) : null;
  if (c.inicio && fin && !Number.isNaN(fin.getTime())) return Math.max(0, Math.round((fin.getTime() - c.inicio.getTime()) / 60000));
  return 0;
}

/**
 * El sello de la cita, con las palabras y los colores del resto del panel: lo
 * que ya pasó sale de `selloCumplido` (Vino, No vino, Presunta, Sin resolver),
 * igual que en la Agenda del dueño. Lo que viene es solo de esta pantalla.
 */
function selloDe(c: Cita, ahora: number, esProxima: boolean, palabra = 'cita'): { label: string; color: string; enCurso: boolean } {
  if (c.status === 'pending_payment') return { label: 'Esperando pago', color: '#B26B00', enCurso: false };
  const inicio = c.inicio?.getTime() ?? 0;
  const fin = inicio + Math.max(minutosDe(c), 15) * 60000;
  if (c.status === 'confirmed' && inicio <= ahora && ahora < fin) return { label: 'En curso', color: '#CC3A00', enCurso: true };
  if (c.status !== 'confirmed' || fin <= ahora) {
    const s = selloCumplido('appointment', c.status, c.cumplido_por);
    return { label: s.label, color: s.color, enCurso: false };
  }
  // «Cita agendada», no «Próxima» ni «Confirmada» (23-nov-2026, Alvaro): dice que está en pie.
  // La más cercana sigue en naranja para que se vea cuál viene.
  const label = `${palabra[0].toUpperCase()}${palabra.slice(1)} agendad${palabra === 'pedido' ? 'o' : 'a'}`;
  return { label, color: esProxima ? '#CC3A00' : '#93938C', enCurso: false };
}

function MisCitas({ companyId }: { companyId: string }) {
  const comando = useComando();
  const { compania, canchas, cobroFoto, rol } = useSesion();
  // ¿Este negocio deja cobrar a sus empleados? (datos 0012). Con la agenda del bot, no.
  const cobra = Boolean(cobroFoto?.empleadoCobra && cobroFoto.nube);
  // Las apartadas (esperando el adelanto) confunden al barbero (23-nov-2026, Alvaro): se ven solo
  // si el negocio lo encendió (datos 0029). El dueño y el administrador, siempre. Con 'con_captura'
  // (datos 0030, 24-nov) también las que ya mandaron la captura: mi_adelantos dice cuáles.
  const vePorPagar = rol === 'dueno' || rol === 'admin' || cobroFoto?.equipoVePorPagar === true;
  const veConCaptura = !vePorPagar && cobroFoto?.equipoVeApartadas === 'con_captura';
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [sinCita, setSinCita] = useState(false);
  const v = vocabulario(compania?.business_mode, { canchas });
  const palabra = v.reserva === 'pedido' ? 'reserva' : v.reserva;
  const palabras = v.reserva === 'pedido' ? 'reservas' : v.reservas;
  const params = useSearchParams();
  const hoy = isoLocal(new Date());
  const pedido = params.get('dia');
  const foco = params.get('cita');
  const [dia, setDia] = useState(pedido && ISO.test(pedido) ? pedido : hoy);
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  // El reloj de la pantalla: «En curso» y «Sin resolver» cambian solos con la hora.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Otro aviso con la app ya en esta pantalla: la URL cambia, el día también.
  useEffect(() => {
    if (pedido && ISO.test(pedido)) setDia(pedido);
  }, [pedido]);

  const lunes = lunesDe(dia);
  const { datos, cargando, error, releer } = useCargar(async () => {
    const [negocio, todas, clientes] = await Promise.all([
      getMiNegocio(companyId),
      getCitasDelPeriodo(companyId, lunes, sumarDias(lunes, 6)),
      getMisClientes(companyId),
    ]);
    // De las apartadas, cuánto falta del adelanto (datos 0029). Sin la 0029, sin detalle.
    // Con 'con_captura', la base solo devuelve las que ya mandaron captura: esas son las que se ven.
    const apartadas = vePorPagar || veConCaptura ? todas.filter((c) => c.status === 'pending_payment').map((c) => c.id) : [];
    let adelantos: Record<string, Adelanto> = {};
    if (apartadas.length) {
      const { data, error } = await supabase().rpc('mi_adelantos', { p_company: companyId, p_ids: apartadas });
      if (!error && data) adelantos = data as Record<string, Adelanto>;
    }
    const citas = vePorPagar ? todas : todas.filter((c) => c.status !== 'pending_payment' || (veConCaptura && c.id in adelantos));
    // Lo que falta en cada una: solo si cobra, y la base decide cuáles le tocan.
    // Sus citas: el precio de cada una y lo que gana (19-nov, The 24/7: «que en los barberos
    // aparezcan las citas y el precio de los cortes, y su monto actualizado por cada cita cobrada»).
    const suFicha = negocio?.tu_ficha ?? null;
    const idsMias = suFicha ? citas.filter((c) => c.employee_id === suFicha).map((c) => c.id) : [];
    const [lineas, congeladas] = idsMias.length
      ? await Promise.all([getServiciosDeCitas(idsMias), getComisionesCongeladas(idsMias)]).catch(() => [[], []] as const)
      : ([[], []] as const);
    // Su % en CADA vuelta: si el dueño se lo cambia, lo que gana se recalcula en 30 s, sin recargar.
    const pct = suFicha
      ? await getEquipoFichas(companyId).then((f) => Number(f.find((x) => x.es_la_tuya)?.comision_pct ?? 0)).catch(() => null)
      : null;
    let saldos: Record<string, number> = {};
    if (cobra && citas.length) {
      const { data, error } = await supabase().rpc('empleado_saldos', { p_company: companyId, p_ids: citas.map((c) => c.id) });
      if (!error && data) {
        saldos = Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, n]) => [k, Number(n)]));
      }
    }
    return { lunes, negocio, citas, clientes, saldos, adelantos, lineas: [...lineas], congeladas: [...congeladas], pct };
  }, [companyId, lunes, cobra, vePorPagar, veConCaptura]);

  // Lo que casi no cambia: el catálogo (tarifas y qué es producto). Se relee cada 5 min.
  const fijos = useCargar(async () => ({ catalogo: await getCatalogoDelEquipo(companyId) }), [companyId]);
  useSondeo(fijos.releer, 300_000);

  // Sin recargar: una cita nueva de la página, una que le asignan o una que la caja cobra
  // aparece sola, con lo que gana ya sumado (cada 30 s).
  useSondeo(releer, 30_000);

  // Al volver a la app desde WhatsApp u otra: lo de ahora, sin esperar a nada.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        setAhora(Date.now());
        releer();
      }
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [releer]);

  const ficha = datos?.negocio?.tu_ficha ?? null;

  // Por cita: el precio de sus servicios (sin productos) y, si ya la atendió, su parte. La MISMA
  // cuenta que Mi comisión y que el dueño (calcularComisiones): aquí no se calcula aparte.
  const importes = useMemo(() => {
    const m = new Map<string, { precio: number; tuParte: number | null }>();
    if (!datos || !ficha) return m;
    const catalogo = fijos.datos?.catalogo ?? [];
    const producto = new Set(catalogo.filter((i) => i.tipo === 'producto').map((i) => i.id));
    for (const l of datos.lineas) {
      if (producto.has(l.catalog_item_id ?? '')) continue;
      const x = m.get(l.appointment_id) ?? { precio: 0, tuParte: null };
      x.precio += Number(l.price ?? 0);
      m.set(l.appointment_id, x);
    }
    const r = calcularComisiones(
      datos.citas.filter((c) => c.employee_id === ficha),
      datos.lineas,
      catalogo,
      [{ id: ficha, comision_pct: datos.pct ?? 0 }],
      new Date(),
      datos.congeladas,
    );
    for (const p of r.profesionales) {
      for (const l of p.lineas) {
        const x = m.get(l.cita.id) ?? { precio: 0, tuParte: null };
        x.tuParte = Math.round(((x.tuParte ?? 0) + l.comision) * 100) / 100;
        m.set(l.cita.id, x);
      }
    }
    return m;
  }, [datos, fijos.datos, ficha]);

  const cliente = useMemo(() => new Map((datos?.clientes ?? []).map((c) => [c.lead_id, c])), [datos]);

  // Las de la semana que me tocan: mías y sin asignar. Solo de la semana cargada:
  // al cambiar de semana, lo anterior no se queda pintado.
  const semana = useMemo(
    () =>
      (datos?.lunes === lunes ? datos.citas : []).filter(
        (c) => c.status !== 'cancelled' && (!c.employee_id || c.employee_id === ficha),
      ),
    [datos, lunes, ficha],
  );
  const delDia = semana.filter((c) => c.slot_start.slice(0, 10) === dia);
  const proxima = delDia.find(
    (c) => c.status === 'confirmed' && c.inicio !== null && c.inicio.getTime() > ahora && dia >= hoy,
  );

  // La cita del aviso: a la vista y marcada un momento.
  const marcada = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (foco && marcada.current) marcada.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [foco, datos]);

  async function marcar(c: Cita, vino: boolean) {
    setEnVuelo(c.id);
    // «Atendido» manda al cliente a la caja: allí sale en «Listos para cobrar» con tu nombre.
    await comando(
      'marcar_cumplido',
      { tipo: 'appointment', id: c.id, vino },
      vino ? (c.pagado_por ? 'Anotado: atendido.' : 'Atendido: ya sale en Caja para cobrar, con tu nombre.') : 'Anotado: no vino.',
      releer,
    );
    setEnVuelo(null);
  }

  const elegido = deIso(dia);
  const titulo = cap(`${dia === hoy ? 'hoy, ' : ''}${DIA_LARGO[elegido.getDay()]} ${elegido.getDate()} de ${MES_LARGO[elegido.getMonth()]}`);
  const porAtender = delDia.filter((c) => c.status === 'confirmed' || c.status === 'pending_payment').length;
  const atendidasDia = delDia.filter((c) => importes.get(c.id)?.tuParte != null);
  const ganadoDia = atendidasDia.reduce((t, c) => t + (importes.get(c.id)?.tuParte ?? 0), 0);
  const cobradoDia = atendidasDia.reduce((t, c) => t + (importes.get(c.id)?.precio ?? 0), 0);

  return (
    <main className="main">
      <div className="wrap mag">
        <Topbar titulo="Mi agenda" sub={`Tus ${palabras} y las que aún no tienen a nadie`} />

        <AvisosDelEquipo companyId={companyId} />

        {/* El QR del club de Fideliza, para enseñárselo al cliente en la silla (20-nov-2026). */}
        <QrDelClub companyId={companyId} />

        {/* La semana, con el calendario del panel (.cal): hoy relleno, un punto en los días con citas. */}
        <section className="card mag-semana" aria-label="Semana">
          <div className="cal-head">
            <b>
              {cap(MES_LARGO[elegido.getMonth()])} {elegido.getFullYear()}
            </b>
            <div className="cal-nav">
              {dia !== hoy && (
                <button type="button" className="mag-hoy" onClick={() => setDia(hoy)}>
                  Hoy
                </button>
              )}
              <button type="button" onClick={() => setDia(sumarDias(dia, -7))} aria-label="Semana anterior">
                <ChevronLeft />
              </button>
              <button type="button" onClick={() => setDia(sumarDias(dia, 7))} aria-label="Semana siguiente">
                <ChevronRight />
              </button>
            </div>
          </div>
          <div className="cal">
            {DIA_CORTO.map((letra) => (
              <div key={letra} className="dow">
                {letra}
              </div>
            ))}
            {DIA_CORTO.map((_, i) => {
              const d = sumarDias(lunes, i);
              const cuantas = semana.filter((c) => c.slot_start.slice(0, 10) === d).length;
              return (
                <button
                  key={d}
                  type="button"
                  className={`day${d === hoy ? ' today' : ''}${d === dia ? ' sel' : ''}${cuantas ? ' mark' : ''}`}
                  onClick={() => setDia(d)}
                  aria-pressed={d === dia}
                  aria-label={`${DIA_LARGO[deIso(d).getDay()]} ${deIso(d).getDate()}${cuantas ? `, ${cuantas} ${cuantas === 1 ? palabra : palabras}` : ''}`}
                >
                  {deIso(d).getDate()}
                </button>
              );
            })}
          </div>
        </section>

        {error && <p className="vacio">No se pudo cargar tu agenda: {error}</p>}

        {datos && !ficha && (
          <p className="equipo-aviso">
            <b>Todavía no tienes una ficha enlazada.</b> Por eso solo ves las {palabras} sin asignar. Pídele al dueño o al
            administrador que te la ponga en Ajustes › Acceso del equipo.
          </p>
        )}

        {ficha && atendidasDia.length > 0 && (
          <section className="card mag-ganado" aria-label="Lo que ganaste este día" aria-live="polite">
            <small>{dia === hoy ? 'Hoy llevas' : 'Este día ganaste'}</small>
            <b>{soles(ganadoDia)}</b>
            <span>
              {atendidasDia.length} {atendidasDia.length === 1 ? 'atendida' : 'atendidas'} · {soles(cobradoDia)} en servicios ·{' '}
              <Link href="/panel/mi-comision">Mi comisión</Link>
            </span>
          </section>
        )}

        <section className="card mia-grupo">
          <div className="card-mini-head">
            <h3>{titulo}</h3>
            {datos && delDia.length > 0 && (
              <span className="badge-pill b-mute">
                {porAtender > 0 && porAtender !== delDia.length
                  ? `${porAtender} por atender`
                  : `${delDia.length} ${delDia.length === 1 ? palabra : palabras}`}
              </span>
            )}
            {/* Quien llega sin cita: solo hoy y con ficha (tu-pagina 0026). Así ocupa su silla. */}
            {datos && ficha && dia === hoy && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSinCita(true)}>
                <UserPlus size={14} /> Llegó sin cita
              </button>
            )}
          </div>
          {sinCita && (
            <LlegoSinCita
              companyId={companyId}
              alCerrar={() => setSinCita(false)}
              alListo={() => {
                setSinCita(false);
                releer();
              }}
            />
          )}
          {cargando && !datos ? (
            <p className="vacio">Cargando tu agenda…</p>
          ) : delDia.length === 0 ? (
            <p className="vacio">No tienes {palabras} este día.</p>
          ) : (
            delDia.map((c) => (
              <FilaCita
                key={c.id}
                filaRef={c.id === foco ? marcada : undefined}
                c={c}
                sello={selloDe(c, ahora, c.id === proxima?.id, palabra)}
                enFoco={c.id === foco}
                cliente={cliente.get(c.lead_id)}
                negocio={datos?.negocio ?? null}
                ocupado={enVuelo === c.id}
                alMarcar={marcar}
                falta={datos?.saldos[c.id] ?? 0}
                adelanto={c.status === 'pending_payment' ? datos?.adelantos[c.id] : undefined}
                importe={c.employee_id === ficha ? importes.get(c.id) : undefined}
                cobrando={cobrando === c.id}
                alCobrar={(abrir) => setCobrando(abrir ? c.id : null)}
                companyId={companyId}
                alCobrado={() => {
                  setCobrando(null);
                  releer();
                }}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function FilaCita({
  filaRef,
  c,
  sello,
  enFoco,
  cliente,
  negocio,
  ocupado,
  alMarcar,
  falta,
  adelanto,
  importe,
  cobrando,
  alCobrar,
  companyId,
  alCobrado,
}: {
  filaRef?: React.Ref<HTMLDivElement>;
  c: Cita;
  sello: { label: string; color: string; enCurso: boolean };
  enFoco: boolean;
  cliente: ClienteDelEquipo | undefined;
  negocio: MiNegocio | null;
  ocupado: boolean;
  alMarcar: (c: Cita, vino: boolean) => void;
  /** Lo que le falta pagar; 0 = nada que cobrar, o este negocio no deja cobrar al empleado. */
  falta: number;
  /** De una apartada: el total, lo pagado y el adelanto que la confirma (datos 0029). */
  adelanto?: Adelanto;
  /** El precio de sus servicios y, ya atendida, lo que gana él. Solo en las suyas. */
  importe?: { precio: number; tuParte: number | null };
  cobrando: boolean;
  alCobrar: (abrir: boolean) => void;
  companyId: string;
  alCobrado: () => void;
}) {
  // Se puede decir si vino de una cita que ya empezó y sigue «confirmada», y
  // corregir lo que cerró el reloj sin que nadie lo mirara (Presunta), como en la
  // Agenda del dueño.
  const empezo = c.inicio !== null && c.inicio.getTime() <= Date.now();
  const porMarcar =
    empezo && (c.status === 'confirmed' || pideRevision(selloCumplido('appointment', c.status, c.cumplido_por)));
  const quien = quienDeCita(c, cliente?.name?.trim());
  const min = minutosDe(c);
  return (
    <div ref={filaRef} className={`mia-fila${sello.enCurso ? ' mia-fila--ahora' : ''}${enFoco ? ' mia-fila--foco' : ''}`}>
      <span className="mia-hora">
        {c.inicio ? hora(c.inicio) : '—'}
        {min > 0 && <small>{duracion(min)}</small>}
      </span>
      <div className="mia-quien">
        <div className="mia-sellos">
          <span className="badge-pill" style={{ color: sello.color, background: `${sello.color}18` }}>
            {sello.label}
          </span>
          {!c.employee_id && <span className="mia-sin">Sin asignar</span>}
          {/* Lo que ya atendió: ¿pasó por caja? Así sabe si su cliente pagó. */}
          {c.status === 'completed' && (
            c.pagado_por
              ? <span className="badge-pill" style={{ color: '#0B7A4B', background: '#0FA96818' }}>Cobrado</span>
              : <span className="badge-pill" style={{ color: '#C2410C', background: '#C2410C18' }}>En caja · por cobrar</span>
          )}
        </div>
        <b>{c.service || 'Sin servicio indicado'}</b>
        {importe && importe.precio > 0 && (
          <span className="mia-importe">
            {soles(importe.precio)}
            {importe.tuParte != null && <> · <b>Tu parte {soles(importe.tuParte)}</b></>}
          </span>
        )}
        {adelanto && <DetalleAdelanto a={adelanto} />}
        <small>{quien.nombre}</small>
        {quien.deQuien && <small>{quien.deQuien}</small>}
        {c.sede && <small>{c.sede}</small>}
        <NotasDelCliente cliente={cliente} negocio={negocio} />
      </div>
      {(porMarcar || (falta > 0 && !cobrando)) && (
        <div className="mia-acciones">
          {porMarcar && (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => alMarcar(c, true)}>
                <Check size={14} /> Atendido
              </button>
              <button type="button" className="btn btn-ghost btn-sm confirmar-no" disabled={ocupado} onClick={() => alMarcar(c, false)}>
                <X size={14} /> No vino
              </button>
            </>
          )}
          {falta > 0 && !cobrando && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => alCobrar(true)}>
              <Banknote size={14} /> Cobrar {soles(falta)}
            </button>
          )}
        </div>
      )}
      {cobrando && falta > 0 && (
        <CobrarSaldo companyId={companyId} cita={c} falta={falta} alCerrar={() => alCobrar(false)} alListo={alCobrado} />
      )}
    </div>
  );
}

/** Lo que devuelve mi_adelantos por cita (datos 0029). */
interface Adelanto {
  total: number;
  pagado: number;
  /** Lo que la confirma: % del precio en citas, fijo en canchas. 0 = cualquier pago. */
  adelanto: number;
  /** El cliente mandó la captura y nadie la ha aprobado aún (datos 0030). */
  por_revisar?: boolean;
}

/** «Falta el adelanto: S/ 10 de S/ 30», o lo que haya pagado. Para que el barbero sepa qué espera. */
function DetalleAdelanto({ a }: { a: Adelanto }) {
  const pagado = Number(a.pagado) || 0;
  const adelanto = Number(a.adelanto) || 0;
  const falta = Math.max(Math.round((adelanto - pagado) * 100) / 100, 0);
  // Mandó la captura y nadie la ha mirado (datos 0030): eso es lo que tiene que saber el barbero.
  const texto = a.por_revisar && falta > 0
    ? `Mandó la captura del adelanto${adelanto > 0 ? ` (${soles(adelanto)})` : ''}: falta que la aprueben`
    : adelanto <= 0
    ? pagado > 0 ? `Pagó ${soles(pagado)}: falta que la confirmen` : 'Aún no paga nada'
    : falta > 0
      ? pagado > 0
        ? `Pagó ${soles(pagado)} · faltan ${soles(falta)} del adelanto de ${soles(adelanto)}`
        : `Falta el adelanto: ${soles(adelanto)}${Number(a.total) > adelanto ? ` de ${soles(Number(a.total))}` : ''}`
      : `Pagó el adelanto (${soles(pagado)}): falta que la confirmen`;
  return <span className="mia-adelanto">{texto}</span>;
}

const METODOS_EMPLEADO = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'yape', label: 'Yape' },
  { id: 'plin', label: 'Plin' },
] as const;

/**
 * El empleado cobra lo que falta (datos 0012). Sin campo de importe: es lo que
 * falta, ni más ni menos, y la base lo vuelve a calcular. La foto es obligatoria
 * siempre: del Yape o Plin, o del dinero si fue en efectivo. Queda a su nombre
 * en la Caja («Cobró Juan»).
 */
function CobrarSaldo({ companyId, cita, falta, alCerrar, alListo }: {
  companyId: string;
  cita: Cita;
  falta: number;
  alCerrar: () => void;
  alListo: () => void;
}) {
  const avisar = useAvisar();
  const [metodo, setMetodo] = useState<'cash' | 'yape' | 'plin'>('cash');
  const [foto, setFoto] = useState<FotoPago | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function alFoto(f: FotoPago | null) {
    setFoto(f);
    // Si la foto es de un Yape o un Plin, el método sale de ella.
    if (f && (f.metodo === 'yape' || f.metodo === 'plin')) setMetodo(f.metodo);
  }

  async function cobrar() {
    if (!foto) return;
    setEnviando(true);
    const { error } = await supabase().rpc('empleado_cobrar_saldo', {
      p_company: companyId,
      p_appointment: cita.id,
      p_metodo: metodo,
      p_foto: fotoParaCobro(foto),
    });
    setEnviando(false);
    if (error) {
      avisar(error.message, 'error');
      return;
    }
    avisar(`Cobro anotado: ${soles(falta)}`, 'ok');
    alListo();
  }

  const otroMonto = foto?.monto != null && Math.abs(foto.monto - falta) >= 0.01;
  return (
    <div className="mag-cobro">
      <b>Cobrar {soles(falta)}</b>
      <small>Es lo que falta. Queda a tu nombre en la caja, con la foto.</small>
      <div className="mag-cobro__metodos" role="radiogroup" aria-label="Cómo te pagaron">
        {METODOS_EMPLEADO.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={metodo === m.id}
            className={`btn btn-sm ${metodo === m.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMetodo(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <FotoDelPago companyId={companyId} foto={foto} obligatoria alFoto={alFoto} alLeyendo={setLeyendo} />
      {metodo === 'cash' && !foto && <small>En efectivo, fotografía el dinero o el recibo.</small>}
      {otroMonto && (
        <small className="mag-cobro__ojo">
          La foto dice {soles(foto?.monto ?? 0)}, pero se anotan {soles(falta)}. Si no cuadra, no cobres y avisa a la caja.
        </small>
      )}
      <div className="mia-acciones" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!foto || leyendo || enviando} onClick={() => void cobrar()}>
          <Check size={14} /> {enviando ? 'Anotando…' : `Cobré ${soles(falta)}`}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

interface DatosSinCita {
  ficha: string | null;
  servicios: { id: string; nombre: string; minutos: number }[];
  sedes: string[];
}

const SEDE_GUARDADA = 'mag-sede';
const ahoraHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * «Llegó sin cita» (tu-pagina 0026): el barbero anota en SU agenda al cliente que tiene en la
 * silla, para que ocupe su sitio y la página no venda esa hora. Hoy, a su nombre, al precio del
 * catálogo: eso lo vuelve a decidir la base. La sede se recuerda en este celular (el barbero
 * suele estar siempre en la misma). Si la sede ya estaba llena, se crea igual y se avisa.
 */
function LlegoSinCita({ companyId, alCerrar, alListo }: { companyId: string; alCerrar: () => void; alListo: () => void }) {
  const avisar = useAvisar();
  const { datos, error } = useCargar(async () => {
    const { data, error: e } = await supabase().rpc('mi_agenda_sin_cita_datos', { p_company: companyId });
    if (e) throw e;
    return data as DatosSinCita;
  }, [companyId]);
  const [nombre, setNombre] = useState('');
  const [tel, setTel] = useState('');
  const [servicio, setServicio] = useState('');
  const [sede, setSede] = useState(() => {
    try {
      return localStorage.getItem(SEDE_GUARDADA) ?? '';
    } catch {
      return '';
    }
  });
  const [horaInicio, setHoraInicio] = useState(ahoraHHMM);
  const [enviando, setEnviando] = useState(false);

  const sedes = datos?.sedes ?? [];
  const pideSede = sedes.length > 1;
  const sedeValida = !pideSede || sedes.includes(sede);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return avisar('Escribe el nombre del cliente.', 'error');
    if (tel.replace(/\D/g, '').length < 9) return avisar('Escribe su celular: con él le llegan sus avisos y su tarjeta.', 'error');
    if (!servicio) return avisar('Elige el servicio.', 'error');
    if (!sedeValida) return avisar('Elige en qué sede estás.', 'error');
    setEnviando(true);
    const { data, error: e2 } = await supabase().rpc('mi_agenda_sin_cita', {
      p_company: companyId,
      p_datos: {
        nombre: nombre.trim(),
        telefono: tel.replace(/\D/g, ''),
        catalog_item_id: servicio,
        sede: pideSede ? sede : '',
        slot_start: `${isoLocal(new Date())} ${horaInicio}`,
      },
    });
    setEnviando(false);
    if (e2) return avisar(e2.message, 'error');
    try {
      if (pideSede) localStorage.setItem(SEDE_GUARDADA, sede);
    } catch {
      /* sin almacenamiento: la próxima vez la vuelve a elegir */
    }
    const r = data as { servicio?: string; slot_start?: string; aviso?: string | null };
    avisar(`Anotado: ${r.servicio ?? 'la cita'} a las ${(r.slot_start ?? '').slice(11, 16)}.`, 'ok');
    if (r.aviso) avisar(r.aviso, 'error');
    alListo();
  }

  return (
    <div className="modal-fondo" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !enviando) alCerrar(); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-label="Llegó sin cita" onSubmit={guardar}>
        <div className="modal__cab">
          <UserPlus size={16} />
          <b>Llegó sin cita</b>
        </div>
        <div className="modal__cuerpo" style={{ display: 'grid', gap: 10 }}>
          {error && <p className="vacio">No se pudo abrir: {error}</p>}
          {!datos && !error && <p className="vacio">Cargando…</p>}
          {datos && (
            <>
              <p className="muted" style={{ margin: 0 }}>Queda en tu agenda, hoy, al precio de la carta.</p>
              <label className="field-label" style={{ display: 'grid', gap: 4 }}>
                Nombre
                <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" autoFocus />
              </label>
              <label className="field-label" style={{ display: 'grid', gap: 4 }}>
                Celular
                <input className="input" inputMode="tel" placeholder="9…" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="off" />
              </label>
              <label className="field-label" style={{ display: 'grid', gap: 4 }}>
                Servicio
                <select className="input" value={servicio} onChange={(e) => setServicio(e.target.value)}>
                  <option value="">Elige el servicio</option>
                  {datos.servicios.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre} · {duracion(x.minutos)}
                    </option>
                  ))}
                </select>
              </label>
              {pideSede && (
                <label className="field-label" style={{ display: 'grid', gap: 4 }}>
                  Sede
                  <select className="input" value={sedeValida ? sede : ''} onChange={(e) => setSede(e.target.value)}>
                    <option value="">¿En qué sede estás?</option>
                    {sedes.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field-label" style={{ display: 'grid', gap: 4 }}>
                Empieza
                <input className="input" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <div className="modal__pie">
          <button type="button" className="btn btn-ghost" onClick={alCerrar} disabled={enviando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={!datos || enviando}>{enviando ? 'Anotando…' : 'Anotar'}</button>
        </div>
      </form>
    </div>
  );
}

/**
 * Lo que el empleado sabe del cliente antes de atenderlo. Plegado: son notas,
 * no la cita. Las claves de `custom_data` se rotulan con la pregunta que el
 * dueño escribió; una clave sin pregunta no debería llegar, y si llega se
 * enseña con su nombre.
 */
function NotasDelCliente({ cliente, negocio }: { cliente: ClienteDelEquipo | undefined; negocio: MiNegocio | null }) {
  if (!cliente) return null;
  const rotulo = new Map((negocio?.campos_visibles ?? []).map((c) => [c.field_key, c.question]));
  const campos = Object.entries(cliente.custom_data ?? {}).filter(([, v]) => v !== null && v !== '');
  const salon = cliente.notas_salon?.trim();
  const mia = cliente.customer_notes?.trim();
  if (!salon && !mia && campos.length === 0) return null;

  return (
    <details className="mia-notas">
      <summary>Ver notas</summary>
      <dl>
        {salon && (
          <div>
            <dt>Notas del local</dt>
            <dd>{salon}</dd>
          </div>
        )}
        {mia && (
          <div>
            <dt>Lo que apuntó Mia</dt>
            <dd>{mia}</dd>
          </div>
        )}
        {campos.map(([clave, valor]) => (
          <div key={clave}>
            <dt>{rotulo.get(clave) ?? clave}</dt>
            <dd>{String(valor)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * La academia: los grupos semanales, con sus alumnos. Sin mensualidades ni
 * deudas, y sin pasar lista: hoy una inscripción es de un periodo, no de un
 * día, así que no hay dónde apuntar quién vino a cada clase.
 *
 * Quién ocupa plaza se cuenta con la MISMA regla que el bot (`ocupa`, en
 * lib/panel/inscripciones.ts), para que el profesor no vea un cupo distinto
 * del que Mia da por bueno.
 */
function MisClases({ companyId }: { companyId: string }) {
  const { datos, cargando, error } = useCargar(async () => {
    const [catalogo, plazas, clientes] = await Promise.all([
      getCatalogoDelEquipo(companyId),
      getInscripcionesVivas(companyId),
      getMisClientes(companyId),
    ]);
    return { catalogo, plazas, clientes };
  }, [companyId]);

  const grupos = useMemo(() => {
    if (!datos) return [];
    const hoy = hoyLima();
    const nombre = new Map(datos.clientes.map((c) => [c.lead_id, c.name?.trim()]));
    return datos.catalogo
      .filter((item) => Number(item.is_active ?? 1) !== 0)
      .flatMap((item) => {
        let franjas: FranjaRecurrente[] = [];
        try {
          franjas = JSON.parse(item.schedule_slots || '[]') as FranjaRecurrente[];
        } catch {
          /* un JSON roto no tumba la pantalla: ese nivel sale sin grupos */
        }
        return franjas.map((f) => {
          const clave = claveGrupo(item.id, f.id);
          return {
            clave,
            nivel: item.name,
            franja: f,
            alumnos: datos.plazas
              .filter((p) => ocupa(p, clave, hoy))
              .map((p) => ({ id: p.id, ...quienDeCita(p, nombre.get(p.lead_id), 'Alumno') })),
            reservando: datos.plazas.filter((p) => reservando(p, clave, hoy)).length,
          };
        });
      });
  }, [datos]);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Mis clases" sub="Los grupos de la semana y quién está inscrito" />

        <AvisosDelEquipo companyId={companyId} academia />

        {error && <p className="vacio">No se pudieron cargar las clases: {error}</p>}
        {cargando && !datos && <p className="vacio">Cargando las clases…</p>}
        {datos && grupos.length === 0 && <p className="vacio">Todavía no hay grupos creados.</p>}

        {grupos.map((g) => (
          <div className="card mia-grupo" key={g.clave}>
            <h3>
              {g.nivel} · {g.franja.label}
              {/* Hoy ningún grupo tiene profesor: por eso los ven todos. */}
              <span className="mia-sin">Sin asignar</span>
            </h3>
            <p className="muted" style={{ fontSize: 12.5 }}>
              {g.franja.days.map((d) => DIAS[d] ?? '').join(' · ')} · {g.franja.time} ·{' '}
              {g.franja.capacity > 0 ? `${g.alumnos.length} de ${g.franja.capacity} plazas` : `${g.alumnos.length} inscritos`}
              {g.reservando > 0 && ` · ${g.reservando} reservando`}
            </p>
            {g.alumnos.length === 0 ? (
              <p className="vacio">Nadie inscrito todavía.</p>
            ) : (
              <ul className="mia-alumnos">
                {g.alumnos.map((a) => (
                  <li key={a.id}>
                    {a.nombre}
                    {a.deQuien && <small className="muted"> · {a.deQuien}</small>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
