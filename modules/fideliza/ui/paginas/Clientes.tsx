'use client';

/**
 * FIDELIZA · CLIENTES — la lista, paginada EN LA BASE (crece con el uso).
 * Los teléfonos solo aparecen a quien puede verlos (propietario y gerente).
 *
 * «Dar sello» desde la lista (12-nov-2026, pedido de Alvaro para Kallpa): el
 * dueño no quiere abrir la cámara. Busca por nombre o número y toca el botón.
 * Es la misma operación que la caja (caja.registrar, con su clave de
 * idempotencia) y se puede deshacer.
 * Con PUNTOS hace falta el importe, así que ahí el botón lleva a la caja.
 *
 * Con LÍNEAS (0017, Kallpa): una tarjeta por persona y un botón por línea
 * («+ Asistencia», «+ Compra»). Cada línea con sus reglas y su contador.
 */
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, Qr, SinPermiso, Vacio } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, ErrorFideliza, lecturas, mensaje, nuevaClave, sincronizarEnSegundoPlano, type Linea, type Nivel } from '@/modules/fideliza/cliente/api';
import { urlTarjeta } from '@/modules/fideliza/dominio/config';
import { fechaHora, unidades, type TipoRegla } from '@/modules/fideliza/dominio/formato';

/** «2026-11» en hora de Lima: con niveles del mes, quien no vino este mes está en 0. */
const mesLima = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).slice(0, 7);

/** El siguiente nivel por alcanzar (o el último si ya llegó), como hace loyalty_goal en la base. */
const siguienteNivel = (niveles: Nivel[], saldo: number) => niveles.find((n) => n.at > saldo) ?? niveles[niveles.length - 1];

interface Hecho {
  memberId: string;
  nombre: string;
  tx: string | null;
  texto: string;
}

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
  /** 0017: solo si el negocio tiene líneas. La principal primero. */
  lines?: Linea[] | null;
}

/** Las líneas en las que se puede sumar ahora (solo si hay más de una). */
const lineasDe = (f: Fila) => (f.lines && f.lines.length > 1 ? f.lines.filter((l) => l.status === 'active') : null);

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
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  // Fila en curso (el botón se apaga mientras tanto) y la última operación, para deshacerla.
  const [dando, setDando] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);

  // Busca mientras escribe, sin esperar al Enter: con el nombre a medias ya sale.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim() !== busqueda) {
        setPagina(0);
        setBusqueda(q.trim());
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // La regla vigente decide el botón: sello, visita o (puntos) ir a la caja por el importe.
  const { datos: regla } = useCargar(async () => {
    if (!companyId) return null;
    const progs = await lecturas.programas(companyId);
    const p = progs.find((x) => x.status === 'active') ?? null;
    if (!p?.current_version_id) return null;
    const v = (await lecturas.versiones(companyId, p.id)).find((x) => x.id === p.current_version_id);
    if (!v) return null;
    const niveles = v.period === 'month' && v.tiers?.length ? v.tiers : null;
    return {
      tipo: v.rule_type as TipoRegla,
      meta: v.reward_threshold,
      niveles,
      bono: v.bonus_units ? { label: v.bonus_label ?? 'Bono', units: v.bonus_units } : null,
    };
  }, [companyId]);
  // Números enlaza aquí con ?filtro=never para ver los leads que aún no compran.
  const [filtro, setFiltro] = useState<string>(() => {
    const f = params.get('filtro');
    return FILTROS.some(([v]) => v === f) ? f! : 'all';
  });
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

  async function darSello(f: Fila, linea: Linea | null, comoBono = false) {
    const tipo = (linea?.rule_type ?? regla?.tipo) as TipoRegla | undefined;
    if (!regla || !tipo || dando) return;
    if (tipo === 'points' && !comoBono) {
      const aLinea = linea && !linea.main ? `&linea=${linea.program_id}` : '';
      router.push(`/panel/fideliza/caja?q=${encodeURIComponent(f.public_code)}${aLinea}`);
      return;
    }
    // La principal se opera con la persona; las demás, diciendo cuál (la base crea su miembro).
    const enLinea = linea && !linea.main ? { programId: linea.program_id } : {};
    // Clave nueva por toque. El botón se apaga mientras viaja, así que un doble toque no llega.
    const clave = nuevaClave();
    setDando(f.id);
    try {
      type Res = {
        status: string;
        transaction_id?: string;
        units?: number;
        rewards_issued?: number;
        member: { balance: number; threshold: number | null; rewards: { description: string }[]; lines?: Linea[] };
      };
      const r = comoBono
        ? await accion<Res>('caja.bono', { companyId, memberId: f.id, idempotencyKey: clave, ...enLinea })
        : await accion<Res>('caja.registrar', {
            companyId,
            memberId: f.id,
            kind: tipo === 'visits' ? 'visit' : 'purchase',
            amountCents: 0,
            locationId: null,
            externalRef: null,
            idempotencyKey: clave,
            ...enLinea,
          });
      const nombre = f.alias?.trim() || f.public_code;
      // Se enseña la línea donde se sumó (la tarjeta que vuelve es la de la persona).
      const l = linea ? r.member.lines?.find((x) => x.program_id === linea.program_id) : undefined;
      const saldo = l ? l.balance : r.member.balance;
      const meta = l ? l.threshold : (r.member.threshold ?? regla.meta);
      const premios = l ? l.rewards : r.member.rewards;
      const n = r.rewards_issued ?? 0;
      const premio = n ? ` · ¡Ganó: ${premios.slice(-n).map((x) => x.description).join(' + ')}!` : '';
      const mes = (l ? l.period === 'month' : !!regla.niveles) ? ' este mes' : '';
      const bonoLabel = linea?.bonus_label ?? regla.bono?.label;
      const que = comoBono ? `${bonoLabel} +${r.units ?? 0}` : `${linea ? `${linea.label} ` : ''}+${unidades(r.units ?? 0, tipo)}`;
      const texto = `${nombre}: ${que} · lleva ${saldo} de ${meta ?? '—'}${mes}${premio}`;
      // El bono es un ajuste: no se deshace desde aquí (caja.devolver es para compras y visitas).
      setHecho({ memberId: f.id, nombre, tx: comoBono ? null : (r.transaction_id ?? null), texto });
      avisar(texto, 'ok');
      releer();
      sincronizarEnSegundoPlano(companyId!);
    } catch (e) {
      const sinRespuesta = e instanceof ErrorFideliza && (e.status === 0 || e.status >= 500);
      avisar(sinRespuesta ? 'No llegó la confirmación. Mira el saldo antes de volver a tocar.' : mensaje(e), 'error');
      releer();
    } finally {
      setDando(null);
    }
  }

  async function deshacer() {
    if (!hecho?.tx) return;
    try {
      await accion('caja.devolver', {
        companyId,
        transactionId: hecho.tx,
        amountCents: null,
        reason: 'Deshecho desde Clientes',
        idempotencyKey: nuevaClave(),
      });
      avisar(`Deshecho: a ${hecho.nombre} se le quitó lo último.`, 'ok');
      setHecho(null);
      releer();
      sincronizarEnSegundoPlano(companyId!);
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  const puedeDar = puede('ops.record') && !!regla;
  const esteMes = mesLima(new Date());
  /** Saldo y meta de la fila. Con niveles del mes: 0 si no vino este mes, y el siguiente nivel. */
  const saldoDe = (f: Fila) => {
    if (!regla || regla.tipo === 'points') return <>{f.balance}</>;
    if (!regla.niveles) return <>{f.balance}<span className="muted"> / {regla.meta}</span></>;
    const saldo = f.last_op_at && mesLima(new Date(f.last_op_at)) === esteMes ? f.balance : 0;
    const sig = siguienteNivel(regla.niveles, saldo);
    return (
      <>
        {saldo}
        <span className="muted"> / {sig.at} este mes</span>
      </>
    );
  };
  const conLineas = !!datos?.rows.some((f) => lineasDe(f));
  const verbo = regla?.tipo === 'visits' ? '+ Visita' : regla?.tipo === 'points' ? 'Sumar puntos' : '+ Sello';
  const total = datos?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="toolbar">
        <div className="search" style={{ flex: 1, minWidth: 220 }}>
          <Search size={16} />
          <input
            placeholder={puede('contacts.read') ? 'Busca por nombre, número, código o correo' : 'Busca por nombre o código'}
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

      {hecho && (
        <div className="fz-panel-aviso fz-panel-aviso--ok fz-fila" role="status" aria-live="polite" style={{ marginBottom: 12, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>
            <b>Última:</b> {hecho.texto}
          </span>
          {hecho.tx && puede('ops.refund') && (
            <button className="btn btn-ghost btn-sm" onClick={() => void deshacer()}>
              Deshacer
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setHecho(null)} aria-label="Cerrar">
            ✕
          </button>
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
                {puedeDar && <th aria-label="Dar sello" />}
                <th>{regla?.niveles && !conLineas ? 'Este mes' : 'Saldo'}</th>
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
                  {puedeDar && (
                    <td>
                      {f.status === 'active' && lineasDe(f) && (
                        <div className="fz-fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                          {lineasDe(f)!.map((l) => (
                            <button
                              key={l.program_id}
                              className={`btn btn-sm ${l.main ? 'btn-primary' : 'btn-dark'}`}
                              style={{ whiteSpace: 'nowrap' }}
                              disabled={!!dando}
                              onClick={() => void darSello(f, l)}
                              aria-label={`+ ${l.label} a ${f.alias?.trim() || f.public_code}`}
                            >
                              {dando === f.id ? '…' : `+ ${l.label}`}
                            </button>
                          ))}
                          {lineasDe(f)!
                            .filter((l) => l.bonus_units)
                            .map((l) => (
                              <button
                                key={`bono-${l.program_id}`}
                                className="btn btn-ghost btn-sm"
                                style={{ whiteSpace: 'nowrap' }}
                                disabled={!!dando}
                                onClick={() => void darSello(f, l, true)}
                                title={`${l.bonus_label}: suma ${l.bonus_units} en ${l.label}`}
                              >
                                {l.bonus_label} +{l.bonus_units}
                              </button>
                            ))}
                        </div>
                      )}
                      {f.status === 'active' && !lineasDe(f) && (
                        <div className="fz-fila" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ whiteSpace: 'nowrap' }}
                            disabled={!!dando}
                            onClick={() => void darSello(f, null)}
                            aria-label={`${verbo} a ${f.alias?.trim() || f.public_code}`}
                          >
                            {dando === f.id ? '…' : verbo}
                          </button>
                          {regla?.bono && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ whiteSpace: 'nowrap' }}
                              disabled={!!dando}
                              onClick={() => void darSello(f, null, true)}
                              title={`${regla.bono.label}: suma ${regla.bono.units}`}
                            >
                              {regla.bono.label} +{regla.bono.units}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  <td>
                    {lineasDe(f)
                      ? f.lines!.map((l) => (
                          <div key={l.program_id} style={{ whiteSpace: 'nowrap' }}>
                            <span className="muted">{l.label}:</span> {l.balance}
                            <span className="muted">
                              {' '}
                              / {l.threshold ?? '—'}
                              {l.period === 'month' ? ' este mes' : ''}
                            </span>
                          </div>
                        ))
                      : saldoDe(f)}
                  </td>
                  <td>{(lineasDe(f) ? f.lines!.reduce((s, l) => s + l.rewards_available, 0) : f.rewards_available) || '—'}</td>
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
