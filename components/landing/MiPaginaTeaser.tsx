import { ArrowRight, CalendarDays, ShoppingBag } from 'lucide-react';

export default function MiPaginaTeaser() {
  return <section id="mi-pagina" className="relative overflow-hidden bg-[#eaf2e5] px-6 py-20 text-[#14241a] md:py-28">
    <div className="mx-auto grid max-w-container items-center gap-10 lg:grid-cols-[1fr_.9fr] lg:gap-16">
      <div>
        <span className="text-[11px] font-extrabold uppercase tracking-[.2em] text-[#28734d]">Mi página · Vendemia</span>
        <h2 className="mt-5 max-w-[680px] text-[clamp(42px,5vw,72px)] font-extrabold leading-[1.04] tracking-[-.06em]">Tu negocio también necesita un lugar propio.</h2>
        <p className="mt-6 max-w-[540px] text-[16px] leading-relaxed text-[#526055]">Muestra lo que vendes, recibe pedidos y facilita las reservas desde una página que configuras con tus fotos, precios y horarios.</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href="/mi-pagina" className="inline-flex items-center gap-3 rounded-full bg-[#1a3f2b] px-6 py-4 text-sm font-bold text-white transition-transform hover:-translate-y-1">Conocer Mi página <ArrowRight size={18} /></a><a href="/mi-pagina#ejemplos" className="inline-flex items-center gap-3 rounded-full border border-[#1a3f2b] px-6 py-4 text-sm font-bold text-[#1a3f2b] transition-transform hover:-translate-y-1">Ver nuestros ejemplos</a></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <a href="/ejemplos/la-baguette" className="group rounded-[28px] bg-white p-3 shadow-sm transition-transform hover:-translate-y-1"><div className="h-40 rounded-[20px] bg-[url('/assets/negocios-ejemplo/cafe-3.webp')] bg-cover bg-center" /><div className="flex items-center justify-between px-2 py-4"><span><b className="block text-sm">La Baguette</b><small className="text-[#66736b]">Carta y pedidos</small></span><ShoppingBag size={20} className="text-[#28734d]" /></div></a>
        <a href="/ejemplos/canchas" className="group rounded-[28px] bg-white p-3 shadow-sm transition-transform hover:-translate-y-1 sm:translate-y-8 sm:hover:translate-y-7"><div className="h-40 rounded-[20px] bg-[url('/assets/canchas-ejemplo/portada.webp')] bg-cover bg-center" /><div className="flex items-center justify-between px-2 py-4"><span><b className="block text-sm">Zona Gol</b><small className="text-[#66736b]">Canchas y reservas</small></span><CalendarDays size={20} className="text-[#28734d]" /></div></a>
      </div>
    </div>
  </section>;
}
