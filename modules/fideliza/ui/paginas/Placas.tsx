'use client';

/**
 * FIDELIZA · PLACAS — cada placa NFC/QR tiene una URL que no cambia nunca
 * (lo que se graba en el chip). Lo que cambia es el perfil de enlaces que
 * tiene detrás.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, Vacio } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje } from '@/modules/fideliza/cliente/api';
import { ESTADO_PLACA, fecha } from '@/modules/fideliza/dominio/formato';
import { urlPlaca } from '@/modules/fideliza/dominio/config';

function Lista() {
  const { companyId, puede, rol, ajustes } = useFideliza();
  const avisar = useAvisar();
  const params = useSearchParams();
  const [nueva, setNueva] = useState<null | { label: string; kind: 'nfc_qr' | 'qr'; profileId: string; locationId: string }>(null);
  const [codigo, setCodigo] = useState('');
  const [lote, setLote] = useState<null | { id: string; public_token: string; activation_code: string }[]>(null);
  const [activando, setActivando] = useState(false);
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

  if (cargando && !datos) return <Cargando texto="Cargando placas…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!datos) return null;
  const editable = puede('devices.manage');
  const nombrePerfil = (id: string | null) => datos.perfiles.find((p) => p.id === id)?.name ?? '—';

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

  async function reclamar() {
    try {
      const r = await accion<{ id: string }>('placa.reclamar', { companyId, code: codigo });
      const lista = await dejarLista(r.id, ajustes?.default_profile_id ?? null);
      avisar(lista ? '¡Placa activada! Acércale el móvil: ya abre tu página.' : 'Placa añadida. Publica los botones de tu página y actívala desde aquí.');
      setCodigo('');
      setActivando(false);
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  async function fabricar() {
    const n = Number(window.prompt('¿Cuántas placas de inventario? (1–500)') ?? 0);
    const nombre = window.prompt('Nombre del lote (ej. lote-2026-10)') ?? '';
    if (!n || !nombre) return;
    try {
      setLote(await accion('placa.lote', { count: n, batch: nombre, kind: 'nfc_qr' }));
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  function bajarLote() {
    if (!lote) return;
    const csv = ['id,token,url,codigo_activacion', ...lote.map((l) => `${l.id},${l.public_token},${urlPlaca(l.public_token)},${l.activation_code}`)].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'placas-lote.csv';
    a.click();
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
          {rol === 'platform_admin' && (
            <button className="btn btn-ghost btn-sm" onClick={() => void fabricar()}>
              Fabricar lote (admin)
            </button>
          )}
        </div>
      )}

      {activando && (
        <div className="fz-panel-aviso fz-panel-aviso--info" role="status">
          <span style={{ flex: 1 }}>
            <b>Activa tu placa:</b> escribe abajo el código de activación que viene con ella (formato XXXXX-XXXXX) y pulsa «Añadir placa recibida». Quedará apuntando a tu página.
          </span>
        </div>
      )}

      {lote && (
        <div className="fz-panel-aviso">
          <span style={{ flex: 1 }}>
            {lote.length} placas de inventario creadas. Los códigos de activación <b>solo se muestran ahora</b>: descarga el CSV y guárdalo en un sitio privado.
          </span>
          <button className="btn btn-primary btn-sm" onClick={bajarLote}>
            Descargar CSV
          </button>
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
              <option value="">— Perfil de enlaces —</option>
              {datos.perfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
                  <td>{nombrePerfil(d.profile_id)}</td>
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
