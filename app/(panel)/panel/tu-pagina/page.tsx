'use client';
// «Tu página» en el panel: modules/tu-pagina/ui. Aquí solo la ruta.
import { Suspense } from 'react';
import PanelTuPagina from '@/modules/tu-pagina/ui/PanelTuPagina';

// useSearchParams (el QR de la etiqueta trae ?envio=) exige un Suspense alrededor.
export default function Page() {
  return (
    <Suspense>
      <PanelTuPagina />
    </Suspense>
  );
}
