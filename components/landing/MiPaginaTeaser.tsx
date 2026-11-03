import { ArrowRight, CalendarDays, ShoppingBag } from 'lucide-react';

export default function MiPaginaTeaser() {
  return <section id="mi-pagina" className="relative overflow-hidden bg-[#fff0e8] px-6 py-20 text-[#0a0a0a] md:py-28">
    <div className="mx-auto grid max-w-container items-center gap-10 lg:grid-cols-[1fr_.9fr] lg:gap-16">
      <div>
        <span className="text-[11px] font-extrabold uppercase tracking-[.2em] text-[#c63c00]">Mi página · Vendemia</span>
        <h2 className="mt-5 max-w-[680px] text-[clamp(42px,5vw,72px)] font-extrabold leading-[1.04] tracking-[-.06em]">Tu negocio también necesita un lugar propio.</h2>
        <p className="mt-6 max-w-[540px] text-[16px] leading-relaxed text-[#5c5c5c]">Muestra lo que vendes, recibe pedidos y facilita las reservas desde una página que configuras con tus fotos, precios y horarios.</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href="/mi-pagina" className="inline-flex items-center gap-3 rounded-full bg-[#ff6a1f] px-6 py-4 text-sm font-bold text-[#1a0a00] transition-transform hover:-translate-y-1 hover:bg-[#ff8340]">Conocer Mi página <ArrowRight size={18} /></a><a href="/mi-pagina#ejemplos" className="inline-flex items-center gap-3 rounded-full border border-[#0a0a0a] px-6 py-4 text-sm font-bold text-[#0a0a0a] transition-transform hover:-translate-y-1">Ver nuestros ejemplos</a></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <a href="/ejemplos/la-baguette" className="group rounded-[28px] bg-white p-3 shadow-sm transition-transform hover:-translate-y-1"><div className="h-40 rounded-[20px] bg-[url('/assets/negocios-ejemplo/cafe-3.webp')] bg-cover bg-center" /><div className="flex items-center justify-between px-2 py-4"><span><b className="block text-sm">La Baguette</b><small className="text-[#5c5c5c]">Carta y pedidos</small></span><ShoppingBag size={20} className="text-[#e85d26]" /></div></a>
        <a href="/ejemplos/canchas" className="group rounded-[28px] bg-white p-3 shadow-sm transition-transform hover:-translate-y-1 sm:translate-y-8 sm:hover:translate-y-7"><div className="h-40 rounded-[20px] bg-[url('/assets/canchas-ejemplo/portada.webp')] bg-cover bg-center" /><div className="flex items-center justify-between px-2 py-4"><span><b className="block text-sm">Zona Gol</b><small className="text-[#5c5c5c]">Canchas y reservas</small></span><CalendarDays size={20} className="text-[#e85d26]" /></div></a>
      </div>
    </div>
  </section>;
}
