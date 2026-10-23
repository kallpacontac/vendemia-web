import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import { esHex } from './apariencia';
import { esFotoPlantilla } from './fotos';
import { plantillaValida, tipoPagina, type TipoPagina } from './plantillas';

export type ParametrosVista = Record<string, string | undefined>;

/** Aplica la selección del panel únicamente a la vista previa. */
export function conVista(p: PaginaPublica, q?: ParametrosVista): PaginaPublica {
  if (q?.vista !== '1') return p;
  const tipo: TipoPagina = q.tipo === 'agenda' || q.tipo === 'tienda' || q.tipo === 'ambos' ? q.tipo : tipoPagina(p.secciones);
  const anterior = p.secciones.apariencia ?? {};
  return {
    ...p,
    portada_url: q.sp === '1' ? null : p.portada_url,
    color: esHex(q.color) ? q.color : p.color,
    plantilla: plantillaValida(q.plantilla) ? q.plantilla : p.plantilla,
    secciones: {
      ...p.secciones, catalogo: tipo !== 'agenda', reservar: tipo !== 'tienda',
      apariencia: {
        ...anterior,
        plantillaActiva: q.pa === '1',
        colorTienda: esHex(q.ct) ? q.ct : anterior.colorTienda,
        fondoAgenda: esHex(q.fa) ? q.fa : anterior.fondoAgenda,
        fondoTienda: esHex(q.ft) ? q.ft : anterior.fondoTienda,
        colorBanner: esHex(q.cb) ? q.cb : anterior.colorBanner,
        mostrarBanner: q.mb === '0' ? false : q.mb === '1' ? true : anterior.mostrarBanner,
        mostrarWhatsapp: q.mw === '0' ? false : q.mw === '1' ? true : anterior.mostrarWhatsapp,
        catalogoLuxuryDestacado: q.lcd === '0' ? false : q.lcd === '1' ? true : anterior.catalogoLuxuryDestacado,
        vistaServiciosLuxury: q.vs === 'horizontal' ? 'horizontal' : q.vs === 'vertical' ? 'vertical' : anterior.vistaServiciosLuxury,
        mostrarMesero: q.lm === '0' ? false : q.lm === '1' ? true : anterior.mostrarMesero,
        fotoPlantilla: q.fp === undefined ? anterior.fotoPlantilla : esFotoPlantilla(q.fp) ? q.fp : undefined,
      },
    },
  };
}

/** Conserva solo los parámetros necesarios al abrir la reserva de una vista previa. */
export function consultaVista(q?: ParametrosVista): string {
  if (q?.vista !== '1') return '';
  const claves = ['vista', 'tipo', 'plantilla', 'pa', 'color', 'ct', 'fa', 'ft', 'cb', 'mb', 'mw', 'lcd', 'vs', 'lm', 'fp', 'sp'];
  const parametros = new URLSearchParams();
  for (const clave of claves) if (q[clave] !== undefined) parametros.set(clave, q[clave]);
  return `?${parametros.toString()}`;
}
