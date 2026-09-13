import '../globals.css';

/**
 * Las guías no cuelgan de (landing) por lo mismo que no cuelgan las legales:
 * ese layout monta BrandIntro y el scroll con inercia de Lenis.
 *
 * Aquí la intro sobra más todavía que en las legales. A una guía se llega
 * desde Google, con la pregunta recién escrita: poner 2,7 segundos de
 * animación entre el clic y la respuesta es regalarle la visita al siguiente
 * resultado. Y el scroll con inercia estorba en un texto que se recorre
 * buscando una cifra concreta.
 *
 * globals.css se importa igual que en (landing) y (legal): Next carga el CSS
 * por segmento, así que tenerlo en los tres sitios no lo duplica en el
 * navegador.
 */
export default function GuiasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
