import type { Metadata } from 'next';
import Marco from '@/components/legal/Marco';

/**
 * Lo que abre el QR de «Conectar celular» (Configuración › Cobros) cuando la cámara no entrega el enlace a la
 * app: muestra el código y un botón que abre Vendemia Caja con él ya puesto. La app también se abre
 * sola desde este enlace si Android verificó vendemias.com (public/.well-known/assetlinks.json).
 * ⚠️ La ruta va en la app (AndroidManifest: /caja/vincular). Si cambia, se cambia en los dos.
 */
export const metadata: Metadata = {
  title: 'Conectar Vendemia Caja · Vendemia',
  description: 'Conecta el celular de tu Yape con tu panel de Vendemia.',
  robots: { index: false, follow: false },
};

export default function Pagina({ searchParams }: { searchParams: { c?: string } }) {
  const codigo = (searchParams.c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const abrir = `intent://vincular?c=${codigo}#Intent;scheme=vendemiacaja;package=pe.vendemia.caja;end`;
  return (
    <Marco titulo="Conectar Vendemia Caja" bajada="Une el celular de tu Yape con tu panel." conFecha={false}>
      {codigo.length === 6 ? (
        <>
          <p>Tu código:</p>
          <p style={{ font: '700 34px/1.2 ui-monospace, monospace', letterSpacing: '.14em', margin: '4px 0 18px' }}>
            {codigo.slice(0, 3)}&nbsp;{codigo.slice(3)}
          </p>
          <p>
            <a href={abrir} style={{ display: 'inline-block', padding: '12px 20px', borderRadius: 12, background: '#14211A', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
              Abrir Vendemia Caja
            </a>
          </p>
          <p>Si el botón no hace nada, abre la app tú mismo, toca <b>Conectar con Vendemia</b> y escribe el código.</p>
        </>
      ) : (
        <p>Pide el código en tu panel: <b>Configuración › Cobros › Conectar celular</b>.</p>
      )}
      <p>
        ¿Aún no tienes la app? Escríbenos por{' '}
        <a href="https://wa.me/51947144701?text=Hola%2C%20quiero%20instalar%20Vendemia%20Caja">WhatsApp</a> y te ayudamos a
        instalarla. Funciona en Android.
      </p>
    </Marco>
  );
}
