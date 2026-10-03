'use client';

/**
 * FIDELIZA · PLACAS — cada placa NFC/QR tiene una URL que no cambia nunca
 * (lo que se graba en el chip). Lo que cambia es el perfil de enlaces que
 * tiene detrás.
 */
import { Suspense, useEffect, useState } from 'react';
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
  const { companyId, puede, rol } = useFideliza();
  const avisar = useAvisar();
  const params = useSearchParams();
  const [nueva, setNueva] = useState<null | { label: string; kind: 'nfc_qr' | 'qr'; profileId: string; locationId: string }>(null);
  const [codigo, setCodigo] = useState('');
  const [lote, setLote] = useState<null | { id: string; public_token: string; activation_code: string }[]>(null);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [placas, perfiles, sucursales] = await Promise.all([lecturas.placas(companyId), lecturas.perfiles(companyId), lecturas.sucursales(companyId)]);
    return { placas, perfiles, sucursales };
  }, [companyId]);

  useEffect(() => {
    if (params.get('nueva')) setNueva({ label: '', kind: 'qr', profileId: '', locationId: '' });
  }, [params]);

  if (cargando && !datos) return <Cargando texto="Cargando placas…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!datos) return null;
  const editable = puede('devices.manage');
  const nombrePerfil = (id: string | null) => datos.perfiles.find((p) => p.id === id)?.name ?? '—';

  async function crear() {
    if (!nueva) return;
    try {
      await accion('placa.crear', {
        companyId,
        label: nueva.label,
        kind: nueva.kind,
        profileId: nueva.profileId || null,
        locationId: nueva.locationId || null,
      });
      avisar('Placa creada. Ábrela para descargar su QR y activarla.');
      setNueva(null);
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  async function reclamar() {
    try {
      await accion('placa.reclamar', { companyId, code: codigo });
      avisar('Placa añadida a tu negocio. Asígnale un perfil y actívala.');
      setCodigo('');
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
            <input placeholder="Código de activación (XXXXX-XXXXX)" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} aria-label="Código de activación" />
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
