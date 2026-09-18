'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, RotateCcw, Send } from 'lucide-react';
import RevealHeading from '@/components/RevealHeading';
import Mark from '@/components/Mark';
import { DEMO, guionDemo } from '@/lib/content';
import { prefersReducedMotion } from '@/lib/motion';

const BURBUJA = { mia: '#FFFFFF', cliente: '#DCF8C6' } as const;
type Message = { side: 'izq' | 'der'; text: string };
type Stage = 'inicio' | 'respuesta' | 'datos' | 'fin';

export default function InteractiveChatDemo() {
  const [negocio, setNegocio] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [caso, setCaso] = useState(0);
  const [stage, setStage] = useState<Stage>('inicio');
  const [typing, setTyping] = useState(false);
  const timer = useRef<number>();
  const scrollArea = useRef<HTMLDivElement>(null);
  const business = DEMO.negocios[negocio];
  const greeting = '¡Hola! Soy Mia, de ' + business.nombre + '. ¿En qué te puedo ayudar?';
  const script = guionDemo(negocio, 0, caso);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const area = scrollArea.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [messages, typing]);

  const reset = (index = negocio) => {
    window.clearTimeout(timer.current);
    setNegocio(index);
    setMessages([]);
    setTyping(false);
    setStage('inicio');
    setCaso(0);
  };
  const send = (text: string, reply: string, next: Stage) => {
    if (typing) return;
    setMessages((previous) => [...previous, { side: 'der', text }]);
    const finish = () => {
      setMessages((previous) => [...previous, { side: 'izq', text: reply }]);
      setStage(next);
      setTyping(false);
    };
    if (prefersReducedMotion()) finish();
    else {
      setTyping(true);
      timer.current = window.setTimeout(finish, 1000);
    }
  };
  const ask = (index: number) => {
    const conversation = guionDemo(negocio, 0, index);
    let reply = conversation.mia.replace(/^Hola, claro que sí\./, 'Claro que sí.').replace(/^Hola, sí tenemos\./, 'Sí, tenemos.');
    if (negocio === 2 && index === 0) reply = reply.replace('¿Cuál te acomoda mejor?', '¿Lo prefieres en talla M o L?');
    if (negocio === 2 && index === 2) reply = reply.replace('¿Con cuál te confirmo?', '¿Te preparo el pedido en talla M?');
    setCaso(index);
    send(conversation.cliente, reply, 'respuesta');
  };
  const continueConversation = () => {
    const reply = negocio === 2
      ? (caso === 1 ? 'Claro, podemos apartarlo por 24 horas. ¿Qué talla prefieres, M o L?' : 'Perfecto. Para preparar el pedido, ¿me indicas tu nombre y el distrito de entrega? Después te comparto los datos de pago.')
      : 'Perfecto. Para registrar la reserva, ¿me indicas tu nombre? Confirmaremos el horario por este chat.';
    send(script.respuesta, reply, 'datos');
  };
  const submitDetails = () => {
    const customer = negocio === 2 ? (caso === 1 ? 'Talla M, por favor. Soy Alex.' : 'Soy Alex. La entrega sería en Miraflores.') : 'Mi nombre es Alex.';
    const reply = negocio === 2
      ? (caso === 1 ? 'Gracias, Alex. Dejamos el polo negro en talla M apartado por 24 horas. Cuando quieras continuar, escríbenos por aquí.' : 'Gracias, Alex. El polo negro en talla M cuesta S/89 e incluye envío a Lima. El siguiente paso es compartirte los datos de pago y confirmar tu dirección de entrega.')
      : (caso === 1 ? 'Gracias, Alex. Tomamos tu solicitud de reserva. Te confirmaremos el horario por aquí antes de darla por registrada.' : 'Gracias, Alex. Registramos tu elección de horario en esta demostración. Te enviaremos la confirmación y el recordatorio por aquí.');
    send(customer, reply, 'fin');
  };

  return (
    <section id="demo" className="relative" style={{ background: 'var(--bg-cream)', color: 'var(--text-dark)' }}>
      <div className="mx-auto w-full max-w-container px-4 pb-16 pt-9 sm:px-6 md:pb-[120px] md:pt-16">
        <div className="text-center">
          <RevealHeading as="h2" text={DEMO.h2} className="mx-auto max-w-[760px] text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[40px] lg:text-h2" />
          <p className="mx-auto mt-5 max-w-[560px] text-body" style={{ color: 'var(--text-muted)' }}>Elige tu rubro y conversa como un cliente. Tú decides qué mensaje enviar.</p>
        </div>
        <div className="mx-auto mt-10 max-w-[760px] overflow-hidden rounded-hero border" style={{ borderColor: 'var(--border-light)', boxShadow: '0 24px 60px -20px rgba(0,0,0,.16)' }}>
          <div className="bg-white px-4 py-4 sm:px-6">
            <Selector etiqueta={DEMO.etiquetaNegocio} opciones={DEMO.negocios.map((n) => n.label)} activo={negocio} onChange={reset} />
          </div>
          <div className="flex items-center gap-3 bg-[#0A0A0A] px-4 py-4 sm:px-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"><Mark size={20} variant="plane" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-white">{business.nombre}</p>
              <p className="flex items-center gap-1.5 text-[12px] text-[#a1a1a1]"><span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" />{typing ? 'Mia está escribiendo…' : 'Mia está en línea'}</p>
            </div>
            <button type="button" onClick={() => reset()} aria-label="Reiniciar conversación" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-orange-500"><RotateCcw size={18} /></button>
          </div>
          <div className="min-w-0 bg-[#E5DDD3]">
            <div ref={scrollArea} id="demo-panel" role="log" aria-label="Conversación de ejemplo" aria-live="polite" aria-relevant="additions" className="flex h-[300px] flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-5 sm:h-[380px] sm:px-6" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,.045) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
              <Burbuja lado="izq">{greeting}</Burbuja>
              {messages.map((message, index) => <Burbuja key={index} lado={message.side} leido={message.side === 'der' && !typing}>{message.text}</Burbuja>)}
              {typing && <Escribiendo lado="izq" />}
            </div>
            <div role="group" aria-label="Mensajes sugeridos" className="border-t border-black/5 bg-[#F1F0EB] p-3 sm:p-4">
              <p className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[#666]"><Send size={13} />{typing ? 'Mia está preparando su respuesta…' : stage === 'fin' ? 'Conversación de ejemplo terminada' : 'Elige un mensaje para enviar'}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {stage === 'inicio' && <><Option disabled={typing} onClick={() => ask(0)}>{negocio === 2 ? '¿Cuánto cuesta el polo negro?' : '¿Cuánto cuesta?'}</Option><Option disabled={typing} onClick={() => ask(2)}>{negocio === 2 ? '¿Tienen el polo negro en talla M?' : '¿Tienen disponibilidad?'}</Option></>}
                {stage === 'respuesta' && <><Option disabled={typing} onClick={continueConversation}>{script.respuesta}</Option>{caso !== 1 && <Option disabled={typing} onClick={() => ask(1)}>Déjame pensarlo</Option>}</>}
                {stage === 'datos' && <Option disabled={typing} onClick={submitDetails}>{negocio === 2 ? (caso === 1 ? 'Talla M, por favor. Soy Alex.' : 'Soy Alex. La entrega sería en Miraflores.') : 'Mi nombre es Alex.'}</Option>}
                {stage === 'fin' && <Option disabled={typing} onClick={() => reset()}>Probar otra conversación</Option>}
              </div>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-[560px] text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>{DEMO.pie}</p>
      </div>
    </section>
  );
}

function Option({ children, disabled, onClick }: { children: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-controls="demo-panel" className="min-h-12 min-w-0 break-words rounded-xl border border-black/10 bg-white px-4 py-3 text-left text-[14px] leading-snug transition-colors hover:border-orange-500 hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-wait disabled:opacity-50">{children}</button>;
}

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
      <div className="min-w-0 max-w-[90%] break-words sm:max-w-[82%]">
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
