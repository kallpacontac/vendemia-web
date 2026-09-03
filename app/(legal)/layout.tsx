import '../globals.css';

/**
 * ⚠️ LAS PÁGINAS LEGALES NO CUELGAN DEL GRUPO (landing), Y ES DELIBERADO.
 *
 * El layout de la landing monta BrandIntro y SmoothScroll. Los dos sobran aquí,
 * y el primero sobra mucho: quien abre el Libro de Reclamaciones normalmente
 * viene molesto y con una gestión que hacer. Ponerle delante 2,7 segundos de
 * animación de marca antes de dejarle escribir su reclamo es exactamente el
 * gesto que convierte una queja en una denuncia.
 *
 * El scroll de Lenis tampoco: en un texto largo que la gente recorre buscando
 * una cláusula concreta, el scroll con inercia estorba.
 *
 * globals.css sí se importa —aquí también hacen falta los tokens de color y la
 * tipografía—, igual que hace (landing). Next carga el CSS por segmento, así
 * que importarlo en los dos sitios no lo duplica en el navegador.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
