'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Check, MessageCircle, Scissors, Stethoscope, ShoppingBag, Dumbbell, WashingMachine, Building2, Sparkles, ShieldCheck } from 'lucide-react';
import Mark from '@/components/Mark';
import { PRICING, whatsappLink } from '@/lib/content';
import { BUSINESS_OPTIONS, PLAN_SLUGS, planName } from './plan-flow';
import Wordmark from './Wordmark';
import './journey.css';

const BUSINESS_ICONS = [Scissors, WashingMachine, Dumbbell, Stethoscope, ShoppingBag, Building2, Sparkles];
const STEP_NAMES = ['Sobre ti', 'Tu negocio'];

export default function PlanJourney({ initialPlan, initialCurrency, homePath = '/' }: { initialPlan: number; initialCurrency: number; homePath?: string }) {
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState(initialPlan);
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const currentBusiness = BUSINESS_OPTIONS.find((item) => item.id === businessId);
  const selectedPlan = PRICING.plans[plan];
  const currency = PRICING.currencies[initialCurrency];
  const price = `${currency.symbol}${(selectedPlan.price * currency.rate).toFixed(0)}`;
  const firstName = name.trim().split(/\s+/)[0];
  const message = `Hola 👋 Soy ${name.trim()}, de ${businessName.trim()}.\nQuiero el plan ${planName(plan)} de Vendemia (${price} al mes).\nRubro: ${currentBusiness?.label}.\nMe gustaría conocer cómo configurar Mia para mi negocio.`;

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    titleRef.current?.focus();
  }, [step]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (step === 0) {
      if (name.trim().length < 2) nextErrors.name = 'Cuéntanos cómo te llamas.';
      if (businessName.trim().length < 2) nextErrors.businessName = 'Escribe el nombre de tu negocio.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const field = Object.keys(nextErrors)[0];
      document.getElementById(field === 'businessId' ? 'rubro-barberia' : field)?.focus();
      return;
    }
    setStep(step + 1);
  };

  return (
    <div className="plan-journey">
      <header className="journey-header">
        <Link href={homePath} className="journey-brand" aria-label="Vendemia · volver al inicio"><Mark size={26} variant="plane" /><Wordmark /></Link>
        <Link href={`${homePath}#pricing`} className="journey-return"><ArrowLeft size={16} /> Volver a planes</Link>
      </header>

      <main className="journey-shell">
        <aside className="journey-context" aria-label="Tu plan seleccionado">
          <div className="journey-photo">
            <Image src={`/assets/demo-negocios/${currentBusiness?.image ?? 'barberia'}.webp`} alt={`Mario de Vendemia en ${currentBusiness?.short ?? 'una barbería'}`} fill priority sizes="(min-width: 1024px) 45vw, 1px" className="object-cover" />
            <div className="journey-photo-shade" />
            <div className="journey-story">
              <span className="journey-eyebrow"><Sparkles size={14} /> MIA PARA TU NEGOCIO</span>
              <h2>{currentBusiness ? `Más oportunidades para ${currentBusiness.short}.` : 'Tú atiendes tu negocio. Mia atiende tu WhatsApp.'}</h2>
              <p>Responde, acompaña al cliente y propone el siguiente paso, incluso cuando tú estás ocupado.</p>
            </div>
          </div>
          <div className="journey-plan">
            <div className="journey-plan-top"><div><span className="journey-caption">PLAN ELEGIDO</span><h2>{planName(plan)}</h2></div><p>{price}<span> / mes</span></p></div>
            <p className="journey-plan-feature"><Check size={16} /> {selectedPlan.specs[0].label}</p>
            <p className="journey-plan-note">S/0 de instalación · Garantía de reembolso 30 días</p>
          </div>
        </aside>

        <section className="journey-form-panel" aria-label="Personaliza tu inicio con Mia">
          <ol className="journey-steps" aria-label="Progreso">
            {STEP_NAMES.map((label, index) => <li key={label} className={index <= step ? 'is-current' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Check size={13} /> : index + 1}</span>{label}</li>)}
          </ol>
          <div className="journey-progress" role="progressbar" aria-label="Paso actual" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={2}><span style={{ width: `${((step + 1) / 2) * 100}%` }} /></div>

          <div className="journey-heading">
            <p className="journey-caption">PASO {step + 1} DE 2 · {STEP_NAMES[step].toLocaleUpperCase('es')}</p>
            <h1 ref={titleRef} tabIndex={-1}>{step === 0 ? <>Hagamos que Mia<br />venda <em>para ti.</em></> : <>Mia para<br /><em>{businessName.trim()}.</em></>}</h1>
            <p>{step === 0 ? 'Un par de detalles para empezar con lo que tu negocio necesita.' : `${firstName}, elige tu rubro y continuamos por WhatsApp. Así de fácil.`}</p>
          </div>

          {step === 0 ? <form onSubmit={submit} noValidate>
            <div className="journey-fields">
              <div><label htmlFor="name">¿Cómo te llamas?</label><input id="name" name="name" autoComplete="given-name" placeholder="Tu nombre" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} required aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} />{errors.name && <p id="name-error" className="journey-error" role="alert">{errors.name}</p>}</div>
              <div><label htmlFor="businessName">¿Cómo se llama tu negocio?</label><input id="businessName" name="businessName" autoComplete="organization" placeholder="El nombre de tu negocio" maxLength={100} value={businessName} onChange={(e) => setBusinessName(e.target.value)} required aria-invalid={!!errors.businessName} aria-describedby={errors.businessName ? 'business-error' : undefined} />{errors.businessName && <p id="business-error" className="journey-error" role="alert">{errors.businessName}</p>}</div>
            </div>
            <div className="journey-actions"><button type="submit" className="journey-primary">Continuar<ArrowRight size={18} /></button></div>
          </form> : <div>
            <div className="journey-fields">
              <fieldset><legend>¿Qué tipo de negocio tienes?</legend><div className="journey-business-grid">{BUSINESS_OPTIONS.map((item, index) => { const Icon = BUSINESS_ICONS[index]; return <label key={item.id} className={`journey-choice ${item.id === businessId ? 'is-selected' : ''}`}><input id={`rubro-${item.id}`} type="radio" name="businessId" value={item.id} checked={item.id === businessId} onChange={() => setBusinessId(item.id)} /><Icon size={21} /><span>{item.label}</span>{item.id === businessId && <Check size={14} className="journey-choice-check" />}</label>; })}</div></fieldset>
            </div>
            <details className="journey-change-plan"><summary>Cambiar mi plan</summary><label htmlFor="chosen-plan" className="sr-only">Tu plan</label><select id="chosen-plan" value={plan} onChange={(e) => { const next = Number(e.target.value); setPlan(next); window.history.replaceState(null, '', `?plan=${PLAN_SLUGS[next]}&moneda=${currency.code}`); }}>{PRICING.plans.map((item, index) => <option key={item.header} value={index}>{planName(index)} · {currency.symbol}{(item.price * currency.rate).toFixed(0)}/mes</option>)}</select></details>
            {currentBusiness && <div className="journey-ready"><MessageCircle size={16} /><p>Listo, {firstName}. Llevamos el contexto de {businessName.trim()} a la conversación.</p></div>}
            <div className="journey-actions"><button type="button" className="journey-back" onClick={() => setStep(0)}><ArrowLeft size={17} /> Atrás</button>{currentBusiness ? <a {...whatsappLink('Continuar por WhatsApp', message)} className="journey-primary">Continuar por WhatsApp<ArrowRight size={18} /></a> : <button type="button" disabled className="journey-primary">Continuar por WhatsApp<ArrowRight size={18} /></button>}</div>
            <p className="journey-handoff-note">Tu mensaje estará listo en WhatsApp. Tú decides cuándo enviarlo.</p>
          </div>}
          <div className="journey-reassurance"><ShieldCheck size={16} /><span>Sin costo de instalación · Sin permanencia</span></div>
        </section>
      </main>
    </div>
  );
}
