'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TU PÁGINA EN EL PANEL · la página del negocio, sus reservas y reclamos
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Las reservas separadas (sin agenda en la nube) y los reclamos se muestran
 * como pestañas junto al editor. Si solo está el editor, no se dibuja una
 * pestaña redundante: el título de la pantalla ya explica dónde está el usuario.
 *
 * Los pedidos de la página y los envíos NO están aquí: van a /panel/pedidos,
 * con los que cierra Mia (27-oct-2026: antes había tres sitios). Los enlaces
 * viejos (?envio= de las etiquetas impresas, ?ver=pedidos|envios) se redirigen.
 *
 * Por fuera el producto se llama «Mi página» (Alvaro, 19-oct-2026; fue «Tu página» y, unas horas, «Pide»).
 * Por dentro sigue siendo tu-pagina: módulo, tablas, API y rutas.
 * El host del enlace depende del modo: dominio/config.ts.
 *
 * Todo escribe en la nube (tablas tu_pagina / envios, RPC con la sesión del usuario):
 * no pasa por el bot y funciona igual en un negocio sin bot.
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, Download, ExternalLink, FileText, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { COLORES, tintaSobre } from '@/modules/fideliza/dominio/estilo';
import Link from 'next/link';
import { urlPagina, urlEnvio, urlReservar } from '@/modules/tu-pagina/dominio/config';
import { esAppointmentFamily, esEcommerce, esRecurrente } from '@/lib/panel/modo';
import { tipoPorDefecto, type TiposDePagina } from '@/modules/tu-pagina/dominio/tienda';
import type { BusinessMode } from '@/lib/supabase/types';
import { EXPERIENCIAS, PLANTILLAS, PLANTILLAS_AGENDA, PLANTILLAS_AMBOS, esNegocioGastronomico, pedidoGastronomicoDe, plantillaSugerida, plantillaValida, tipoPagina, tipoPorDefecto as tipoPaginaPorDefecto, type PlantillaGuardada, type TipoPagina } from '@/modules/tu-pagina/dominio/plantillas';
import { esHex, esUrlPublica, type AparienciaPagina } from '@/modules/tu-pagina/dominio/apariencia';
import { urlEjemploPara } from '@/modules/tu-pagina/dominio/ejemplo';
import { FOTOS_PLANTILLA, FOTOS_SERVICIOS_LUXURY, esFotoPlantilla, fotoPlantillaPorDefecto } from '@/modules/tu-pagina/dominio/fotos';
import { subirImagenMarca } from '@/modules/fideliza/cliente/imagenMarca';

/**
 * La página con otra plantilla o color, sin guardar: se sirve en el dominio del
 * panel (hosts.ts no la manda a tienda.*) para poder ir en un iframe.
 */
const urlVista = (slug: string, valores: {
  tipo: TipoPagina; plantilla: PlantillaGuardada; plantillaActiva: boolean; color: string; apariencia: AparienciaPagina; sinPortada: boolean;
}) => {
  const q = new URLSearchParams({ vista: '1', tipo: valores.tipo, plantilla: valores.plantilla, pa: valores.plantillaActiva ? '1' : '0', color: valores.color,
    ct: valores.apariencia.colorTienda ?? '', fa: valores.apariencia.fondoAgenda ?? '',
    ft: valores.apariencia.fondoTienda ?? '', cb: valores.apariencia.colorBanner ?? '',
    mb: valores.apariencia.mostrarBanner === false ? '0' : '1',
    mw: valores.apariencia.mostrarWhatsapp === false ? '0' : '1',
    lcd: valores.apariencia.catalogoLuxuryDestacado === true ? '1' : '0',
    vs: valores.apariencia.vistaServiciosLuxury === 'horizontal' ? 'horizontal' : 'vertical',
    lm: valores.apariencia.mostrarMesero === true ? '1' : '0',
    mpi: valores.apariencia.mensajePedidoIntro ?? '',
    pmp: (valores.apariencia.pedirMetodoPago ?? pedidoGastronomicoDe(valores.plantilla, valores.tipo)) ? '1' : '0',
    pnp: (valores.apariencia.pedirNotaPedido ?? pedidoGastronomicoDe(valores.plantilla, valores.tipo)) ? '1' : '0',
    pup: (valores.apariencia.pedirUbicacion ?? pedidoGastronomicoDe(valores.plantilla, valores.tipo)) ? '1' : '0',
    fp: valores.apariencia.fotoPlantilla ?? '', sp: valores.sinPortada ? '1' : '0',
  });
  return `/tu-pagina/${slug}?${q.toString()}`;
};
import { Reservas } from '@/modules/tu-pagina/ui/PedidosYReservas';
import Reclamos from '@/modules/tu-pagina/ui/Reclamos';
import Avisame from '@/modules/tu-pagina/ui/Avisame';
import { ConfigDeCanchas } from '@/modules/tu-pagina/ui/Canchas';
import { normalizarCanchas, type ConfigCanchas } from '@/modules/tu-pagina/dominio/canchas';
import { proveedorCompleto, rucValido, type Proveedor } from '@/modules/tu-pagina/dominio/reclamos';
import { telefonoBonito, telefonoNormal } from '@/modules/tu-pagina/dominio/envio';
import '@/modules/tu-pagina/estilos/panel.css';

interface Pagina {
  company_id: string;
  slug: string;
  titulo: string;
  frase: string;
  whatsapp: string;
  secciones: {
    catalogo?: boolean; reservar?: boolean; envios?: boolean; tipos?: TiposDePagina; apariencia?: AparienciaPagina;
    reclamos?: boolean; proveedor?: Partial<Proveedor>; canchas?: ConfigCanchas;
  };
  logo_url: string | null;
  portada_url: string | null;
  color: string;
  plantilla: string;
  distritos: string[];
  publicada: boolean;
}

type Pestana = 'reservas' | 'reclamos' | 'avisame' | 'pagina';

type Es = TipoPagina;
const ES = EXPERIENCIAS;
const esDe = (s: Pagina['secciones'] | undefined): Es | null =>
  s?.catalogo || s?.reservar ? tipoPagina(s) : null;

const mensajeDe = (e: unknown) => {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (m.includes('tu_pagina:slug_ocupado')) return 'Esa dirección ya la tiene otro negocio.';
  if (m.includes('tu_pagina:slug_reservado')) return 'Esa dirección no está disponible.';
  if (m.includes('tu_pagina:slug_invalido')) return 'La dirección: de 3 a 40 letras minúsculas, números o guiones.';
  if (m.includes('tu_pagina:falta_whatsapp')) return 'Pon tu WhatsApp: es a donde llegan los pedidos.';
  return m;
};

export default function PanelTuPagina() {
  const { companyId, compania } = useSesion();
  const params = useSearchParams();
  const router = useRouter();
  // Lo que antes vivía aquí: el QR de las etiquetas ya impresas y los avisos viejos.
  const codigoBuscado = params.get('envio');
  const pedida = params.get('ver');
  const mudado = codigoBuscado
    ? `/panel/pedidos?envio=${encodeURIComponent(codigoBuscado)}`
    : pedida === 'envios' ? '/panel/pedidos?ver=envios' : pedida === 'pedidos' ? '/panel/pedidos?ver=pagina' : null;
  useEffect(() => {
    if (mudado) router.replace(mudado);
  }, [mudado, router]);
  const { datos: pagina, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const { data, error } = await supabase().from('tu_pagina').select('*').eq('company_id', companyId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Pagina | null) ?? null;
  }, [companyId]);
  // Con la agenda en la nube (modules/datos/sql/0004) lo que llega por la página entra en la
  // Agenda, no en reservas_web: esa pestaña sobra.
  const [agendaNube, setAgendaNube] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    void supabase()
      .rpc('agenda_en_nube', { p_company: companyId })
      .then(({ data }) => setAgendaNube(data === true));
  }, [companyId]);
  const sinPagina = !cargando && !error && !pagina?.publicada;
  const s = pagina?.publicada ? pagina.secciones ?? {} : {};
  const pestanas = [
    { id: 'pagina' as const, nombre: 'La página' },
    ...(s.reclamos ? [{ id: 'reclamos' as const, nombre: 'Reclamos' }] : []),
    ...(s.reservar && s.canchas?.activo ? [{ id: 'avisame' as const, nombre: 'Avísame' }] : []),
    ...(s.reservar && !agendaNube ? [{ id: 'reservas' as const, nombre: esRecurrente(compania?.business_mode) ? 'Cupos' : 'Reservas' }] : []),
  ];
  const [pestana, setPestana] = useState<Pestana | null>(null);
  // ?ver=reclamos: el enlace del correo que avisa de una hoja nueva; ?ver=reservas, el del aviso.
  const activa: Pestana = pestana && pestanas.some((p) => p.id === pestana)
    ? pestana
    : pedida && pestanas.some((p) => p.id === pedida) ? (pedida as Pestana) : pestanas[0].id;

  useEffect(() => {
    if (sinPagina) setPestana('pagina');
  }, [sinPagina]);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Mi página" sub="El enlace para que tus clientes te pidan, y lo que te piden" />
        {error && <p className="vacio">No se pudo cargar: {error}</p>}
        {cargando && !pagina && <p className="vacio">Cargando…</p>}
        {!cargando && !error && companyId && !mudado && (
          <>
            {pestanas.length > 1 && (
              <div className="tp-panel-tabs" role="tablist" aria-label="Secciones de Mi página">
                {pestanas.map((p) => (
                  <button key={p.id} role="tab" aria-selected={activa === p.id} className={activa === p.id ? 'active' : ''} onClick={() => setPestana(p.id)}>
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}
            {activa === 'pagina' ? (
              <MiPagina companyId={companyId} nombre={compania?.nombre ?? ''} pagina={pagina ?? null} agendaNube={agendaNube} alGuardar={releer} />
            ) : activa === 'avisame' ? (
              <Avisame companyId={companyId} slug={pagina?.slug ?? ''} negocio={pagina?.titulo || compania?.nombre || ''} />
            ) : activa === 'reservas' ? (
              <Reservas companyId={companyId} nombre={pagina?.titulo || compania?.nombre || ''} />
            ) : (
              <Reclamos companyId={companyId} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   LA PÁGINA
   ═══════════════════════════════════════════════════════════════════════ */

function MiPagina({ companyId, nombre, pagina, agendaNube, alGuardar }: {
  companyId: string; nombre: string; pagina: Pagina | null; agendaNube: boolean; alGuardar: () => void;
}) {
  const avisar = useAvisar();
  const { compania } = useSesion();
  const [titulo, setTitulo] = useState(pagina?.titulo || nombre);
  const [frase, setFrase] = useState(pagina?.frase ?? '');
  const [slug, setSlug] = useState(pagina?.slug ?? sugerirSlug(nombre || companyId));
  const [slugManual, setSlugManual] = useState(false);
  const [whatsapp, setWhatsapp] = useState(telefonoBonito(pagina?.whatsapp ?? ''));
  const modo = compania?.business_mode;
  const tienda = esEcommerce(modo);
  const tipoSugerido = tienda || esNegocioGastronomico(nombre) ? 'tienda' : 'agenda';
  const [envios, setEnvios] = useState(pagina?.secciones?.envios ?? false);
  const [reclamos, setReclamos] = useState(pagina?.secciones?.reclamos ?? false);
  const [canchas, setCanchas] = useState<ConfigCanchas>(pagina?.secciones?.canchas ?? { desde: '18:00' });
  const [funcionesAbiertas, setFuncionesAbiertas] = useState(Boolean(pagina?.secciones?.envios || pagina?.secciones?.reclamos || pagina?.secciones?.canchas?.activo));
  const [proveedor, setProveedor] = useState<Proveedor>({
    razon_social: pagina?.secciones?.proveedor?.razon_social ?? '',
    ruc: pagina?.secciones?.proveedor?.ruc ?? '',
    direccion: pagina?.secciones?.proveedor?.direccion ?? '',
  });
  // Por defecto, lo que hace cada negocio: la tienda vende, el de citas o clases reserva.
  // Una página antigua solo de envíos no es ninguna de las tres, y así se queda si no se elige.
  const [es, setEs] = useState<Es>(pagina ? esDe(pagina.secciones) ?? tipoPaginaPorDefecto(modo) : tipoSugerido);
  const [tipoManual, setTipoManual] = useState(false);
  const [plantilla, setPlantilla] = useState<PlantillaGuardada>(
    plantillaValida(pagina?.plantilla) ? pagina.plantilla : plantillaSugerida(pagina ? esDe(pagina.secciones) ?? tipoPaginaPorDefecto(modo) : tipoSugerido, nombre),
  );
  const [plantillaManual, setPlantillaManual] = useState(false);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [tipos, setTipos] = useState<TiposDePagina>(pagina?.secciones?.tipos ?? {});
  const catalogo = es === 'tienda' || es === 'ambos';
  const reservar = es === 'agenda' || es === 'ambos';
  const [distritos, setDistritos] = useState((pagina?.distritos ?? []).join(', '));
  const [color, setColor] = useState(pagina?.color ?? (esNegocioGastronomico(nombre) ? '#B9662F' : /barber|peluquer|sal[oó]n|estil|cabello|spa|beauty/i.test(nombre) ? '#D0AB75' : tienda ? '#111111' : '#006BFF'));
  const [colorManual, setColorManual] = useState(false);
  const [logo, setLogo] = useState(pagina?.logo_url ?? '');
  const [portada, setPortada] = useState(pagina?.portada_url ?? '');
  const [apariencia, setApariencia] = useState<AparienciaPagina>(pagina?.secciones?.apariencia ?? (esNegocioGastronomico(nombre) ? { fotoPlantilla: /pizzer|pizza/i.test(nombre) ? 'pizzeria' : 'cafeteria' } : {}));
  const [subiendo, setSubiendo] = useState<'logo' | 'portada' | 'portadaLuxurySecundaria' | null>(null);
  const [libre, setLibre] = useState<boolean | null>(null);
  const [errorSlug, setErrorSlug] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (slug === pagina?.slug) {
      setErrorSlug(false);
      setLibre(true);
      return;
    }
    let vigente = true;
    setLibre(null);
    setErrorSlug(false);
    const t = setTimeout(async () => {
      const { data, error } = await supabase().rpc('tu_pagina_slug_libre', { p_company: companyId, p_slug: slug });
      if (!vigente) return;
      setErrorSlug(Boolean(error));
      setLibre(error ? null : data === true);
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [slug, companyId, pagina?.slug]);

  async function subirImagen(file: File, destino: 'logo' | 'portada' | 'portadaLuxurySecundaria') {
    setSubiendo(destino);
    try {
      const url = await subirImagenMarca(file, companyId, destino === 'logo' ? 'brand' : 'catalog');
      if (destino === 'logo') setLogo(url);
      else if (destino === 'portada') setPortada(url);
      else setApariencia((actual) => ({ ...actual, portadaLuxurySecundaria: url }));
      avisar('Imagen lista. Guarda los cambios para publicarla.');
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    } finally {
      setSubiendo(null);
    }
  }

  async function guardar() {
    if (!esUrlPublica(logo) || !esUrlPublica(portada) || !esUrlPublica(apariencia.portadaLuxurySecundaria ?? '')) { avisar('Las fotos deben tener un enlace público https.', 'error'); return; }
    if (!/^\d{8,15}$/.test(telefonoNormal(whatsapp))) { avisar('Revisa el número de WhatsApp antes de publicar.', 'error'); return; }
    if (reclamos && !proveedorCompleto(proveedor)) { avisar('Para el Libro de Reclamaciones faltan tu razón social, un RUC válido (11 cifras) y la dirección.', 'error'); return; }
    const aparienciaPublicada = { ...apariencia, plantillaActiva: !pagina?.publicada || plantillaManual || apariencia.plantillaActiva === true };
    setGuardando(true);
    try {
      const { error } = await supabase().rpc('tu_pagina_guardar', {
        p_company: companyId,
        p_publicar: true,
        p_datos: {
          slug,
          titulo: titulo.trim(),
          frase: frase.trim(),
          whatsapp: telefonoNormal(whatsapp),
          color,
          plantilla,
          logo_url: logo.trim(),
          portada_url: portada.trim(),
          secciones: {
            envios, catalogo, reservar, tipos: es === 'ambos' ? tipos : {},
            apariencia: aparienciaPublicada,
            reclamos,
            canchas: normalizarCanchas({ ...canchas, activo: Boolean(canchas.activo && reservar) }),
            proveedor: { razon_social: proveedor.razon_social.trim(), ruc: proveedor.ruc.replace(/\D/g, ''), direccion: proveedor.direccion.trim() },
          },
          distritos: distritos.split(/[,\n]/).map((d) => d.trim()).filter(Boolean),
        },
      });
      if (error) throw error;
      const { data } = await supabase().auth.getSession();
      await fetch('/api/tu-pagina/panel/publicar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ company_id: companyId }),
      }).catch(() => undefined);
      setApariencia(aparienciaPublicada);
      setPlantillaManual(false);
      avisar('Publicada. Ya la pueden abrir tus clientes.');
      alGuardar();
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  const publicada = pagina?.publicada && pagina.slug;
  const vista = urlVista(pagina?.slug ?? slug, { tipo: es, plantilla, plantillaActiva: !pagina?.publicada || plantillaManual || apariencia.plantillaActiva === true || pagina?.secciones?.apariencia?.plantillaActiva === true, color, apariencia, sinPortada: !portada.trim() });
  const verPaso = (numero: 1 | 2 | 3) => Boolean(publicada || paso === numero);
  // Al guardar queda activa la plantilla (ver `guardar`): solo entonces sale su foto de respaldo.
  const usaPlantilla = !pagina?.publicada || plantillaManual || apariencia.plantillaActiva === true;
  const opcionesBase = es === 'agenda' ? PLANTILLAS_AGENDA : es === 'ambos' ? PLANTILLAS_AMBOS : PLANTILLAS;
  const plantillas = plantillaValida(pagina?.plantilla) && es === tipoPagina(pagina.secciones) && !opcionesBase.some((p) => p.id === pagina.plantilla)
    ? [...opcionesBase, { id: pagina.plantilla, nombre: pagina.plantilla === 'clases' ? 'Clases' : pagina.plantilla === 'envios' ? 'Envíos' : 'Diseño anterior', describe: 'Diseño que ya tiene tu página.' }]
    : opcionesBase;

  return (
    <div className="tp-panel-grid">
      <section className="card">
        <div className="card-mini-head"><h3>{publicada ? 'Mi página' : 'Crea tu página en 3 pasos'}</h3></div>
        {!publicada && (
          <nav className="tp-panel-progreso" aria-label="Pasos para publicar">
            {(['Tu negocio', 'Tu diseño', 'Publica'] as const).map((nombrePaso, indice) => {
              const numero = (indice + 1) as 1 | 2 | 3;
              return <button key={numero} type="button" className={paso === numero ? 'activo' : ''} aria-current={paso === numero ? 'step' : undefined} disabled={numero > paso} onClick={() => setPaso(numero)}><span>{numero < paso ? '✓' : numero}</span>{nombrePaso}</button>;
            })}
          </nav>
        )}

        <div className="tp-panel-paso" hidden={!verPaso(1)}>
        <label className="tp-panel-campo">
          <span>Nombre que verán tus clientes</span>
          <input className="input" value={titulo} maxLength={60} onChange={(e) => {
            const nombreNuevo = e.target.value;
            const tipoNuevo = !pagina && !tipoManual ? (tienda || esNegocioGastronomico(nombreNuevo) ? 'tienda' : 'agenda') : es;
            setTitulo(nombreNuevo);
            if (tipoNuevo !== es) setEs(tipoNuevo);
            if (!pagina?.publicada && !slugManual) setSlug(sugerirSlug(nombreNuevo));
            if (!plantillaManual) setPlantilla(plantillaSugerida(tipoNuevo, nombreNuevo));
            if (!pagina && !colorManual) setColor(esNegocioGastronomico(nombreNuevo) ? '#B9662F' : /barber|peluquer|sal[oó]n|estil|cabello|spa|beauty/i.test(nombreNuevo) ? '#D0AB75' : tienda ? '#111111' : '#006BFF');
          }} />
        </label>
        <label className="tp-panel-campo">
          <span>Una línea debajo <small className="muted">(opcional)</small></span>
          <input className="input" value={frase} maxLength={120} placeholder="Envíos en todo Lima, recojo el mismo día" onChange={(e) => setFrase(e.target.value)} />
        </label>
        </div>
        <div className="tp-panel-paso" hidden={!verPaso(3)}>
        <label className="tp-panel-campo">
          <span>Tu WhatsApp, a donde te llegará todo</span>
          <input className="input" value={whatsapp} inputMode="tel" placeholder="987 654 321" onChange={(e) => setWhatsapp(e.target.value)} />
        </label>
        </div>
        <div className="tp-panel-paso" hidden={!verPaso(2)}>
          <div className="tp-panel-campo">
            <span>Elige un diseño para tu página</span>
            <small className="muted">Puedes cambiarlo después. El diseño sugerido ya está seleccionado.</small>
            {publicada && !pagina?.secciones?.apariencia?.plantillaActiva && !plantillaManual && <small className="muted">Tu página conserva su aspecto actual. Elige un diseño para activar el nuevo estilo.</small>}
            <div className="tp-panel-plantillas" role="radiogroup" aria-label="Diseño de la página">
              {plantillas.map((opcion) => (
                <div key={opcion.id} className={`tp-panel-plantilla${plantilla === opcion.id ? ' activa' : ''}`}>
                  <button type="button" role="radio" aria-checked={plantilla === opcion.id} onClick={() => {
                    if (opcion.id === 'luxury' && plantilla !== 'luxury') {
                      setApariencia((actual) => ({ ...actual, fotoPlantilla: 'barberia' }));
                      if (!pagina?.publicada && !colorManual) setColor('#D0AB75');
                    }
                    if (opcion.id === 'restaurante' && plantilla !== 'restaurante') {
                      setApariencia((actual) => ({ ...actual, fotoPlantilla: /pizzer|pizza/i.test(titulo) ? 'pizzeria' : 'cafeteria' }));
                      if (!pagina?.publicada && !colorManual) setColor('#B9662F');
                    }
                    setPlantilla(opcion.id);
                    setPlantillaManual(true);
                  }}>
                    <span className={`tp-panel-plantilla__dibujo tp-panel-plantilla__dibujo--${opcion.id}`} style={{ ['--c' as string]: color }} aria-hidden="true"><i /><i /><i /><i /></span>
                    <b>{opcion.nombre}</b><small>{opcion.describe}</small>
                  </button>
                  <a href={urlEjemploPara(es, opcion.id, apariencia.vistaServiciosLuxury)} target="_blank" rel="noopener">Ver ejemplo completo <ExternalLink size={13} /></a>
                </div>
              ))}
            </div>
          </div>
        <div className="tp-panel-campo"><span>Logo <small className="muted">(opcional)</small></span>
          <div className="tp-panel-imagen-acciones">
            <label className="tp-panel-subir">{subiendo === 'logo' ? 'Subiendo…' : logo ? 'Cambiar logo' : 'Subir logo'}
              <input type="file" accept="image/*" disabled={subiendo !== null} onChange={(e) => { const file = e.target.files?.[0]; if (file) void subirImagen(file, 'logo'); e.target.value = ''; }} />
            </label>
            {logo && <button type="button" className="btn btn-sm btn-ghost" disabled={subiendo !== null} onClick={() => setLogo('')}>Quitar</button>}
          </div>
          {logo && esUrlPublica(logo) && <img className="tp-panel-imagen tp-panel-imagen--logo" src={logo} alt="Vista previa del logo" />}
          {publicada && <label className="tp-panel-enlace-imagen">O pega un enlace HTTPS<input className="input" type="url" value={logo} placeholder="https://…/mi-logo.png" onChange={(e) => setLogo(e.target.value)} /></label>}
        </div>
        </div>

        <div className="tp-panel-paso" hidden={!verPaso(3)}>
        <label className="tp-panel-campo">
          <span>Tu dirección</span>
          <div className="tp-panel-slug">
            <span className="muted">{urlPagina('', compania?.business_mode).replace(/^https?:\/\//, '')}</span>
            <input className="input" value={slug} maxLength={40} onChange={(e) => { setSlugManual(true); setSlug(sugerirSlug(e.target.value, true)); }} />
          </div>
          <small className={libre === false || errorSlug ? 'tp-panel-mal' : 'muted'}>
            {errorSlug ? 'No se pudo comprobar. Intenta nuevamente.' : libre === null ? 'Comprobando…' : libre ? 'Disponible' : 'No disponible: prueba con otra'}
          </small>
        </label>
        </div>

        <div className="tp-panel-paso" hidden={!verPaso(1)}>
        <div className="tp-panel-campo">
          <span>¿Qué harán tus clientes en tu página?</span>
          <div className="tp-panel-es" role="radiogroup" aria-label="Tu página es">
            {ES.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={es === o.id} className={es === o.id ? 'activa' : ''} onClick={() => { setTipoManual(true); setEs(o.id); if (!plantillaManual) setPlantilla(plantillaSugerida(o.id, titulo)); }}>
                <span className={`tp-panel-es__mini tp-panel-es__mini--${o.id}`} aria-hidden="true"><i /><i /><i /></span>
                <b>{o.nombre}</b>
                <small>{o.id === 'agenda' && esRecurrente(modo) ? 'Separan cupos y eligen horario.' : o.describe}</small>
              </button>
            ))}
          </div>
          {es && <small className="muted">{dondeLlega(es, modo, agendaNube)}</small>}
        </div>

        {es === 'ambos' && <QueSeReserva companyId={companyId} tipos={tipos} alCambiar={setTipos} />}
        </div>

        <div className="tp-panel-paso" hidden={!verPaso(2)}>
        <div className="tp-panel-campo">
          <span>Color principal</span>
          <div className="tp-panel-colores">
            {COLORES.map((c) => <button key={c} type="button" aria-label={`Elegir ${c}`} aria-pressed={color.toUpperCase() === c} style={{ background: c }} onClick={() => { setColorManual(true); setColor(c); }} />)}
            <label className="tp-panel-color-libre"><input type="color" value={esHex(color) ? color : '#006BFF'} onChange={(e) => { setColorManual(true); setColor(e.target.value.toUpperCase()); }} /><span>Otro color</span></label>
          </div>
          <small className="muted">Tu color define también los textos, contornos, fondos suaves y detalles de la reserva. En “Agenda y tienda” puedes ajustar el color de tienda abajo.</small>
        </div>
        {plantilla === 'luxury' && es !== 'tienda' && <div className="tp-panel-campo">
          <span>Cómo se ven tus servicios</span>
          <div className="tp-panel-vista-servicios" role="group" aria-label="Presentación del catálogo de servicios">
            {(['vertical', 'horizontal'] as const).map((vista) => <button key={vista} type="button" aria-pressed={(apariencia.vistaServiciosLuxury ?? 'vertical') === vista} onClick={() => setApariencia({ ...apariencia, vistaServiciosLuxury: vista })}>{vista === 'vertical' ? 'Vertical' : 'Horizontal'}</button>)}
          </div>
          <small className="muted">Esta elección es tuya; tus clientes verán el catálogo como lo publiques.</small>
        </div>}
        </div>

        <div className="tp-panel-paso" hidden={!verPaso(3)}>
        <details className="tp-panel-avanzado">
          <summary>Personalizar más <small>Portada, secciones y colores específicos</small></summary>
          <div className="tp-panel-avanzado__contenido">
            <div className="tp-panel-campo"><span>{plantilla === 'luxury' ? 'Foto del primer banner' : 'Imagen de portada'} <small className="muted">(opcional)</small></span>
              <div className="tp-panel-imagen-acciones">
                <label className="tp-panel-subir">{subiendo === 'portada' ? 'Subiendo…' : portada ? 'Cambiar portada' : 'Subir mi foto'}
                  <input type="file" accept="image/*" disabled={subiendo !== null} onChange={(e) => { const file = e.target.files?.[0]; if (file) void subirImagen(file, 'portada'); e.target.value = ''; }} />
                </label>
                {portada && <button type="button" className="btn btn-sm btn-ghost" disabled={subiendo !== null} onClick={() => setPortada('')}>{usaPlantilla ? 'Quitar y usar la de la plantilla' : 'Quitar'}</button>}
              </div>
              {portada && esUrlPublica(portada) && <img className="tp-panel-imagen tp-panel-imagen--portada" src={portada} alt="Vista previa de la portada" />}
              {!portada && usaPlantilla && <FotosPlantilla tipo={es} plantilla={plantilla} elegida={apariencia.fotoPlantilla} alElegir={(fotoPlantilla) => setApariencia({ ...apariencia, fotoPlantilla })} />}
              <label className="tp-panel-enlace-imagen">O pega un enlace HTTPS<input className="input" type="url" value={portada} placeholder="https://…/portada.jpg" onChange={(e) => setPortada(e.target.value)} /></label>
            </div>
            {plantilla === 'luxury' && es !== 'tienda' && <div className="tp-panel-campo">
              <span>Foto del segundo banner <small className="muted">(opcional)</small></span>
              <small className="muted">Si no subes una foto, se muestra la del diseño Luxury.</small>
              <div className="tp-panel-imagen-acciones">
                <label className="tp-panel-subir">{subiendo === 'portadaLuxurySecundaria' ? 'Subiendo…' : apariencia.portadaLuxurySecundaria ? 'Cambiar foto' : 'Subir mi foto'}
                  <input type="file" accept="image/*" disabled={subiendo !== null} onChange={(e) => { const file = e.target.files?.[0]; if (file) void subirImagen(file, 'portadaLuxurySecundaria'); e.target.value = ''; }} />
                </label>
                {apariencia.portadaLuxurySecundaria && <button type="button" className="btn btn-sm btn-ghost" disabled={subiendo !== null} onClick={() => setApariencia({ ...apariencia, portadaLuxurySecundaria: '' })}>Usar foto de la plantilla</button>}
              </div>
              <img className="tp-panel-imagen tp-panel-imagen--portada" src={esUrlPublica(apariencia.portadaLuxurySecundaria ?? '') && apariencia.portadaLuxurySecundaria || FOTOS_SERVICIOS_LUXURY.corte} alt="Vista previa del segundo banner" />
              <label className="tp-panel-enlace-imagen">O pega un enlace HTTPS<input className="input" type="url" value={apariencia.portadaLuxurySecundaria ?? ''} placeholder="https://…/segundo-banner.jpg" onChange={(e) => setApariencia({ ...apariencia, portadaLuxurySecundaria: e.target.value })} /></label>
            </div>}
            {plantilla !== 'luxury' && <label className="tp-panel-check"><input type="checkbox" checked={apariencia.mostrarBanner !== false} onChange={(e) => setApariencia({ ...apariencia, mostrarBanner: e.target.checked })} /><span><b>Mostrar portada</b><small className="muted">Puede llevar imagen o un color de fondo.</small></span></label>}
            {(plantilla === 'luxury' || apariencia.mostrarBanner !== false) && <label className="tp-panel-campo"><span>{plantilla === 'luxury' ? 'Texto pequeño del primer banner' : 'Título de la portada'} <small className="muted">(opcional)</small></span><input className="input" maxLength={80} value={apariencia.tituloBanner ?? ''} placeholder={plantilla === 'luxury' ? 'BARBERÍA · LIMA' : 'Algo nuevo te espera'} onChange={(e) => setApariencia({ ...apariencia, tituloBanner: e.target.value })} /></label>}
            <label className="tp-panel-check"><input type="checkbox" checked={apariencia.mostrarWhatsapp !== false} onChange={(e) => setApariencia({ ...apariencia, mostrarWhatsapp: e.target.checked })} /><span><b>Mostrar botón de WhatsApp</b><small className="muted">Los pedidos y reservas siguen enviando su aviso.</small></span></label>
            {plantilla === 'luxury' && es === 'ambos' && <label className="tp-panel-check"><input type="checkbox" checked={apariencia.catalogoLuxuryDestacado === true} onChange={(e) => setApariencia({ ...apariencia, catalogoLuxuryDestacado: e.target.checked })} /><span><b>Mostrar botón «Ver catálogo» y carrusel de productos</b><small className="muted">Los servicios siguen primero. Si lo desactivas, tus productos conservan la vista actual.</small></span></label>}
            {es !== 'agenda' && <label className="tp-panel-check"><input type="checkbox" checked={apariencia.mostrarMesero === true} onChange={(e) => setApariencia({ ...apariencia, mostrarMesero: e.target.checked })} /><span><b>Mostrar «Llamar al mesero»</b><small className="muted">Para restaurantes y cafeterías. El cliente indica su mesa y abre WhatsApp con el aviso listo para enviar.</small></span></label>}
            {es !== 'agenda' && <div className="tp-panel-campo">
              <span>Mensaje de pedido por WhatsApp</span>
              <small className="muted">Personaliza el saludo. El código, cliente, productos, total y entrega se añaden automáticamente. Usa {'{negocio}'} para insertar tu nombre.</small>
              <textarea className="input" rows={3} maxLength={240} value={apariencia.mensajePedidoIntro ?? ''} placeholder={'Hola 👋\nVengo de la carta digital de {negocio} y envío aquí mi pedido por favor.'} onChange={(e) => setApariencia({ ...apariencia, mensajePedidoIntro: e.target.value })} />
            </div>}
            {es !== 'agenda' && <label className="tp-panel-check"><input type="checkbox" checked={apariencia.pedirMetodoPago ?? pedidoGastronomicoDe(plantilla, es)} onChange={(e) => setApariencia({ ...apariencia, pedirMetodoPago: e.target.checked })} /><span><b>Preguntar cómo pagará</b><small className="muted">Se incluye en el aviso de WhatsApp.</small></span></label>}
            {es !== 'agenda' && <label className="tp-panel-check"><input type="checkbox" checked={apariencia.pedirNotaPedido ?? pedidoGastronomicoDe(plantilla, es)} onChange={(e) => setApariencia({ ...apariencia, pedirNotaPedido: e.target.checked })} /><span><b>Permitir una nota para cocina</b><small className="muted">Por ejemplo, «sin cebolla».</small></span></label>}
            {es !== 'agenda' && <label className="tp-panel-check"><input type="checkbox" checked={apariencia.pedirUbicacion ?? pedidoGastronomicoDe(plantilla, es)} onChange={(e) => setApariencia({ ...apariencia, pedirUbicacion: e.target.checked })} /><span><b>Permitir enlace de ubicación para delivery</b><small className="muted">El cliente puede pegar un enlace de Google Maps.</small></span></label>}


            <div className="tp-panel-colores-avanzados">
              {(es !== 'agenda' ? [{ key: 'colorTienda', label: 'Botones de tienda', fallback: '#111111' }, { key: 'fondoTienda', label: 'Fondo de tienda', fallback: '#FFFFFF' }] : []).concat(es !== 'tienda' ? [{ key: 'fondoAgenda', label: 'Fondo de agenda', fallback: '#F8F9FB' }] : [], [{ key: 'colorBanner', label: 'Color de portada', fallback: color }]).map((item) => (
                <label key={item.key}><span>{item.label}</span><input type="color" value={esHex(apariencia[item.key as keyof AparienciaPagina]) ? apariencia[item.key as keyof AparienciaPagina] as string : item.fallback} onChange={(e) => setApariencia({ ...apariencia, [item.key]: e.target.value.toUpperCase() })} /></label>
              ))}
            </div>
          </div>
        </details>

        {/* Lo que no todos necesitan: se enciende si se quiere y solo entonces pide sus datos. */}
        <details className="tp-panel-avanzado" open={funcionesAbiertas} onToggle={(e) => setFuncionesAbiertas(e.currentTarget.open)}>
          <summary>Agregar funciones <small>{reservar ? 'Canchas, envíos y Libro de Reclamaciones' : 'Envíos y Libro de Reclamaciones'}, si los necesitas</small></summary>
          <div className="tp-panel-avanzado__contenido">
        <div className="tp-panel-campo">
          <span>Apartados opcionales</span>
          <div className="tp-panel-apartados">
            {reservar && (
              <Apartado activo={Boolean(canchas.activo)} alCambiar={(activo) => setCanchas({ ...canchas, activo })} titulo="Canchas por horas" describe="Para canchas de fútbol, vóley o pádel: una tabla con cada cancha, sus horas libres y el precio de día y de noche.">
                <ConfigDeCanchas companyId={companyId} valor={canchas} alCambiar={setCanchas} />
              </Apartado>
            )}
            <Apartado activo={envios} alCambiar={setEnvios} titulo="Agendar envíos" describe="Tus clientes te piden un recojo: dirección, distrito y fecha.">
              <label className="tp-panel-campo"><span>Distritos que atiendes <small className="muted">(vacío = cualquiera)</small></span><textarea className="input" rows={2} value={distritos} placeholder="Miraflores, Surco, San Isidro" onChange={(e) => setDistritos(e.target.value)} /></label>
            </Apartado>
            <Apartado activo={reclamos} alCambiar={setReclamos} titulo="Libro de Reclamaciones" describe="El libro virtual que pide INDECOPI, al pie de tu página. Los reclamos te llegan aquí.">
              <label className="tp-panel-campo"><span>Razón social o nombre del titular</span><input className="input" maxLength={120} value={proveedor.razon_social} placeholder="Inversiones Lima S.A.C." onChange={(e) => setProveedor({ ...proveedor, razon_social: e.target.value })} /></label>
              <label className="tp-panel-campo">
                <span>RUC</span>
                <input className="input" inputMode="numeric" maxLength={11} value={proveedor.ruc} placeholder="20123456789" onChange={(e) => setProveedor({ ...proveedor, ruc: e.target.value.replace(/\D/g, '') })} />
                {proveedor.ruc.length === 11 && !rucValido(proveedor.ruc) && <small className="tp-panel-mal">Ese RUC no parece válido.</small>}
              </label>
              <label className="tp-panel-campo"><span>Dirección del local</span><input className="input" maxLength={200} value={proveedor.direccion} placeholder="Av. Larco 123, Miraflores, Lima" onChange={(e) => setProveedor({ ...proveedor, direccion: e.target.value })} /></label>
            </Apartado>
          </div>
        </div>
          </div>
        </details>
        </div>

        {!publicada && paso < 3 && <button type="button" className="btn btn-primary tp-panel-siguiente" disabled={paso === 1 && !titulo.trim()} onClick={() => setPaso(paso === 1 ? 2 : 3)}>Siguiente paso →</button>}
        {!publicada && paso > 1 && <button type="button" className="btn btn-ghost tp-panel-volver" onClick={() => setPaso(paso === 3 ? 2 : 1)}>← Volver</button>}
        {(publicada || paso === 3) && <button className="btn btn-primary tp-panel-siguiente" disabled={guardando || subiendo !== null || libre !== true || !whatsapp.trim() || !titulo.trim() || !esUrlPublica(logo) || !esUrlPublica(portada)} onClick={() => void guardar()}>
          {guardando ? 'Publicando…' : publicada ? 'Guardar cambios' : 'Publicar mi página'}
        </button>}
      </section>

      <div className="tp-panel-lado">
        {!publicada && paso === 2 && <VistaBorrador plantilla={plantilla} tipo={es} titulo={titulo} frase={frase} logo={logo} portada={portada} color={color} fotoPlantilla={apariencia.fotoPlantilla} />}
        {publicada && (
          <section className="card">
            <div className="card-mini-head">
              <h3>Así se ve</h3>
              <a className="btn btn-sm btn-ghost" href={vista} target="_blank" rel="noopener"><ExternalLink size={14} /> En grande</a>
            </div>
            <div className="tp-panel-vista">
              <iframe title="Vista previa de tu página" src={vista} />
            </div>
            <a className="tp-panel-demo-link" href={urlEjemploPara(es, plantilla, apariencia.vistaServiciosLuxury)} target="_blank" rel="noopener">Ver esta plantilla con un negocio de ejemplo <ExternalLink size={14} /></a>
            {(es !== tipoPagina(pagina!.secciones) || plantilla !== pagina!.plantilla || (plantillaManual && !pagina!.secciones.apariencia?.plantillaActiva) || color !== pagina!.color || titulo !== pagina!.titulo || frase !== pagina!.frase || logo !== (pagina!.logo_url ?? '') || portada !== (pagina!.portada_url ?? '') || JSON.stringify(apariencia) !== JSON.stringify(pagina!.secciones.apariencia ?? {})) && (
              <small className="muted">Vista previa del diseño. El nombre y las imágenes se actualizarán al guardar.</small>
            )}
          </section>
        )}
        {publicada && <Compartir slug={pagina!.slug} envios={Boolean(pagina!.secciones?.envios)} reservar={Boolean(pagina!.secciones?.reservar)} conCatalogo={Boolean(pagina!.secciones?.catalogo || pagina!.secciones?.reservar)} />}
      </div>
    </div>
  );
}

/** Sin foto propia, la portada lleva la de un ejemplo; al subir la suya, esta deja de salir. */
function FotosPlantilla({ tipo, plantilla, elegida, alElegir }: { tipo: TipoPagina; plantilla: PlantillaGuardada; elegida?: string; alElegir: (id: string) => void }) {
  const actual = plantilla === 'luxury' && elegida === 'ninguna' ? fotoPlantillaPorDefecto(tipo, plantilla) : esFotoPlantilla(elegida) ? elegida : fotoPlantillaPorDefecto(tipo, plantilla);
  const categorias = plantilla === 'luxury' ? ['barberia'] : plantilla === 'restaurante' ? ['cafeteria', 'pizzeria'] : tipo === 'agenda' ? ['clinica', 'barberia'] : tipo === 'tienda' ? ['cafeteria', 'pizzeria', 'clinica'] : ['clinica', 'barberia', 'cafeteria', 'pizzeria'];
  return (
    <div className="tp-panel-fotos">
      <small className="muted">Mientras no subas la tuya, tu portada usa una foto de la plantilla:</small>
      <div className="tp-panel-fotos__lista" role="radiogroup" aria-label="Foto de la plantilla">
        {FOTOS_PLANTILLA.filter((f) => categorias.includes(f.id) || f.id === actual).map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={actual === f.id} className={actual === f.id ? 'activa' : ''} onClick={() => alElegir(f.id)}>
            <span style={{ backgroundImage: `url("${f.url}")` }} aria-hidden="true" />
            <small>{f.nombre}</small>
          </button>
        ))}
        {plantilla !== 'luxury' && <button type="button" role="radio" aria-checked={actual === 'ninguna'} className={actual === 'ninguna' ? 'activa' : ''} onClick={() => alElegir('ninguna')}>
          <span className="tp-panel-fotos__color" aria-hidden="true" />
          <small>Solo color</small>
        </button>}
      </div>
    </div>
  );
}

/** Vista del negocio que se está configurando, sin datos prestados de otro negocio. */
function VistaBorrador({ plantilla, tipo, titulo, frase, logo, portada, color, fotoPlantilla }: {
  plantilla: PlantillaGuardada; tipo: TipoPagina; titulo: string; frase: string; logo: string; portada: string; color: string; fotoPlantilla?: string;
}) {
  const id = esFotoPlantilla(fotoPlantilla) && fotoPlantilla !== 'ninguna' ? fotoPlantilla : fotoPlantillaPorDefecto(tipo, plantilla);
  const imagen = portada || (fotoPlantilla === 'ninguna' && plantilla !== 'luxury' ? '' : FOTOS_PLANTILLA.find((f) => f.id === id)?.url ?? '');
  return (
    <section className="card">
      <div className="card-mini-head"><h3>Tu marca en el diseño</h3></div>
      <div className={`tp-panel-borrador tp-panel-borrador--${plantilla}`} style={{ ['--borrador-color' as string]: color, ['--borrador-tinta' as string]: tintaSobre(color) }}>
        <div className="tp-panel-borrador__marca">
          {logo ? <img src={logo} alt="Tu logo" /> : <span>{titulo.trim().charAt(0).toUpperCase() || '·'}</span>}
          <b>{titulo.trim() || 'Tu negocio'}</b>
        </div>
        <div className="tp-panel-borrador__portada" style={imagen ? { backgroundImage: `linear-gradient(90deg, #111b, #1112), url("${imagen}")` } : undefined}>
          <strong>{titulo.trim() || 'Tu negocio'}</strong>
          {frase.trim() && <p>{frase.trim()}</p>}
          <span>{tipo === 'tienda' ? 'Ver catálogo' : 'Agendar una cita'} →</span>
        </div>
        <div className="tp-panel-borrador__contenido"><b>{tipo === 'tienda' ? 'Tu catálogo' : 'Tus servicios'}</b><small>Los productos y servicios de tu negocio aparecerán aquí al publicar.</small></div>
      </div>
      <small className="muted">Vista rápida con tu nombre, frase, logo, portada y color. Puedes reemplazar las fotos de la plantilla cuando quieras.</small>
    </section>
  );
}

function Compartir({ slug, envios, reservar, conCatalogo }: { slug: string; envios: boolean; reservar: boolean; conCatalogo: boolean }) {
  const avisar = useAvisar();
  const modo = useSesion().compania?.business_mode;
  const enlaces = [
    { nombre: 'Mi página', url: urlPagina(slug, modo) },
    ...(reservar ? [{ nombre: 'Directo a reservar', url: urlReservar(slug, modo) }] : []),
    ...(envios ? [{ nombre: 'Directo a envíos', url: urlEnvio(slug, modo) }] : []),
  ];
  async function bajarQr(url: string) {
    const png = await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
    const a = document.createElement('a');
    a.href = png;
    a.download = `qr-${slug}.png`;
    a.click();
  }
  return (
    <section className="card">
      <div className="card-mini-head"><h3>Compártela</h3></div>
      <p className="muted" style={{ fontSize: 13 }}>En tu Instagram, en tus estados de WhatsApp o impresa en el mostrador.</p>
      {enlaces.map((e) => (
        <div className="tp-panel-enlace" key={e.url}>
          <div><small className="muted">{e.nombre}</small><b>{e.url.replace(/^https?:\/\//, '')}</b></div>
          <div className="tp-panel-enlace__acciones">
            <button className="btn btn-sm btn-ghost" title="Copiar" onClick={() => void navigator.clipboard.writeText(e.url).then(() => avisar('Copiado'))}><Copy size={15} /></button>
            <button className="btn btn-sm btn-ghost" title="Descargar QR" onClick={() => void bajarQr(e.url)}><QrCode size={15} /></button>
            <a className="btn btn-sm btn-ghost" title="Abrir" href={e.url} target="_blank" rel="noopener"><ExternalLink size={15} /></a>
          </div>
        </div>
      ))}
      {conCatalogo && <CatalogoPdf url={`${urlPagina(slug, modo)}/catalogo.pdf`} />}
      {conCatalogo && <div className="tp-panel-proximo"><b>¿Qué sigue?</b><p>Agrega o actualiza lo que ofreces para que aparezca en tu página.</p><Link className="btn btn-sm btn-primary" href="/panel/catalogo">Ir a mi catálogo</Link></div>}
    </section>
  );
}

/** Un apartado opcional de la página: una casilla y, encendido, sus campos. */
function Apartado({ activo, alCambiar, titulo, describe, children }: {
  activo: boolean; alCambiar: (v: boolean) => void; titulo: string; describe: string; children: React.ReactNode;
}) {
  return (
    <div className={`tp-panel-apartado${activo ? ' activo' : ''}`}>
      <label className="tp-panel-check">
        <input type="checkbox" checked={activo} onChange={(e) => alCambiar(e.target.checked)} />
        <span><b>{titulo}</b><small className="muted">{describe}</small></span>
      </label>
      {activo && <div className="tp-panel-apartado__campos">{children}</div>}
    </div>
  );
}

/**
 * El catálogo en PDF (servidor/pdf.tsx): el archivo para mandar como documento
 * por WhatsApp, y el enlace fijo que siempre trae los precios de hoy.
 */
function CatalogoPdf({ url }: { url: string }) {
  const avisar = useAvisar();
  return (
    <div className="tp-panel-enlace">
      <div>
        <small className="muted"><FileText size={12} style={{ verticalAlign: '-2px' }} /> Catálogo en PDF · se actualiza solo</small>
        <b>{url.replace(/^https?:\/\//, '')}</b>
      </div>
      <div className="tp-panel-enlace__acciones">
        <button className="btn btn-sm btn-ghost" title="Copiar enlace" onClick={() => void navigator.clipboard.writeText(url).then(() => avisar('Copiado'))}><Copy size={15} /></button>
        <a className="btn btn-sm btn-ghost" title="Descargar PDF" href={`${url}?descargar=1`}><Download size={15} /></a>
        <a className="btn btn-sm btn-ghost" title="Abrir" href={url} target="_blank" rel="noopener"><ExternalLink size={15} /></a>
      </div>
    </div>
  );
}

/**
 * Dónde ve el dueño lo que llega. Los pedidos, siempre en Pedidos del panel
 * (aunque su negocio sea de otro tipo: el menú lo enseña si la página vende,
 * modules/tu-pagina/ui/secciones.ts). Las reservas, con la agenda en la nube en
 * la Agenda; sin ella, en la pestaña «Reservas» de aquí arriba.
 */
function dondeLlega(es: Es, modo: BusinessMode | null | undefined, agendaNube: boolean) {
  const citas = es !== 'tienda';
  const pedidos = es !== 'agenda';
  return (
    <>
      Te avisan por WhatsApp y lo ves en{' '}
      {citas && (agendaNube
        ? <Link href="/panel/agenda">{esAppointmentFamily(modo) ? 'tu Agenda' : 'la Agenda'}</Link>
        : '«Reservas», aquí arriba')}
      {citas && pedidos && ' y en '}
      {pedidos && <Link href="/panel/pedidos">Pedidos</Link>}.
    </>
  );
}

const POR_PAGINA_RESERVA = 12;

/**
 * En «Las dos», qué se reserva y qué se compra: una casilla por cosa del
 * catálogo. Sin marcar, lo que diría el modo (dominio/tienda.ts, tipoPorDefecto).
 */
function QueSeReserva({ companyId, tipos, alCambiar }: { companyId: string; tipos: TiposDePagina; alCambiar: (t: TiposDePagina) => void }) {
  const modo = useSesion().compania?.business_mode;
  const [limite, setLimite] = useState(POR_PAGINA_RESERVA);
  const { datos, cargando, error } = useCargar(async () => {
    const { data, error } = await supabase()
      .from('catalog')
      .select('id, name, duration_minutes, schedule_slots, is_active')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    type Fila = { id: string; name: string; duration_minutes: number | null; schedule_slots: string | null; is_active: number | null };
    return ((data ?? []) as Fila[])
      .filter((k) => k.is_active !== 0)
      .map((k) => ({ id: k.id, nombre: k.name, duracion: k.duration_minutes, conGrupos: conFranjas(k.schedule_slots) }));
  }, [companyId]);

  const items = datos ?? [];
  const seReserva = (k: (typeof items)[number]) => {
    const m = tipos[k.id];
    return m ? m !== 'producto' : tipoPorDefecto(modo, k) !== 'producto';
  };

  return (
    <div className="tp-panel-campo">
      <span>¿Qué se reserva?</span>
      <small className="muted">Lo marcado se reserva con día y hora; lo demás se compra.</small>
      {cargando && !datos && <small className="muted">Cargando tu catálogo…</small>}
      {error && <small className="tp-panel-mal">No se pudo cargar tu catálogo.</small>}
      {datos && items.length === 0 && <small className="muted">Tu catálogo está vacío. Agrega lo que ofreces en <Link href="/panel/catalogo">Catálogo</Link>.</small>}
      <div className="tp-panel-reserva">
        {items.slice(0, limite).map((k) => (
          <label key={k.id} className="tp-panel-reserva__fila">
            <input type="checkbox" checked={seReserva(k)} onChange={(e) => alCambiar({ ...tipos, [k.id]: e.target.checked ? 'cita' : 'producto' })} />
            <span>{k.nombre}</span>
            {seReserva(k) && <small className="muted">{k.conGrupos ? 'por grupos' : k.duracion ? `${k.duracion} min` : 'un turno'}</small>}
          </label>
        ))}
      </div>
      {items.length > limite && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLimite((n) => n + POR_PAGINA_RESERVA * 4)}>
          Ver más ({items.length - limite})
        </button>
      )}
    </div>
  );
}

const conFranjas = (raw: string | null) => {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) && v.length > 0;
  } catch {
    return false;
  }
};

/** «Barbería El Centro» → barberia-el-centro. Mientras se escribe, deja el guion final. */
function sugerirSlug(v: string, escribiendo = false): string {
  const s = v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40);
  return escribiendo ? s : s.replace(/-+$/, '');
}
