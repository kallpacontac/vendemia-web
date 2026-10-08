'use client';

/**
 * FIDELIZA · PLACAS — cada placa NFC/QR tiene una URL que no cambia nunca
 * (lo que se graba en el chip). Lo que cambia es el perfil de enlaces que
 * tiene detrás.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, Vacio } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje } from '@/modules/fideliza/cliente/api';
import { ESTADO_PLACA, fecha } from '@/modules/fideliza/dominio/formato';
import { esDirecto } from '@/modules/fideliza/dominio/botones';

function Lista() {
  const { companyId, puede, ajustes } = useFideliza();
  const avisar = useAvisar();
  const params = useSearchParams();
  const router = useRouter();
  const [nueva, setNueva] = useState<null | { label: string; kind: 'nfc_qr' | 'qr'; profileId: string; locationId: string }>(null);
  const [codigo, setCodigo] = useState('');
  /** El código que llega en el enlace de activación solo se intenta una vez. */
  const autoReclamo = useRef(false);
  const [activando, setActivando] = useState(false);
  /** Placas recién canjeadas que todavía no llevan a ningún sitio. */
  const campoCodigo = useRef<HTMLInputElement>(null);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [placas, perfiles, sucursales] = await Promise.all([lecturas.placas(companyId), lecturas.perfiles(companyId), lecturas.sucursales(companyId)]);
    return { placas, perfiles, sucursales };
  }, [companyId]);

  useEffect(() => {
    if (params.get('nueva')) setNueva({ label: '', kind: 'qr', profileId: ajustes?.default_profile_id ?? '', locationId: '' });
    // Viene de acercar el móvil a una placa nueva («Activar mi placa»).
    if (params.get('activar')) {
      setActivando(true);
      setTimeout(() => campoCodigo.current?.focus(), 300);
    }
  }, [params, ajustes?.default_profile_id]);

  /**
   * Enlace de activación de la tarjeta de la caja:
   * /panel/fideliza/placas?activar=1#codigo=XXXXX-XXXXX
   * El código va en el FRAGMENTO para que no quede en los logs del servidor.
   * Se rellena y se activa solo, una vez, cuando el panel ya cargó.
   */
  useEffect(() => {
    if (autoReclamo.current || !companyId || !datos || !puede('devices.manage')) return;
    const desdeHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('codigo');
    const leido = (desdeHash ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 13);
    if (leido.replace(/-/g, '').length < 10) return;
    autoReclamo.current = true;
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setCodigo(leido);
    void reclamar(leido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, datos]);

  if (cargando && !datos) return <Cargando texto="Cargando placas…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!datos) return null;
  const editable = puede('devices.manage');
  const nombrePerfil = (id: string | null) => {
    const perfil = datos.perfiles.find((p) => p.id === id);
    if (!perfil) return '—';
    if (esDirecto(perfil.name)) return 'Enlace directo';
    return perfil.id === ajustes?.default_profile_id ? 'Mi página' : perfil.name;
  };

  /**
   * Deja la placa lista sin más pasos: apuntando a tu página y activa. Si tu
   * página todavía no tiene botones publicados, se queda asignada y se dice
   * qué falta, en vez de fallar.
   */
  async function dejarLista(deviceId: string, perfil: string | null, label = '', locationId: string | null = null): Promise<boolean> {
    if (!perfil) return false;
    try {
      await accion('placa.editar', { companyId, deviceId, label, profileId: perfil, locationId });
      await accion('placa.estado', { companyId, deviceId, status: 'active' });
      return true;
    } catch {
      return false;
    }
  }

  async function crear() {
    if (!nueva) return;
    try {
      const r = await accion<{ id: string }>('placa.crear', {
        companyId,
        label: nueva.label,
        kind: nueva.kind,
        profileId: nueva.profileId || null,
        locationId: nueva.locationId || null,
      });
      const lista = nueva.profileId ? await dejarLista(r.id, nueva.profileId, nueva.label, nueva.locationId || null) : false;
      avisar(lista ? 'Listo: tu QR ya lleva a tu página. Ábrelo para descargarlo.' : 'Creado. Publica los botones de tu página para activarlo.');
      setNueva(null);
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  async function reclamar(code = codigo) {
    try {
      // Con el código de un PEDIDO llegan varias placas a la vez (0009).
      const r = await accion<{ id: string; ids?: string[]; count?: number }>('placa.reclamar', { companyId, code });
      const ids = r.ids?.length ? r.ids : [r.id];
      const pendientes: string[] = [];
      for (const id of ids) {
        if (!(await dejarLista(id, ajustes?.default_profile_id ?? null))) pendientes.push(id);
      }
      const n = ids.length;
      /**
       * Su página aún no tiene botones publicados (lo normal en un negocio
       * recién creado): directo a montarla. Al publicar, Mi página activa
       * las placas que esperan (activarPendientes) y allí mismo puede elegir
       * un enlace directo en vez de la página.
       */
      if (pendientes.length) {
        avisar(n > 1 ? `¡${n} placas ya son tuyas! Ahora monta tu página.` : '¡La placa ya es tuya! Ahora monta tu página.');
        router.push(`/panel/fideliza/mi-pagina?placa=${pendientes[0]}&n=${pendientes.length}`);
        return;
      }
      avisar(n > 1 ? `¡${n} placas activadas! Acércales el móvil: ya abren tu página.` : '¡Placa activada! Acércale el móvil: ya abre tu página.');
      setCodigo('');
      setActivando(false);
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  return (
    <>
      {editable && (
        <div className="toolbar">
          <button className="btn btn-primary btn-sm" onClick={() => setNueva({ label: '', kind: 'qr', profileId: '', locationId: '' })}>
            <Plus size={14} /> Crear placa
          </button>
          <div className="search" style={{ minWidth: 260 }}>
            <input ref={campoCodigo} placeholder="Código de activación (XXXXX-XXXXX)" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} aria-label="Código de activación" />
          </div>
          <button className="btn btn-ghost btn-sm" disabled={codigo.replace(/[^A-Z0-9]/g, '').length < 10} onClick={() => void reclamar()}>
            Añadir placa recibida
          </button>
        </div>
      )}

      {activando && (
        <div className="fz-panel-aviso fz-panel-aviso--info" role="status">
          <span style={{ flex: 1 }}>
            <b>Activa tu placa:</b> escribe abajo el código que viene en la tarjeta de la caja (XXXXX-XXXXX) y pulsa «Añadir placa recibida». Si es el código del pedido, se activan todas las placas de una vez. Quedarán apuntando a tu página.
          </span>
        </div>
      )}

      {nueva && (
        <div className="card" style={{ maxWidth: 560, marginBottom: 16 }}>
          <b>Nueva placa</b>
          <div className="fz-col2" style={{ marginTop: 10 }}>
            <input className="input" placeholder="Nombre (ej. Mostrador)" maxLength={60} value={nueva.label} onChange={(e) => setNueva({ ...nueva, label: e.target.value })} />
            <select className="select" value={nueva.kind} onChange={(e) => setNueva({ ...nueva, kind: e.target.value as 'qr' })}>
              <option value="qr">Solo QR impreso</option>
              <option value="nfc_qr">NFC + QR</option>
            </select>
            <select className="select" value={nueva.profileId} onChange={(e) => setNueva({ ...nueva, profileId: e.target.value })}>
              <option value="">— ¿A dónde lleva? —</option>
              {datos.perfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === ajustes?.default_profile_id ? `${p.name} (tu página)` : p.name}
                </option>
              ))}
            </select>
            {datos.sucursales.length > 0 && (
              <select className="select" value={nueva.locationId} onChange={(e) => setNueva({ ...nueva, locationId: e.target.value })}>
                <option value="">— Sucursal —</option>
                {datos.sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <ul className="fz-ayudas">
            <li><b>Nombre:</b> para reconocerla tú. Ej.: «Mostrador», «Mesa 4». El cliente no lo ve.</li>
            <li><b>Solo QR impreso:</b> un código para imprimir en un cartel, la mesa o el mostrador. Lo escanean con la cámara.</li>
            <li><b>NFC + QR:</b> una placa física con chip: acercan el móvil y se abre, o escanean su QR.</li>
            <li><b>¿A dónde lleva?:</b> lo que se abre al usarla. Normalmente, tu página. Puedes cambiarlo cuando quieras sin reimprimir nada.</li>
            {datos.sucursales.length > 0 && <li><b>Sucursal:</b> en qué local está, para contar sus aperturas aparte.</li>}
          </ul>
          <div className="fz-fila" style={{ marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => void crear()}>
              Crear
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setNueva(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!datos.placas.length ? (
        <Vacio titulo="Todavía no hay placas">Crea una para imprimir su QR, o añade una placa NFC recibida con su código de activación.</Vacio>
      ) : (
        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Estado</th>
                <th>Perfil</th>
                <th>Sucursal</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {datos.placas.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/panel/fideliza/placas/${d.id}`}>
                      <b>{d.label || 'Sin nombre'}</b>
                    </Link>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {d.kind === 'nfc_qr' ? 'NFC + QR' : 'QR'}
                    </div>
                  </td>
                  <td>
                    <span className={`badge-pill ${d.status === 'active' ? 'b-new' : d.status === 'suspended' ? 'b-hot' : 'b-mute'}`}>{ESTADO_PLACA[d.status] ?? d.status}</span>
                  </td>
                  <td>
                    {d.profile_id ? (
                      nombrePerfil(d.profile_id)
                    ) : d.status === 'retired' ? (
                      '—'
                    ) : (
                      <Link href={`/panel/fideliza/placas/${d.id}`}>Elegir destino</Link>
                    )}
                  </td>
                  <td>{datos.sucursales.find((s) => s.id === d.location_id)?.name ?? '—'}</td>
                  <td>{fecha(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Placas() {
  return (
    <Suspense fallback={<Cargando />}>
      <Lista />
    </Suspense>
  );
}
