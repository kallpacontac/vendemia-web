'use client';

/**
 * La configuración de Boletas y facturas (proveedor, token, series, ticket) dentro de Ajustes. La
 * pantalla de emitir vive en Caja; esto, aparte (The 24/7, 17-nov). Se abre sola si se llega con
 * #facturacion (el enlace «Configurar» de la pantalla de boletas).
 */
import { useEffect, useState } from 'react';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import AjustesFacturacion from './AjustesFacturacion';
import { leerAjustes, SinTablas } from './api';

export default function SeccionFacturacion() {
  const { companyId } = useSesion();
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    if (window.location.hash === '#facturacion') {
      setAbierta(true);
      window.setTimeout(() => document.getElementById('facturacion')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  }, []);

  const carga = useCargar(async () => {
    if (!companyId) return null;
    try {
      return await leerAjustes(companyId);
    } catch (e) {
      if (e instanceof SinTablas) return 'sin_tablas' as const;
      throw e;
    }
  }, [companyId]);

  return (
    <details id="facturacion" className="cfg-advanced cfg-advanced--section" open={abierta}
      onToggle={(e) => setAbierta((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Boletas y facturas (SUNAT)</summary>
      {carga.datos === 'sin_tablas' ? (
        <p className="vacio">Falta instalar la facturación en la base (modules/facturacion/sql/0001).</p>
      ) : carga.error ? (
        <p className="vacio">{carga.error}</p>
      ) : !carga.datos || !companyId ? (
        <p className="cargando">Cargando…</p>
      ) : (
        <AjustesFacturacion key={`${companyId}-${carga.datos.configurado}`} companyId={companyId} inicial={carga.datos} alGuardar={() => carga.recargar()} />
      )}
    </details>
  );
}
