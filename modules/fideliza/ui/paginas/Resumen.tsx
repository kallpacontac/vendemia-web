'use client';

/**
 * FIDELIZA · RESUMEN
 *
 * Solo cifras que salen de loyalty_metrics(). Sin metas inventadas, sin
 * flechas de tendencia que nadie ha calculado. Si no hay datos, se dice.
 */
import Link from 'next/link';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Cifra, Fallo } from '@/modules/fideliza/ui/Estados';
import LinkPublico from '@/modules/fideliza/ui/LinkPublico';
import PrimerosPasos, { type Paso } from '@/modules/fideliza/ui/PrimerosPasos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, type Enlace } from '@/modules/fideliza/cliente/api';
import { urlNegocio, urlPlaca, urlPlacaQr } from '@/modules/fideliza/dominio/config';
import type { Metricas } from '@/modules/fideliza/dominio/metricas';
import { selloValido } from '@/modules/fideliza/dominio/sellos';
import type { Estilo } from '@/modules/fideliza/dominio/estilo';

const hoyLima = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });

/** Los botones que se ven HOY en la página: visibles, dentro de fechas, y el de alta solo con programa activo. */
const vigentes = (links: Enlace[], programaActivo: boolean) =>
  links.filter(
    (l) =>
      l.is_active &&
      (!l.starts_at || new Date(l.starts_at) <= new Date()) &&
      (!l.ends_at || new Date(l.ends_at) > new Date()) &&
      (l.kind !== 'join' || programaActivo),
  ).length;

const ESTADO_PROGRAMA: Record<string, [string, string]> = {
  draft: ['Borrador', 'b-mute'],
  active: ['Activo', 'b-new'],
  paused: ['Pausado', 'b-warm'],
  error: ['Con error', 'b-hot'],
};

export default function Resumen() {
  const { companyId, ajustes, puede, modo } = useFideliza();

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [programas, config, m] = await Promise.all([
      lecturas.programas(companyId),
      accion<{ servidor: boolean; wallet: boolean; push: boolean; cron: boolean }>('config.estado', {}),
      puede('metrics.read')
        ? accion<Metricas>('metricas', { companyId, from: haceDias(29), to: hoyLima() })
        : Promise.resolve(null),
    ]);
    const vivo = programas.find((p) => p.status === 'active' || p.status === 'paused') ?? programas[0] ?? null;
    const [versiones, perfiles, placas] = await Promise.all([
      vivo?.current_version_id ? lecturas.versiones(companyId, vivo.id) : Promise.resolve([]),
      lecturas.perfiles(companyId),
      lecturas.placas(companyId),
    ]);
    const principal = perfiles.find((p) => p.id === ajustes?.default_profile_id) ?? null;
    const [publicada] = principal?.published_version_id
      ? await lecturas.publicadas(companyId, [principal.published_version_id])
      : [];
    const visitas =
      modo === 'enlaces' && puede('metrics.read')
        ? await lecturas.contarEventos(companyId, ['links_view'], new Date(Date.now() - 30 * 86400000).toISOString())
        : null;
    const aperturas =
      modo === 'enlaces' && puede('metrics.read')
        ? await lecturas.contarEventos(companyId, ['device_open'], new Date(Date.now() - 30 * 86400000).toISOString())
        : null;
    return { programas, vivo, version: versiones[0] ?? null, config, m, publicada: publicada ?? null, placas, visitas, aperturas };
  }, [companyId, ajustes?.default_profile_id, modo]);

  if (modo === 'nuevo' && puede('program.edit')) return <Bienvenida />;
  if (cargando && !datos) return <Cargando texto="Calculando el resumen…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!datos) return null;
  const { vivo, version, config, m, publicada, placas } = datos;
  const programaActivo = vivo?.status === 'active';
  const botones = publicada ? vigentes(publicada.links, programaActivo) : 0;
  const placaPrincipal = placas.find((p) => p.status === 'active' && p.profile_id === ajustes?.default_profile_id) ?? null;
  const paginaUrl = placaPrincipal
    ? placaPrincipal.kind === 'qr' ? urlPlacaQr(placaPrincipal.public_token) : urlPlaca(placaPrincipal.public_token)
    : ajustes ? urlNegocio(ajustes.slug) : '';

  const pasos: Paso[] = [
    {
      titulo: 'Datos de tu negocio',
      que: 'El nombre que verán tus clientes y la dirección de tu link (ej. fideliza.vendemias.com/n/tu-negocio).',
      hecho: Boolean(ajustes),
      href: '/panel/fideliza/programa?paso=0',
      boton: 'Empezar',
    },
    {
      titulo: 'Tu programa de premios',
      que: 'Cuántos sellos, puntos o visitas hacen falta y qué premio se gana. Al publicarlo, la gente ya puede crear su tarjeta.',
      hecho: vivo?.status === 'active' || vivo?.status === 'paused',
      href: '/panel/fideliza/club',
      boton: vivo ? 'Publicar' : 'Crear',
    },
    {
      titulo: 'Tu marca: color y logo',
      que: 'Para que la tarjeta y tu página se vean con tus colores. Sirve cualquier foto o logo.',
      hecho: Boolean(ajustes?.logo_url && ajustes.logo_checked?.ok),
      opcional: true,
      href: '/panel/fideliza/programa?paso=4',
      boton: 'Personalizar',
    },
    {
      titulo: 'Los botones de tu página',
      que: 'WhatsApp, reseñas, cómo llegar, «Mi tarjeta»… Lo que verán al abrir tu link.',
      hecho: botones > 0,
      href: '/panel/fideliza/mi-pagina',
      boton: 'Añadir botones',
    },
    {
      titulo: 'Placa o QR para el local',
      que: 'Un QR (o placa NFC) en el mostrador para que se unan al pagar.',
      hecho: placas.some((d) => d.status === 'active'),
      opcional: true,
      href: '/panel/fideliza/placas?nueva=1',
      boton: 'Crear placa',
    },
  ];

  const alertas: { texto: string; enlace?: string }[] = [];
  if (!config.servidor) alertas.push({ texto: 'Falta la clave del servidor de Fideliza: las páginas públicas y Wallet no funcionan (ver modules/fideliza/sql/README.md).' });
  if (!ajustes) alertas.push({ texto: 'Completa los datos del negocio (paso 1 del programa).', enlace: '/panel/fideliza/programa' });
  if (!vivo) alertas.push({ texto: 'Todavía no hay programa. Configúralo y publícalo.', enlace: '/panel/fideliza/programa' });
  if (vivo?.status === 'draft') alertas.push({ texto: 'El programa está en borrador: nadie puede unirse aún.', enlace: '/panel/fideliza/programa' });
  if (version?.valid_to && new Date(version.valid_to) < new Date())
    alertas.push({ texto: 'La regla del programa venció: las compras no suman. Publica una nueva.', enlace: '/panel/fideliza/programa' });
  if (!config.wallet) alertas.push({ texto: 'Google Wallet no está configurado en el servidor: las tarjetas solo funcionan como web.' });
  if (m?.wallet.classes.some((c) => c.state === 'error'))
    alertas.push({ texto: `La tarjeta de Google Wallet del programa dio error: ${m.wallet.classes.find((c) => c.state === 'error')?.last_error ?? ''}`, enlace: '/panel/fideliza/ajustes' });
  if (m && m.outbox.overdue > 0) alertas.push({ texto: `${m.outbox.overdue} actualizaciones de Wallet o avisos llevan más de 15 minutos en cola.`, enlace: '/panel/fideliza/ajustes' });
  if (m && m.outbox.dead > 0) alertas.push({ texto: `${m.outbox.dead} trabajos fallaron tras varios intentos y necesitan revisión.`, enlace: '/panel/fideliza/ajustes' });
  if (!config.cron) alertas.push({ texto: 'Falta el secreto del cron: los reintentos automáticos y las campañas no corren solos.' });

  const [estado, clase] = ESTADO_PROGRAMA[vivo?.status ?? 'draft'];

  if (modo === 'enlaces') {
    const pasosEnlaces: Paso[] = [
      {
        titulo: 'Tu página: nombre y link',
        que: 'Cómo se llama tu negocio y la dirección de tu link.',
        hecho: Boolean(ajustes),
        href: '/panel/fideliza/mi-pagina',
        boton: 'Empezar',
      },
      {
        titulo: 'Tus botones',
        que: 'WhatsApp, reseñas de Google, Instagram, cómo llegar… y pulsa «Guardar y publicar».',
        hecho: botones > 0,
        href: '/panel/fideliza/mi-pagina',
        boton: 'Añadir botones',
      },
      {
        titulo: 'QR o placa en el local',
        que: 'Para que te encuentren al acercar el móvil o escanear en el mostrador.',
        hecho: placas.some((d) => d.status === 'active'),
        opcional: true,
        href: '/panel/fideliza/placas?nueva=1',
        boton: 'Crear QR',
      },
    ];
    return (
      <>
        {puede('program.edit') && <PrimerosPasos pasos={pasosEnlaces} />}
        {ajustes && <LinkPublico slug={ajustes.slug} nombre={ajustes.display_name} programaActivo={false} hayEnlaces={botones > 0} placa={placaPrincipal} />}
        {datos.visitas !== null && (
          <div className="fz-grid">
            <Cifra titulo="Visitas a tu página" valor={datos.visitas ?? 0} def="Últimos 30 días. Cada vez que alguien abre tu link." />
            <Cifra titulo="Aperturas de tus placas y QR" valor={datos.aperturas ?? 0} def="Últimos 30 días. Al acercar el móvil a la placa o escanear su QR." />
          </div>
        )}
        {puede('program.edit') && (
          <div className="card fz-cta">
            <div>
              <b>¿Quieres premiar a tus clientes?</b>
              <p className="fz-def">
                Activa una tarjeta de puntos: sellos por compra, puntos por gasto o visitas, con premio. Tus clientes la guardan en el móvil o en Google Wallet.
              </p>
            </div>
            <Link className="btn btn-primary" href="/panel/fideliza/club">
              Activar tarjeta de puntos
            </Link>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {puede('program.edit') && <PrimerosPasos pasos={pasos} />}
      {ajustes && (
        <LinkPublico
          slug={ajustes.slug}
          nombre={ajustes.display_name}
          programaActivo={programaActivo}
          hayEnlaces={botones > 0}
          placa={placaPrincipal}
          cartel={{
            color: ajustes.bg_color,
            logo: ajustes.logo_url,
            sello: selloValido((ajustes.page_style as Partial<Estilo> | null)?.sello),
            meta: programaActivo ? version?.reward_threshold ?? null : null,
            premio: programaActivo ? version?.reward_description ?? null : null,
            unidad: version?.rule_type === 'points' ? 'puntos' : version?.rule_type === 'visits' ? 'visitas' : 'sellos',
          }}
        />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fz-fila" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="kpi__label">Programa</div>
            <div className="fz-fila">
              <b style={{ fontSize: 18 }}>{vivo?.name ?? 'Sin programa'}</b>
              <span className={`badge-pill ${clase}`}>{estado}</span>
            </div>
          </div>
          <div className="fz-fila">
            {puede('ops.record') && (
              <Link className="btn btn-primary btn-sm" href="/panel/fideliza/caja">
                Registrar operación
              </Link>
            )}
            {puede('metrics.read') && (
              <Link className="btn btn-ghost btn-sm" href="/panel/fideliza/numeros">
                Ver números
              </Link>
            )}
            {puede('members.create') && (
              <Link className="btn btn-ghost btn-sm" href="/panel/fideliza/clientes?nuevo=1">
                Añadir cliente
              </Link>
            )}
            {puede('program.edit') && (
              <Link className="btn btn-ghost btn-sm" href="/panel/fideliza/programa">
                Configurar programa
              </Link>
            )}
            {puede('devices.manage') && (
              <Link className="btn btn-ghost btn-sm" href="/panel/fideliza/placas?nueva=1">
                Crear placa
              </Link>
            )}
            {ajustes && (
              <a className="btn btn-ghost btn-sm" href={paginaUrl} target="_blank" rel="noopener noreferrer">
                Página pública <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </div>

      {alertas.map((a) => (
        <div key={a.texto} className="fz-panel-aviso" role="status">
          <AlertTriangle size={16} />
          <span style={{ flex: 1 }}>{a.texto}</span>
          {a.enlace && (
            <Link className="btn btn-ghost btn-sm" href={a.enlace}>
              Ir
            </Link>
          )}
        </div>
      ))}

    </>
  );
}

/** Lo primero que ve un negocio nuevo: una sola pregunta. */
function Bienvenida() {
  return (
    <div className="fz-bienvenida">
      <h2>¿Qué quieres hacer?</h2>
      <p className="fz-def">Puedes empezar por lo simple y activar lo demás cuando quieras.</p>
      <div className="fz-bienvenida__opciones">
        <Link href="/panel/fideliza/mi-pagina" className="card fz-opcion">
          <b>Mis enlaces</b>
          <span>Un solo link con tus botones: WhatsApp, Yape / Plin, reseñas de Google, Instagram, cómo llegar… Y un QR o placa NFC para el local.</span>
          <em>Listo en 3 minutos →</em>
        </Link>
        <Link href="/panel/fideliza/programa?paso=0" className="card fz-opcion">
          <b>Tarjeta de puntos para mis clientes</b>
          <span>Sellos, puntos o visitas con premio, caja para registrar compras y Google Wallet. Incluye también tu página de enlaces.</span>
          <em>Configurar →</em>
        </Link>
      </div>
    </div>
  );
}
