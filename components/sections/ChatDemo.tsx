'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck } from 'lucide-react';
import RevealHeading from '@/components/RevealHeading';
import Reveal from '@/components/Reveal';
import Mark from '@/components/Mark';
import { DEMO, guionDemo } from '@/lib/content';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * 4 · LA DEMO CONVERSACIONAL — cream (#F9F9F6)
 *
 * Sustituye al viejo "Pruébalo antes de decidir", que era una caja de texto que
 * no hacía nada: pedía al visitante que escribiera y no le contestaba nadie.
 * Prometer una prueba y no darla es peor que no ofrecerla.
 *
 * Aquí no se le pide que escriba: se le pide que ELIJA. Su rubro, y tres
 * pestañas con las tres situaciones que de verdad deciden una venta por
 * WhatsApp. Elegir cuesta un clic y siempre devuelve algo bueno; escribir
 * cuesta esfuerzo y puede devolver algo pobre.
 *
 * Hubo un segundo selector para el tono y se retiró: dos filas de mandos
 * encima del chat pedían demasiado antes de haber demostrado nada.
 *
 * ⚠️ LAS CONVERSACIONES NO ESTÁN GUARDADAS, SE COMPONEN. Los hechos los pone el
 * negocio y el registro lo pone el tono — ver la nota sobre DEMO en content.ts.
 * Es lo que hace que la sección demuestre la promesa en vez de ilustrarla.
 *
 * ── LA SECCIÓN SIGUE SIENDO CREMA ─────────────────────────────────────────
 * Y tiene que seguir siéndolo: es la única clara entre BentoA y BentoB, las dos
 * oscuras. Ver el ritmo de fondos documentado en page.tsx.
 */

/**
 * LOS CUATRO PISOS DE LA TARJETA.
 *
 * ⚠️ Esto no es decoración: la primera versión tenía la sección en crema
 * (#F9F9F6), la tarjeta en blanco y el chat en #FBFBF9 — tres tonos separados
 * por menos de un 2 % de luminosidad. En pantalla no se distinguía ninguno del
 * siguiente: los mandos, las pestañas y la conversación parecían una sola
 * mancha y no se entendía qué era cada cosa.
 *
 * Ahora cada piso tiene un trabajo y un color que lo dice:
 *
 *   MANDOS     blanco puro     → "esto se toca"
 *   PESTAÑAS   gris cálido     → "esto también, pero es de otro orden"
 *   CABECERA   tinta           → el corte fuerte; a partir de aquí ya no
 *                                configuras, MIRAS
 *   CHAT       beige de WhatsApp → "esto es una conversación de verdad"
 *
 * El beige es el de WhatsApp a propósito. Es el fondo que el visitante ve
 * quince veces al día en su propio teléfono, así que reconoce la pantalla antes
 * de leer una sola palabra. Cambiarlo por un gris de marca sería más "nuestro"
 * y perdería justo lo que lo hace funcionar.
 */
const PISO = {
  mandos: '#FFFFFF',
  pestanas: '#F1F0EB',
  cabecera: '#0A0A0A',
  chat: '#E5DDD3',
  pie: '#FFFFFF',
} as const;

const BURBUJA = {
  mia: '#FFFFFF',
  cliente: '#DCF8C6',
} as const;

/* Los cuatro tiempos del guion, en ms desde que cambia la selección.
   Suman 2.4s: lo justo para que se lea como una conversación y no tanto como
   para que el visitante se canse antes de tocar otra pestaña. */
const TIEMPOS = [260, 1100, 1750, 2400];

export default function ChatDemo() {
  const [negocio, setNegocio] = useState(0);
  const [caso, setCaso] = useState(0);
  /**
   * El tono ya no se elige en pantalla: el selector "Cómo quieres que hable" se
   * retiró porque dos filas de mandos encima del chat pedían demasiado antes de
   * haber demostrado nada. Queda fijo en el primero (Neutral).
   *
   * Para devolverlo: un useState en lugar de esta constante y volver a pintar
   * un <Selector> con DEMO.tonos. La composición del guion no cambia.
   */
  const TONO_FIJO = 0;
  /** 0 nada · 1 Mia escribiendo · 2 Mia responde · 3 cliente escribiendo · 4 cierra */
  const [paso, setPaso] = useState(4);

  const guion = useMemo(() => guionDemo(negocio, TONO_FIJO, caso), [negocio, caso]);
  const temporizadores = useRef<number[]>([]);
  /* El primer render NO debe animarse: la sección está fuera de pantalla y la
     conversación se habría "reproducido" sin que nadie la viera, dejando al
     visitante el resultado ya montado. Se anima a partir del primer cambio. */
  const yaMontado = useRef(false);

  useEffect(() => {
    temporizadores.current.forEach(clearTimeout);
    temporizadores.current = [];

    if (!yaMontado.current) {
      yaMontado.current = true;
      return;
    }
    if (prefersReducedMotion()) {
      setPaso(4);
      return;
    }

    setPaso(0);
    temporizadores.current = TIEMPOS.map((ms, i) => window.setTimeout(() => setPaso(i + 1), ms));
    return () => temporizadores.current.forEach(clearTimeout);
  }, [negocio, caso]);

  return (
    <section
      id="demo"
      className="cv-auto relative"
      style={{ background: 'var(--bg-cream)', color: 'var(--text-dark)' }}
    >
      <div className="mx-auto w-full max-w-container px-6 pb-[64px] pt-[36px] md:pb-[120px] md:pt-[64px]">
        <div className="text-center">
          <RevealHeading
            as="h2"
            text={DEMO.h2}
            className="mx-auto max-w-[760px] text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2"
          />
          <Reveal from="up" delay={0.1}>
            <p className="mx-auto mt-5 max-w-[560px] text-body" style={{ color: 'var(--text-muted)' }}>
              {DEMO.sub}
            </p>
          </Reveal>
        </div>

        <Reveal
          from="scale"
          delay={0.15}
          className="relative mx-auto mt-12 max-w-[760px] overflow-hidden rounded-hero border"
          style={{
            borderColor: 'var(--border-light)',
            boxShadow: '0 24px 60px -20px rgba(0,0,0,.16)',
          }}
        >
          {/* ── PISO 1 · los mandos ──────────────────────────────── */}
          {/* Una sola fila de mandos desde que se retiró el tono, así que el
              bloque va menos alto: con el padding de 8 quedaba un cinturón
              blanco vacío entre el título y las pestañas. */}
          <div className="px-6 py-5 md:px-8" style={{ background: PISO.mandos }}>
            <Selector
              etiqueta={DEMO.etiquetaNegocio}
              opciones={DEMO.negocios.map((n) => n.label)}
              activo={negocio}
              onChange={setNegocio}
            />
          </div>

          {/* ── PISO 2 · las tres situaciones ────────────────────── */}
          <div
            role="tablist"
            aria-label="Situación"
            /* ⚠️ flex-wrap y NO overflow-x-auto. Con desplazamiento lateral, en
               390px la tercera situación quedaba entera fuera de pantalla y sin
               ninguna pista de que existiera: el visitante veía dos casos y se
               perdía justo el que cierra la venta. Envolviendo se ven los tres. */
            className="flex flex-wrap gap-2 px-6 py-4 md:px-8"
            style={{ background: PISO.pestanas }}
          >
            {DEMO.casos.map((c, i) => (
              <button
                key={c.id}
                role="tab"
                id={`demo-tab-${c.id}`}
                aria-selected={caso === i}
                aria-controls="demo-panel"
                type="button"
                onClick={() => setCaso(i)}
                className="shrink-0 rounded-full px-4 py-2 text-[14px] font-medium transition-colors duration-200"
                style={
                  caso === i
                    ? { background: 'var(--text-dark)', color: '#fff' }
                    : { background: '#FFFFFF', color: 'var(--text-muted)' }
                }
              >
                {c.pestana}
              </button>
            ))}
          </div>

          {/* ── PISO 3 · la cabecera del chat ────────────────────────
              Hace dos trabajos a la vez: corta en seco entre "configurar" y
              "mirar", y saca el nombre del negocio de encima de la burbuja,
              donde flotaba suelto en naranja sin pertenecer a nada. En una
              conversación real el nombre vive arriba, no en cada mensaje. */}
          <div
            className="flex items-center gap-3 px-6 py-4 md:px-8"
            style={{ background: PISO.cabecera }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'rgba(255,255,255,.08)' }}
            >
              <Mark size={20} variant="plane" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold" style={{ color: '#fff' }}>
                {guion.negocio}
              </span>
              <span className="flex items-center gap-[6px] text-[12px]" style={{ color: 'var(--text-mid)' }}>
                <span className="block h-[6px] w-[6px] rounded-full" style={{ background: '#25D366' }} />
                Mia está en línea
              </span>
            </span>
          </div>

          {/* ── PISO 4 · la conversación ─────────────────────────── */}
          <div
            id="demo-panel"
            role="tabpanel"
            aria-labelledby={`demo-tab-${DEMO.casos[caso].id}`}
            /* `aria-live` para que quien usa lector de pantalla se entere de que
               el panel cambió al pulsar un mando. Sin esto el cambio es
               silencioso y la demo no existe para esa persona. */
            aria-live="polite"
            /* Altura mínima fija: sin ella, la tarjeta encoge y crece mientras
               entran las burbujas y el bloque de abajo baila en cada clic. */
            className="flex min-h-[380px] flex-col gap-3 px-6 py-6 md:px-8"
            style={{
              background: PISO.chat,
              /* El punteado tenue es el papel pintado del chat. Muy por debajo
                 del umbral de "textura visible": si se nota, distrae del texto,
                 que es lo único que aquí importa. */
              backgroundImage:
                'radial-gradient(rgba(0,0,0,.045) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          >
            <Burbuja lado="der" visible>
              {guion.cliente}
            </Burbuja>

            {/* Separador al estilo de los de fecha de WhatsApp: sobre el beige,
                un texto suelto se pierde; en píldora se lee como parte del chat. */}
            <p className="my-1 flex justify-center">
              <span
                className="rounded-full px-3 py-[5px] text-[12px]"
                style={{ background: 'rgba(255,255,255,.72)', color: 'var(--text-muted)' }}
              >
                Mia responde{' '}
                <span className="font-semibold" style={{ color: '#B33200' }}>
                  {DEMO.casos[caso].tiempo}
                </span>
              </span>
            </p>

            {paso === 1 ? (
              <Escribiendo lado="izq" />
            ) : (
              <Burbuja lado="izq" visible={paso >= 2}>
                {guion.mia}
              </Burbuja>
            )}

            {paso === 3 && <Escribiendo lado="der" />}
            {paso >= 4 && (
              <Burbuja lado="der" visible leido>
                {guion.respuesta}
              </Burbuja>
            )}
          </div>

          {/* ── PIE · lo que se acaba de demostrar ────────────────
              Fuera del chat a propósito: dentro, la etiqueta parecía un mensaje
              más y ensuciaba la conversación. Aquí es lo que es — el comentario
              de quien enseña la pantalla. */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 md:px-8"
            style={{ background: PISO.pie, borderTop: '1px solid var(--border-light)' }}
          >
            <span
              className="rounded-full px-3 py-[6px] text-[13px] font-semibold"
              style={{ background: 'rgba(255,73,0,.10)', color: '#B33200' }}
            >
              {DEMO.casos[caso].etiqueta}
            </span>
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Sin que tú intervengas
            </span>
          </div>
        </Reveal>

        <p
          className="mx-auto mt-6 max-w-[560px] text-center text-[13px]"
          style={{ color: 'var(--text-muted)' }}
        >
          {DEMO.pie}
        </p>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════
   PIEZAS
   ══════════════════════════════════════════════════════════════ */

function Selector({
  etiqueta,
  opciones,
  activo,
  onChange,
}: {
  etiqueta: string;
  opciones: readonly string[];
  activo: number;
  onChange: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <span
        className="text-[12px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {etiqueta}
      </span>
      {/* `radiogroup` y no una fila de botones sueltos: son opciones excluyentes
          de un mismo ajuste, y así el lector de pantalla anuncia "1 de 3". */}
      <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-2">
        {opciones.map((o, i) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={activo === i}
            onClick={() => onChange(i)}
            className="rounded-full border px-4 py-[7px] text-[14px] font-medium transition-colors duration-200"
            style={
              activo === i
                ? {
                    borderColor: 'var(--orange-cta)',
                    background: 'var(--orange-cta)',
                    color: 'var(--on-orange)',
                  }
                : { borderColor: 'var(--border-light)', background: '#fff', color: 'var(--text-dark)' }
            }
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Burbuja de WhatsApp. `izq` es Mia y `der` el cliente — al revés de lo que
 * parece intuitivo, pero es la convención de la app: los mensajes de uno mismo
 * van a la derecha, y aquí el visitante se pone en el lugar del CLIENTE, no del
 * negocio. Ver el mismo criterio en scripts/ilustraciones.mjs.
 */
function Burbuja({
  lado,
  children,
  visible = true,
  leido = false,
}: {
  lado: 'izq' | 'der';
  children: string;
  visible?: boolean;
  leido?: boolean;
}) {
  const mia = lado === 'izq';
  return (
    <div
      className={`flex ${mia ? 'justify-start' : 'justify-end'} transition-all duration-300`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(8px)',
        // Sin esto, una burbuja invisible sigue ocupando su sitio y empuja a las
        // de abajo antes de aparecer.
        maxHeight: visible ? '600px' : 0,
      }}
      aria-hidden={!visible}
    >
      <div className="max-w-[82%]">
        <div
          className="whitespace-pre-line px-4 py-3 text-[14px] leading-[1.55]"
          style={{
            background: mia ? BURBUJA.mia : BURBUJA.cliente,
            color: 'var(--text-dark)',
            // Sombra en vez de borde: sobre el beige, un borde gris ensucia y
            // la sombra es lo que hace que la burbuja se despegue del fondo,
            // igual que en la app.
            boxShadow: '0 1px 1px rgba(0,0,0,.10)',
            // La esquina cuadrada es la que hace que se lea como burbuja.
            borderRadius: mia ? '10px 10px 10px 2px' : '10px 10px 2px 10px',
          }}
          /* `formatearNegritas` convierte los *asteriscos* del copy en <strong>,
             igual que hace WhatsApp. Se escribe con asteriscos en content.ts
             para que el copy siga siendo legible sin etiquetas. */
          dangerouslySetInnerHTML={{ __html: formatearNegritas(children) }}
        />
        <p
          className={`mt-1 flex items-center gap-1 text-[11px] ${mia ? 'pl-1' : 'justify-end pr-1'}`}
          style={{ color: 'rgba(0,0,0,.42)' }}
        >
          Ahora
          {!mia && (leido ? <CheckCheck size={13} style={{ color: '#34B7F1' }} /> : <Check size={13} />)}
        </p>
      </div>
    </div>
  );
}

function Escribiendo({ lado }: { lado: 'izq' | 'der' }) {
  const mia = lado === 'izq';
  return (
    <div className={`flex ${mia ? 'justify-start' : 'justify-end'}`}>
      <div
        className="flex items-center gap-[5px] px-4 py-[14px]"
        style={{
          background: mia ? BURBUJA.mia : BURBUJA.cliente,
          boxShadow: '0 1px 1px rgba(0,0,0,.10)',
          borderRadius: mia ? '10px 10px 10px 2px' : '10px 10px 2px 10px',
        }}
        role="status"
        aria-label="escribiendo"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-[7px] w-[7px] animate-typing-dot rounded-full"
            style={{ background: '#8C9A8C', animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * *negrita* → <strong>. Los asteriscos vienen del copy, que es contenido
 * nuestro y no del usuario, así que el HTML resultante es seguro. Aun así se
 * escapa todo lo demás ANTES de sustituir: si mañana alguien pega en content.ts
 * un texto con "<" se pintaría como etiqueta, y de ahí a un fallo de verdad hay
 * un paso.
 */
function formatearNegritas(texto: string): string {
  const escapado = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escapado.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
}
