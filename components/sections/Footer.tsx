'use client';

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
export default function Footer() {
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

      <Reveal from="up" className="relative mx-auto w-full max-w-container px-6 py-20">
        {/* Grid de 5 columnas */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <Mark size={30} />
              <span className="text-[18px] font-semibold tracking-[0.06em]">{BRAND.name}</span>
            </div>
            <p className="mt-4 max-w-[300px] text-[14px] leading-[1.6]" style={{ color: 'var(--text-mid)' }}>
              {FOOTER.description}
            </p>
            {/* Mientras no haya perfiles, son marcas, no enlaces. Ver la nota
                de FOOTER.social en content.ts. */}
            <div className="mt-6 grid w-[220px] grid-cols-5 gap-3">
              {FOOTER.social.map((s) => (
                <span
                  key={s.label}
                  title={s.label}
                  className="flex h-[18px] w-[18px] items-center justify-center text-[10px]"
                  style={{ color: 'var(--text-low)' }}
                >
                  {s.label.slice(0, 2)}
                </span>
              ))}
            </div>
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
          <div className="flex gap-4">
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
          </div>

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

          <div className="flex gap-3">
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
          </div>
        </div>
      </Reveal>
    </footer>
  );
}
