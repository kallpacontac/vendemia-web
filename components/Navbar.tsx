'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ChevronDown, ArrowRight, Menu, X } from 'lucide-react';
import Mark from './Mark';
import { ANNOUNCEMENT, NAV_LINKS, NAV_CTA, BRAND, SITIO, whatsappLink } from '@/lib/content';
import { registerGsap, prefersReducedMotion, cascadeText } from '@/lib/motion';

/**
 * NAVBAR TRANSFORMABLE
 *
 * Arranca como barra completa de ancho total (36px de anuncio + 72px de nav).
 * Tras 80px de scroll colapsa a una PÍLDORA flotante centrada de 48px.
 * Transición 0.40s power2.out.
 *
 * Los dos estados conviven en el DOM y hacen crossfade. Animar `width` de un
 * layout a otro produce reflow por frame; esto no.
 */
/**
 * "Prueba gratis" sale TRES veces (barra completa, píldora y menú móvil) y las
 * tres tienen que abrir la misma conversación. Con el href escrito a mano en
 * cada una, basta que alguien toque el número en dos de ellas para que la
 * tercera siga apuntando al viejo — y es la del menú móvil, o sea la que menos
 * se prueba.
 *
 * El constructor está en content.ts, junto al número: ahora también lo usa el
 * CTA final. Ahí está el porqué de cada atributo.
 */
const cta = whatsappLink(NAV_CTA.solid);

export default function Navbar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const markRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);

  // ── Colapso por scroll ─────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setCollapsed(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── DETALLE DE CONTINUIDAD ─────────────────────────────────
  // Cuando el telón de la intro va por la mitad, el isotipo del navbar repite
  // en miniatura la llegada de la intro: entra volando desde la izquierda y
  // rebota al posarse. La Mia grande queda enterrada abajo y renace pequeña
  // aquí arriba. Es opcional, y es lo que la hace memorable.
  //
  // Aquí es el AVIÓN DE PAPEL y en la intro el dibujo completo con Mia encima.
  // Que el recorte cambie no rompe el gesto: lo que el ojo sigue es el
  // movimiento, no la silueta — y a 32 px la cara de Mia sería una mancha,
  // mientras que la silueta del avión se lee entera. Además el avión ES el
  // vehículo del gesto: lo que entra volando desde la izquierda.
  //
  // Y el WORDMARK ACOMPAÑA. Antes solo se movía el isotipo y el nombre estaba
  // ya puesto, así que el renacimiento se leía a medias: la intro entierra un
  // lockup entero (dibujo + palabra) y arriba renacía solo la mitad. Ahora la
  // palabra se rehace con su misma cascada de opacidad (M1b), arrancando
  // cuando el avión ya casi se ha posado.
  useEffect(() => {
    registerGsap();
    if (prefersReducedMotion()) return;

    const onRebirth = () => {
      const el = markRef.current;
      const word = wordRef.current;
      if (!el) return;

      const ctx = gsap.context(() => {
        gsap
          .timeline()
          .fromTo(
            '.dot',
            { xPercent: -140, rotate: -14, opacity: 0 },
            { xPercent: 0, rotate: 0, opacity: 1, duration: 0.34, ease: 'power3.out' }
          )
          .to('.dot', { rotate: 3, duration: 0.1, ease: 'power2.out' }, 0.26)
          .to('.dot', { rotate: 0, duration: 0.3, ease: 'elastic.out(1, 0.55)' }, 0.36);
      }, el);

      // Fuera del context del isotipo: el wordmark es hermano suyo, no
      // descendiente, y el selector de texto de gsap.context solo busca dentro.
      let wordCtx: gsap.Context | undefined;
      if (word) {
        wordCtx = gsap.context(() => {
          cascadeText(word, { immediate: true, delay: 0.22, spread: 0.34 });
        }, word);
      }

      window.setTimeout(() => {
        ctx.revert();
        // ⚠️ El wordmark NO se revierte. `ctx.revert()` devuelve las letras a
        // opacidad 0 —su estado inicial— y el nombre desaparecería del navbar
        // para siempre. Del isotipo sí se revierte porque su estado inicial es
        // el neutro (sin transform).
        wordCtx?.kill();
      }, 900);
    };

    window.addEventListener('nexor:mark-rebirth', onRebirth);
    return () => window.removeEventListener('nexor:mark-rebirth', onRebirth);
  }, []);

  const ease = 'cubic-bezier(0.25,0.46,0.45,0.94)'; // ≈ power2.out
  const t = `400ms ${ease}`;

  return (
    <>
      {/* ── ESTADO A · barra completa ─────────────────────────── */}
      <div
        className="fixed inset-x-0 top-0 z-50"
        style={{
          transition: `opacity ${t}, transform ${t}`,
          opacity: collapsed ? 0 : 1,
          transform: collapsed ? 'translateY(-12px)' : 'none',
          pointerEvents: collapsed ? 'none' : 'auto',
        }}
      >
        {/* Barra de anuncio · 36px */}
        <div
          className="flex h-[36px] items-center border-b"
          style={{ borderColor: 'var(--border-dark)', background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(12px)' }}
        >
          <div className="mx-auto flex w-full max-w-container items-center justify-between px-6">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="h-[6px] w-[6px] rounded-full" style={{ background: 'var(--orange-500)' }} />
              <span style={{ color: 'var(--text-mid)' }}>{ANNOUNCEMENT.text}</span>
              <a
                href="#pricing"
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-200 hover:bg-white/10"
                aria-label={ANNOUNCEMENT.cta}
              >
                <ArrowRight size={12} style={{ color: 'var(--orange-500)' }} />
              </a>
            </div>
            <div className="hidden items-center gap-6 md:flex">
              {ANNOUNCEMENT.links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="text-[13px] transition-colors duration-200 hover:text-white"
                  style={{ color: 'var(--text-low)' }}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Navbar · 72px */}
        <nav
          className="h-[72px]"
          style={{ background: 'rgba(6,2,0,.72)', backdropFilter: 'blur(12px)' }}
          aria-label="Principal"
        >
          <div className="mx-auto flex h-full max-w-container items-center justify-between px-6">
            <a href="#hero" className="flex items-center gap-2 text-white" aria-label={BRAND.name}>
              <Mark ref={markRef} size={28} variant="plane" priority />
              {/* El nombre se parte en letras para poder rehacerlo con la
                  cascada del renacimiento. El texto accesible lo da el
                  aria-label del enlace, así que partirlo no cuesta nada. */}
              <span
                ref={wordRef}
                aria-hidden="true"
                className="nav-word text-[18px] font-semibold tracking-[0.06em]"
              >
                {BRAND.letters.map((letter, i) => (
                  <span key={i} className="cascade-part">
                    {letter}
                  </span>
                ))}
              </span>
            </a>

            <div className="hidden items-center gap-7 lg:flex">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="flex items-center gap-1 text-[14px] transition-colors duration-200 hover:text-white"
                  style={{ color: 'var(--text-mid)' }}
                >
                  {link.label}
                  {link.hasChevron && <ChevronDown size={14} className="opacity-60" />}
                </a>
              ))}
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <a
                href={SITIO.login}
                className="flex h-10 items-center rounded-full border px-6 text-[14px] font-medium transition-colors duration-200 hover:bg-white/5"
                style={{ borderColor: 'var(--border-dark)', color: 'var(--text-hi)' }}
              >
                {NAV_CTA.ghost}
              </a>
              <a
                {...cta}
                className="flex h-10 items-center gap-2 rounded-full px-6 text-[14px] font-semibold transition-colors duration-200"
                style={{ background: 'var(--orange-cta)', color: 'var(--on-orange)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--orange-cta-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--orange-cta)')}
              >
                {NAV_CTA.solid}
              </a>
            </div>

            <button
              type="button"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={22} />
            </button>
          </div>
        </nav>
      </div>

      {/* ── ESTADO B · píldora flotante ───────────────────────── */}
      <div
        className="fixed inset-x-0 top-4 z-50 hidden justify-center md:flex"
        style={{
          transition: `opacity ${t}, transform ${t}`,
          opacity: collapsed ? 1 : 0,
          transform: collapsed ? 'none' : 'translateY(-12px) scale(0.98)',
          pointerEvents: collapsed ? 'auto' : 'none',
        }}
      >
        <nav
          className="flex h-[48px] w-[680px] max-w-[calc(100vw-48px)] items-center justify-between rounded-full border pl-5 pr-2"
          style={{
            background: 'rgba(10,10,10,.85)',
            backdropFilter: 'blur(20px)',
            borderColor: 'rgba(255,255,255,.08)',
          }}
          aria-label="Principal compacta"
        >
          <a href="#hero" aria-label={BRAND.name}>
            <Mark size={22} variant="plane" />
          </a>

          <div className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="hidden text-[14px] transition-colors duration-200 hover:text-white lg:block"
                style={{ color: 'var(--text-mid)' }}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* La píldora conserva su botón BLANCO, no lo pasé a naranja: sobre el
              fondo casi negro de la píldora, blanco con tinta da 19.8 de
              contraste y ningún naranja se le acerca.
              Ahora los dos botones sí riman, porque el naranja también lleva
              TINTA encima (ver --on-orange en globals.css). Antes llevaba texto
              blanco, que se quedaba en 3.38 y suspendía AA; igualar los dos
              "por congruencia" habría sido propagar el que fallaba. */}
          <a
            {...cta}
            className="flex h-9 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-medium"
            style={{ color: 'var(--text-dark)' }}
          >
            {NAV_CTA.solid}
          </a>
        </nav>
      </div>

      {/* ── Menú móvil a pantalla completa ────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col p-6 md:hidden" style={{ background: 'var(--bg-900)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mark size={24} variant="plane" />
              <span className="text-[18px] font-semibold tracking-[0.06em]">{BRAND.name}</span>
            </div>
            {/* El icono mide 22px y el boton medía lo mismo: la mitad del
                minimo tactil. `-m-3 p-3` le da los 46px de zona de toque sin
                mover ni un pixel la posicion del aspa. */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menú"
              className="-m-3 p-3"
            >
              <X size={22} />
            </button>
          </div>

          <div className="mt-12 flex flex-col gap-6">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-[24px] font-semibold"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-3">
            <a
              {...cta}
              onClick={() => setMobileOpen(false)}
              className="flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold"
              style={{ background: 'var(--orange-cta)', color: 'var(--on-orange)' }}
            >
              {NAV_CTA.solid}
            </a>
            <a
              href={SITIO.login}
              className="flex h-12 items-center justify-center rounded-full border text-[15px] font-medium"
              style={{ borderColor: 'var(--border-dark)' }}
            >
              {NAV_CTA.ghost}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
