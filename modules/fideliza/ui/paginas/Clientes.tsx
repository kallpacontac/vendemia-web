'use client';

/**
 * FIDELIZA · CLIENTES — la lista, paginada EN LA BASE (crece con el uso).
 * Los teléfonos solo aparecen a quien puede verlos (propietario y gerente).
 */
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, Qr, SinPermiso, Vacio } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, mensaje, nuevaClave } from '@/modules/fideliza/cliente/api';
import { urlTarjeta } from '@/modules/fideliza/dominio/config';
import { fechaHora } from '@/modules/fideliza/dominio/formato';

interface Fila {
  id: string;
  public_code: string;
  alias: string | null;
  status: string;
  balance: number;
  rewards_available: number;
  ops_count: number;
  last_op_at: string | null;
  wallet_state: string | null;
  verified_contact: boolean;
  phone: string | null;
}

const POR_PAGINA = 25;
const FILTROS = [
  ['all', 'Todos'],
  ['reward', 'Con premio'],
  ['active30', 'Activos 30 días'],
  ['inactive30', 'Sin venir 30 días'],
  ['never', 'Sin operaciones'],
  ['wallet', 'Con Google Wallet'],
  ['wallet_error', 'Wallet con error'],
] as const;

function Lista() {
  const { companyId, puede } = useFideliza();
  const avisar = useAvisar();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<string>('all');
  const [estado, setEstado] = useState<string>('');
  const [pagina, setPagina] = useState(0);
  const [alta, setAlta] = useState<null | { alias: string; phone: string; email: string; verificado: boolean; clave: string; hecho?: { code: string; token: string | null } }>(null);

  useEffect(() => {
    if (params.get('nuevo')) setAlta({ alias: '', phone: '', email: '', verificado: false, clave: nuevaClave() });
  }, [params]);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    return accion<{ total: number; rows: Fila[] }>('miembro.buscar', {
      companyId,
      q: busqueda,
      status: estado || null,
      filter: filtro,
      limit: POR_PAGINA,
      offset: pagina * POR_PAGINA,
    });
  }, [companyId, busqueda, filtro, estado, pagina]);

  if (!puede('members.read')) return <SinPermiso que="los clientes" />;

  async function crear() {
    if (!alta) return;
    try {
      const r = await accion<{ public_code: string; card_token: string | null }>('miembro.crear', {
        companyId,
        alias: alta.alias,
        phone: alta.phone,
        email: alta.email,
        verified: alta.verificado,
        creationKey: alta.clave,
        via: 'panel',
      });
      setAlta({ ...alta, hecho: { code: r.public_code, token: r.card_token } });
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  const total = datos?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="toolbar">
        <div className="search" style={{ flex: 1, minWidth: 220 }}>
          <Search size={16} />
          <input
            placeholder={puede('contacts.read') ? 'Código, nombre, teléfono o correo' : 'Código o nombre'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPagina(0);
                setBusqueda(q.trim());
              }
            }}
            aria-label="Buscar clientes"
          />
        </div>
        <select className="select" value={filtro} onChange={(e) => (setFiltro(e.target.value), setPagina(0))} aria-label="Filtro">
          {FILTROS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <select className="select" value={estado} onChange={(e) => (setEstado(e.target.value), setPagina(0))} aria-label="Estado">
          <option value="">Activos y suspendidos</option>
          <option value="active">Activos</option>
          <option value="suspended">Suspendidos</option>
          {puede('members.manage') && <option value="deleted">Borrados</option>}
        </select>
        {puede('members.create') && (
          <button className="btn btn-primary btn-sm" onClick={() => setAlta({ alias: '', phone: '', email: '', verificado: false, clave: nuevaClave() })}>
            Añadir cliente
          </button>
        )}
      </div>

      {alta && (
        <div className="card" style={{ marginBottom: 16, maxWidth: 560 }}>
          {alta.hecho ? (
            <>
              <b>
                Tarjeta creada: <span className="fz-mono">{alta.hecho.code}</span>
              </b>
              {alta.hecho.token && (
                <>
                  <p className="fz-def">Enlace de su tarjeta (solo se enseña ahora). Que lo escanee o mándaselo tú.</p>
                  <Qr valor={urlTarjeta(alta.hecho.token)} tam={200} />
                  <input className="input" readOnly value={urlTarjeta(alta.hecho.token)} onFocus={(e) => e.target.select()} style={{ marginTop: 8 }} />
                </>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setAlta(null)}>
                Cerrar
              </button>
            </>
          ) : (
            <>
              <b>Nuevo cliente</b>
              <div className="fz-col2" style={{ marginTop: 10 }}>
                <input className="input" placeholder="Nombre (opcional)" maxLength={40} value={alta.alias} onChange={(e) => setAlta({ ...alta, alias: e.target.value })} />
                <input className="input" placeholder="Teléfono (opcional)" inputMode="tel" value={alta.phone} onChange={(e) => setAlta({ ...alta, phone: e.target.value })} />
                <input className="input" placeholder="Correo (opcional)" type="email" value={alta.email} onChange={(e) => setAlta({ ...alta, email: e.target.value })} />
              </div>
              {(alta.phone || alta.email) && (
                <label className="check-inline" style={{ display: 'block', margin: '10px 0' }}>
                  <input type="checkbox" checked={alta.verificado} onChange={(e) => setAlta({ ...alta, verificado: e.target.checked })} /> Verificado en persona
                </label>
              )}
              <div className="fz-fila" style={{ marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={() => void crear()}>
                  Crear tarjeta
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAlta(null)}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <Fallo texto={error} reintentar={releer} />}
      {cargando && !datos ? (
        <Cargando texto="Buscando clientes…" />
      ) : total === 0 ? (
        <Vacio titulo={busqueda || filtro !== 'all' ? 'Nadie coincide con la búsqueda' : 'Todavía no hay clientes'}>
          {busqueda || filtro !== 'all' ? 'Prueba con otro filtro.' : 'Se crean desde la placa, el QR del negocio o la caja.'}
        </Vacio>
      ) : (
        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Saldo</th>
                <th>Premios</th>
                <th>Última vez</th>
                <th>Wallet</th>
              </tr>
            </thead>
            <tbody>
              {datos!.rows.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link className="fz-mono" href={`/panel/fideliza/clientes/${f.id}`}>
                      {f.public_code}
                    </Link>
                  </td>
                  <td>
                    {f.alias ?? <span className="muted">Sin nombre</span>}
                    {f.phone && <div className="muted" style={{ fontSize: 12 }}>{f.phone}</div>}
                    <div style={{ fontSize: 11.5 }} className={f.verified_contact ? '' : 'muted'}>
                      {f.verified_contact ? '✓ Contacto verificado' : 'Contacto sin verificar'}
                    </div>
                    {f.status !== 'active' && <span className={`badge-pill ${f.status === 'deleted' ? 'b-mute' : 'b-hot'}`}>{f.status === 'deleted' ? 'Borrado' : 'Suspendido'}</span>}
                  </td>
                  <td>{f.balance}</td>
                  <td>{f.rewards_available || '—'}</td>
                  <td>{f.last_op_at ? fechaHora(f.last_op_at) : <span className="muted">Nunca</span>}</td>
                  <td>{f.wallet_state ? { synced: 'Al día', pending: 'Pendiente', error: 'Error', inactive: 'Inactivo' }[f.wallet_state] ?? f.wallet_state : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination" style={{ padding: 12 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              {pagina * POR_PAGINA + 1}–{Math.min(total, (pagina + 1) * POR_PAGINA)} de {total}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </button>
            <button className="btn btn-ghost btn-sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Clientes() {
  return (
    <Suspense fallback={<Cargando />}>
      <Lista />
    </Suspense>
  );
}
