'use client';

/** FIDELIZA · FICHA DE PLACA — URL grabable, QR, destino, estado e historial. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, Qr } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje } from '@/modules/fideliza/cliente/api';
import { urlPlaca, urlPlacaQr } from '@/modules/fideliza/dominio/config';
import { ESTADO_PLACA, fechaHora } from '@/modules/fideliza/dominio/formato';

const ACCION: Record<string, string> = {
  'device.create': 'Creada',
  'device.claim': 'Añadida con código de activación',
  'device.update': 'Destino o datos cambiados',
  'device.status': 'Cambio de estado',
};

export default function FichaPlaca() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { companyId, puede } = useFideliza();
  const avisar = useAvisar();
  const [form, setForm] = useState({ label: '', profileId: '', locationId: '' });

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [placa, perfiles, sucursales, aperturas, historial] = await Promise.all([
      lecturas.placa(companyId, deviceId),
      lecturas.perfiles(companyId),
      lecturas.sucursales(companyId),
      puede('metrics.read') ? lecturas.aperturasPlaca(companyId, deviceId) : Promise.resolve([]),
      puede('team.manage') ? lecturas.historialPlaca(companyId, deviceId) : Promise.resolve([]),
    ]);
    return { placa, perfiles, sucursales, aperturas, historial };
  }, [companyId, deviceId]);

  useEffect(() => {
    const p = datos?.placa;
    if (p) setForm({ label: p.label, profileId: p.profile_id ?? '', locationId: p.location_id ?? '' });
  }, [datos?.placa]);

  if (cargando && !datos) return <Cargando texto="Cargando la placa…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  const p = datos?.placa;
  if (!p) return <Fallo texto="Esa placa no existe en este negocio." />;
  const editable = puede('devices.manage') && p.status !== 'retired';

  async function guardar() {
    try {
      await accion('placa.editar', { companyId, deviceId, label: form.label, profileId: form.profileId || null, locationId: form.locationId || null });
      avisar('Guardado. La URL de la placa no cambia.');
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  async function estado(status: 'active' | 'suspended' | 'retired') {
    if (status === 'retired' && !window.confirm('Retirar es definitivo: la placa dejará de abrir nada. ¿Seguir?')) return;
    try {
      await accion('placa.estado', { companyId, deviceId, status });
      avisar(status === 'active' ? 'Placa activa' : status === 'suspended' ? 'Placa suspendida' : 'Placa retirada');
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  const copiar = (t: string) => void navigator.clipboard?.writeText(t).then(() => avisar('Copiado'));
  const aperturas = datos!.aperturas.filter((a) => a.kind === 'device_open');
  const porOrigen = (o: string) => aperturas.filter((a) => (a.source ?? 'nfc') === o).length;

  return (
    <>
      <Link href="/panel/fideliza/placas" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Placas
      </Link>
      <div className="fz-col2">
        <div className="card">
          <div className="fz-fila" style={{ justifyContent: 'space-between' }}>
            <b style={{ fontSize: 18 }}>{p.label || 'Placa sin nombre'}</b>
            <span className={`badge-pill ${p.status === 'active' ? 'b-new' : p.status === 'suspended' ? 'b-hot' : 'b-mute'}`}>{ESTADO_PLACA[p.status]}</span>
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>
            URL para grabar en el chip NFC (no cambia nunca)
          </label>
          <div className="fz-fila">
            <input className="input fz-mono" readOnly value={urlPlaca(p.public_token)} style={{ flex: 1, fontSize: 12.5 }} />
            <button className="icon-btn" aria-label="Copiar" onClick={() => copiar(urlPlaca(p.public_token))}>
              <Copy size={15} />
            </button>
          </div>
          <label className="field-label" style={{ marginTop: 12 }}>
            URL del QR impreso
          </label>
          <div className="fz-fila">
            <input className="input fz-mono" readOnly value={urlPlacaQr(p.public_token)} style={{ flex: 1, fontSize: 12.5 }} />
            <a className="icon-btn" aria-label="Probar" href={urlPlacaQr(p.public_token)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} />
            </a>
          </div>
          <div style={{ marginTop: 14 }}>
            <Qr valor={urlPlacaQr(p.public_token)} tam={220} descargar={`placa-${p.label || p.id.slice(0, 8)}`} />
          </div>
          <p className="fz-def">El QR lleva «?o=qr» para contar aparte las aperturas por QR. Lo que se graba en el chip es la URL de arriba, sin parámetro.</p>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Destino</h3>
          <div className="fz-campo">
            <label className="field-label">Nombre</label>
            <input className="input" maxLength={60} value={form.label} disabled={!editable} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="fz-campo">
            <label className="field-label">Perfil de enlaces</label>
            <select className="select" value={form.profileId} disabled={!editable} onChange={(e) => setForm({ ...form, profileId: e.target.value })}>
              <option value="">— Sin perfil —</option>
              {datos!.perfiles.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.published_version_id ? '' : ' (sin publicar)'}
                </option>
              ))}
            </select>
            <small>Cambiar el perfil cambia a dónde lleva la placa al momento, sin regrabar el chip.</small>
          </div>
          {datos!.sucursales.length > 0 && (
            <div className="fz-campo">
              <label className="field-label">Sucursal</label>
              <select className="select" value={form.locationId} disabled={!editable} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">—</option>
                {datos!.sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {editable && (
            <div className="fz-fila">
              <button className="btn btn-primary btn-sm" onClick={() => void guardar()}>
                Guardar
              </button>
              {p.status !== 'active' && (
                <button className="btn btn-ghost btn-sm" onClick={() => void estado('active')}>
                  Activar
                </button>
              )}
              {p.status === 'active' && (
                <button className="btn btn-ghost btn-sm" onClick={() => void estado('suspended')}>
                  Suspender
                </button>
              )}
              <button className="btn btn-ghost btn-sm" style={{ color: '#B4232A' }} onClick={() => void estado('retired')}>
                Retirar
              </button>
            </div>
          )}
          {p.activated_at && <p className="fz-def">Activa desde {fechaHora(p.activated_at)}</p>}

          {puede('metrics.read') && (
            <>
              <h3 style={{ fontSize: 15, margin: '18px 0 6px' }}>Aperturas (últimas 200)</h3>
              <p className="fz-def" style={{ marginTop: 0 }}>
                NFC/directo: {porOrigen('nfc')} · QR: {porOrigen('qr')} · sin destino: {datos!.aperturas.filter((a) => a.kind === 'device_unavailable').length}. Una apertura no prueba que la persona estuviera en el local.
              </p>
            </>
          )}
          {datos!.historial.length > 0 && (
            <>
              <h3 style={{ fontSize: 15, margin: '18px 0 6px' }}>Historial</h3>
              <ul className="fz-lista">
                {datos!.historial.map((h, i) => (
                  <li key={i}>
                    <span>
                      {ACCION[h.action] ?? h.action}
                      {h.action === 'device.status' && h.context ? `: ${ESTADO_PLACA[String(h.context.from)] ?? h.context.from} → ${ESTADO_PLACA[String(h.context.to)] ?? h.context.to}` : ''}
                      {h.actor_kind === 'platform_admin' ? ' · equipo Vendemia' : ''}
                    </span>
                    <span className="muted">{fechaHora(h.created_at)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
