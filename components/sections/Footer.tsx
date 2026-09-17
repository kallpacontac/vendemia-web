'use client';

import type { ReactNode } from 'react';

import Mark from '@/components/Mark';
import AssetSlot from '@/components/AssetSlot';
import Reveal from '@/components/Reveal';
import { Starfield } from '@/components/ui';
import { FOOTER, BRAND, whatsappLink } from '@/lib/content';

/**
 * 12 · FOOTER — dark (#000)
 *
 * Entrada: solo un fade suave. Sin M1, sin M2. El footer no necesita drama —
 * quien llega hasta aquí ya está convencido o ya se fue.
 */
export default function Footer({ wordmark, socialLogos, hidePaymentAssets = false, compactBottom = false }: { wordmark?: ReactNode; socialLogos?: ReactNode; hidePaymentAssets?: boolean; compactBottom?: boolean } = {}) {
  /** Solo los perfiles que existen de verdad. Ver la nota de más abajo. */
  const redes = FOOTER.social.flatMap((r) =>
    'url' in r && r.url ? [{ label: r.label, url: r.url as string }] : [],
  );

  return (
    <footer className="cv-auto relative overflow-hidden" style={{ background: 'var(--bg-900)' }}>
      {/* Nebulosa difusa en la esquina superior derecha */}
      <div
        className="pointer-events-none absolute -right-[10%] -top-[20%] h-[600px] w-[900px]"
        aria-hidden
        style={{ opacity: 0.25, filter: 'blur(40px)' }}
      >
        <AssetSlot
          id="footer.nebula"
          tone="dark"
          radius="none"
          compact
          label="Nebulosa naranja-violeta"
          className="h-full w-full"
        />
      </div>
      <Starfield count={30} />

      <Reveal from="up" className={`relative mx-auto w-full max-w-container px-6 ${compactBottom ? 'pt-20 pb-0' : 'py-20'}`}>
        {/*
          ⚠️ EL NÚMERO DE COLUMNAS SALE DE FOOTER.columns, NO ESTÁ ESCRITO AQUÍ.

          Estaba clavado a "2fr 1fr 1fr 1fr 1fr" —marca más cuatro columnas—, y
          al añadir una quinta, "Legal" caía sola a una segunda fila con un
          hueco enorme al lado. El pie se rompía por añadir contenido, que es
          justo cuando nadie mira el pie.

          `gridTemplateColumns` se calcula: la marca vale 1.6 y cada columna 1.
          Añadir o quitar una en content.ts ya no descuadra nada.
        */}
        <div className="footer-grid grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:gap-x-10">
          <div>
            <div className="flex items-center gap-2">
              <Mark size={30} />
              <span className="text-[18px] font-semibold tracking-[0.06em]">{wordmark ?? BRAND.name}</span>
            </div>
            <p className="mt-4 max-w-[300px] text-[14px] leading-[1.6]" style={{ color: 'var(--text-mid)' }}>
              {FOOTER.description}
            </p>
          {/*
            ⚠️ SI NO HAY PERFILES, NO SE PINTA NADA.

            Antes se enseñaban las seis etiquetas recortadas a dos letras —"Wh
            In Ti Fa Li Yo"— para marcar el sitio donde irían los iconos. En
            pantalla no se leía como un hueco reservado: se leía como texto
            roto, que es peor que no tener redes.

            En cuanto un perfil tenga `url` en FOOTER.social aparece aquí solo,
            como enlace de verdad. Ver la nota de allí.
          */}
          {redes.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2">
              {redes.map((r) => (
                <a
                  key={r.label}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] transition-colors duration-[250ms] hover:text-white"
                  style={{ color: 'var(--text-low)' }}
                >
                  {r.label}
                </a>
              ))}
            </div>
          )}
          </div>

          {FOOTER.columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-[14px] font-semibold">{col.title}</h3>
              {/* Con `href` sale enlace; sin él, texto. Los que no tienen
                  destino todavía se ven igual pero no son pulsables — antes
                  eran `href="#"` y devolvían al principio de la página. */}
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {'href' in l && l.href ? (
                      <a
                        href={l.href}
                        className="text-[14px] transition-colors duration-[250ms] hover:text-white"
                        style={{ color: 'var(--text-mid)' }}
                      >
                        {l.label}
                      </a>
                    ) : (
                      <span className="text-[14px]" style={{ color: 'var(--text-mid)' }}>
                        {l.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <hr className="my-0 border-0 border-t" style={{ borderColor: 'var(--border-darker)' }} />

        {/* Franja media */}
        <div className="flex flex-col items-center gap-8 py-10 lg:flex-row lg:justify-between">
          {socialLogos ?? <div className="flex gap-4">
            {[0, 1, 2].map((i) => (
              <AssetSlot
                key={i}
                id="footer.badges"
                kind="logo"
                tone="dark"
                radius="icon"
                compact
                label="Sello de certificación"
                className="h-12 w-12"
              />
            ))}
          </div>}

          <p className="max-w-[320px] text-center text-[15px] font-medium leading-[1.5] lg:text-left">
            {FOOTER.contacto.title}
          </p>

          {/* Aquí vivía el formulario del newsletter, que se tragaba el correo
              sin enviarlo a ninguna parte ni avisar de nada. Ver la nota en
              FOOTER.contacto (content.ts). Mismo hueco, mismos 320px, misma
              altura de 48px — y ahora sí hace algo. */}
          <a
            {...whatsappLink(FOOTER.contacto.cta)}
            className="flex h-12 w-[320px] max-w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold"
            style={{ background: 'var(--orange-cta)', color: 'var(--on-orange)' }}
          >
            {FOOTER.contacto.cta}
          </a>
        </div>

        <hr className="my-0 border-0 border-t" style={{ borderColor: 'var(--border-darker)' }} />

        {/* Franja inferior */}
        <div className="flex flex-col gap-6 py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1 text-[12px] leading-[1.6]" style={{ color: 'var(--text-low)' }}>
            {/* El aviso de reCAPTCHA se retiró: la página no lleva reCAPTCHA.
                Ver la nota en FOOTER.legal (content.ts). */}
            <p>{FOOTER.legal.copyright}</p>
            <p>{FOOTER.legal.address}</p>
          </div>

          {!hidePaymentAssets && <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <AssetSlot
                key={i}
                id="footer.payments"
                kind="logo"
                tone="dark"
                radius="icon"
                compact
                label="Método de pago"
                className="h-8 w-8"
              />
            ))}
          </div>}
        </div>
      </Reveal>
    </footer>
  );
}
