import type { Metadata } from 'next';
import Marco from '@/modules/tu-pagina/publico/Marco';
import MesaEjemplo from '@/modules/tu-pagina/publico/MesaEjemplo';
import EjemplosNav from '@/modules/tu-pagina/publico/EjemplosNav';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';

export const metadata: Metadata = {
  title: 'Casa Brasa · Atención en mesa | Vendemia',
  description: 'Ejemplo interactivo: el QR de una mesa para ver la carta, llamar al mozo y pedir la cuenta.',
  robots: { index: false, follow: false },
};

const pagina: PaginaPublica = {
  slug: 'casa-brasa-ejemplo', version: 1, titulo: 'Casa Brasa', frase: 'Cocina peruana a la brasa', whatsapp: '',
  secciones: { catalogo: true, apariencia: { plantillaActiva: true } }, plantilla: 'mesa', color: '#ED1019',
  logo_url: '/assets/restaurante-ejemplo/casa-brasa-wordmark.svg', portada_url: null, distritos: [],
};

export default function Page() {
  return (
    <Marco pagina={pagina}>
      <MesaEjemplo />
      <EjemplosNav actual="mesa" />
    </Marco>
  );
}
