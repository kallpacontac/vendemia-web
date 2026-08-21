'use client';

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { ASSETS, ASSET_IDS, type AssetId } from '@/lib/assets';

/**
 * /dev/assets — checklist de producción.
 *
 * Lista los 23 slots declarados, su estado y —cuando la home ya se ha
 * visitado en esta sesión— las medidas REALES a las que se está renderizando
 * cada uno. Eso es lo que le pasas al diseñador: no "haz una imagen", sino
 * "haz una imagen de 880×1100 que va a ir aquí".
 *
 * Solo existe en desarrollo.
 */

type Measured = Record<string, { w: number; h: number; count: number }>;

export default function DevAssetsPage() {
  const [measured, setMeasured] = useState<Measured>({});
  const [scanned, setScanned] = useState(false);

  // Mide los slots abriendo la home en un iframe oculto.
  useEffect(() => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-9999px;width:1440px;height:1200px;border:0';
    frame.src = '/';
    frame.onload = () => {
      window.setTimeout(() => {
        const doc = frame.contentDocument;
        if (!doc) return;
        const found: Measured = {};
        doc.querySelectorAll<HTMLElement>('[data-asset-slot]').forEach((node) => {
          const id = node.dataset.assetSlot!;
          const r = node.getBoundingClientRect();
          if (!found[id]) found[id] = { w: 0, h: 0, count: 0 };
          found[id].count += 1;
          found[id].w = Math.max(found[id].w, Math.round(r.width));
          found[id].h = Math.max(found[id].h, Math.round(r.height));
        });
        setMeasured(found);
        setScanned(true);
        frame.remove();
      }, 1500);
    };
    document.body.appendChild(frame);
    return () => frame.remove();
  }, []);

  // Después de los hooks, para no romper el orden de llamada.
  if (process.env.NODE_ENV === 'production') notFound();

  const ready = ASSET_IDS.filter((id) => ASSETS[id].url).length;
  const total = ASSET_IDS.length;

  return (
    <div className="min-h-screen px-6 py-16" style={{ background: 'var(--bg-900)' }}>
      <div className="mx-auto max-w-container">
        <h1 className="text-[32px] font-semibold tracking-[-0.02em]">Assets</h1>
        <p className="mt-2 text-body" style={{ color: 'var(--text-mid)' }}>
          {ready} de {total} listos ·{' '}
          {scanned ? 'medidas tomadas sobre la home a 1440px' : 'midiendo la home…'}
        </p>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-700)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(ready / total) * 100}%`, background: 'var(--orange-500)' }}
          />
        </div>

        <div className="mt-10 overflow-x-auto rounded-card border" style={{ borderColor: 'var(--border-dark)' }}>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr style={{ color: 'var(--text-low)' }}>
                {['Estado', 'ID', 'Tipo', 'Sección', 'Prioridad', 'Spec', 'Render real', 'Usos'].map((h) => (
                  <th key={h} className="border-b p-4 font-medium" style={{ borderColor: 'var(--border-dark)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ASSET_IDS.map((id) => {
                const a = ASSETS[id as AssetId];
                const m = measured[id];
                const isReady = Boolean(a.url);
                return (
                  <tr key={id}>
                    <td className="border-b p-4" style={{ borderColor: 'var(--border-darker)' }}>
                      <span
                        className="inline-flex h-6 items-center rounded-full px-2 text-[11px] font-medium"
                        style={
                          isReady
                            ? { background: 'rgba(80,200,120,.15)', color: '#6ee7a0' }
                            : { background: 'rgba(255,73,0,.15)', color: 'var(--orange-500)' }
                        }
                      >
                        {isReady ? 'listo' : 'pendiente'}
                      </span>
                    </td>
                    <td className="border-b p-4 font-mono" style={{ borderColor: 'var(--border-darker)' }}>
                      {id}
                    </td>
                    <td className="border-b p-4" style={{ borderColor: 'var(--border-darker)', color: 'var(--text-mid)' }}>
                      {a.kind}
                    </td>
                    <td className="border-b p-4" style={{ borderColor: 'var(--border-darker)', color: 'var(--text-mid)' }}>
                      {a.section}
                    </td>
                    <td className="border-b p-4" style={{ borderColor: 'var(--border-darker)', color: 'var(--text-mid)' }}>
                      {a.priority}
                    </td>
                    <td className="border-b p-4" style={{ borderColor: 'var(--border-darker)', color: 'var(--text-mid)' }}>
                      {a.spec}
                    </td>
                    <td className="border-b p-4 font-mono" style={{ borderColor: 'var(--border-darker)', color: 'var(--text-low)' }}>
                      {m ? `${m.w}×${m.h}` : '—'}
                    </td>
                    <td className="border-b p-4" style={{ borderColor: 'var(--border-darker)', color: 'var(--text-low)' }}>
                      {m?.count ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
