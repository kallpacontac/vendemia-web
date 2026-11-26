'use client';

/**
 * FIDELIZA · INICIO · lo de hoy y los premios por entregar
 *
 * Kallpa, 18-nov-2026: Fideliza es lo que usan a diario («dale una vuelta a ese módulo»). Al
 * abrirlo, lo que hay que atender sale solo (ver la memoria «menos pestañas»):
 *   · cuántos sumaron HOY en cada línea de la tarjeta (Asistencia, Compra…) y las tarjetas nuevas;
 *   · quién tiene un premio esperando, el que vence antes primero, con «Entregar» a un toque
 *     (abre la Caja con su tarjeta ya buscada, ?q=<código>).
 *
 * Todo sale de tablas que el RLS ya deja leer con members.read (también a la cajera). Sin la 0017
 * (líneas) funciona igual: entonces solo hay una línea, la del programa.
 */
import Link from 'next/link';
import { Gift, ScanLine, UserPlus } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import type { Programa } from '@/modules/fideliza/cliente/api';

const hoyLima = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
/** Lima no cambia de hora: medianoche de hoy es siempre −05:00. */
const inicioDeHoy = () => `${hoyLima()}T00:00:00-05:00`;

interface Miembro {
  id: string;
  alias: string | null;
  public_code: string;
  parent_member_id?: string | null;
  created_at: string;
}
interface Premio {
  id: string;
  member_id: string;
  program_id: string;
  description: string;
  expires_at: string | null;
  issued_at: string;
}

const MAX_PREMIOS = 8;

/** «tu 6.º corte o barba gratis» lo escribe el dueño para el cliente; aquí lo lee el equipo. */
const sinTu = (t: string) => t.trim().replace(/^tu\s+/i, '').replace(/^./, (c) => c.toUpperCase());
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' });

function venceEn(iso: string | null): string | null {
  if (!iso) return null;
  const dias = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (dias <= 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  return dias <= 10 ? `vence en ${dias} días` : null;
}

export default function HoyEnElClub({
  companyId,
  programas,
  puedeSumar,
}: {
  companyId: string;
  /** El principal y sus líneas: para nombrar cada una. */
  programas: Programa[];
  puedeSumar: boolean;
}) {
  const ids = programas.map((p) => p.id).join();
  const { datos } = useCargar(async () => {
    const sb = supabase();
    const desde = inicioDeHoy();
    const [ops, nuevas, premios] = await Promise.all([
      sb.from('loyalty_transactions').select('program_id, member_id').eq('company_id', companyId).in('kind', ['purchase', 'visit']).gte('created_at', desde).limit(5000),
      // '*' y no la columna: sin la 0017 no existe parent_member_id y la consulta fallaría.
      sb.from('loyalty_members').select('*').eq('company_id', companyId).neq('status', 'deleted').gte('created_at', desde).limit(500),
      sb
        .from('loyalty_rewards')
        .select('id, member_id, program_id, description, expires_at, issued_at')
        .eq('company_id', companyId)
        .eq('status', 'available')
        .order('expires_at', { ascending: true, nullsFirst: false })
        .order('issued_at', { ascending: true })
        .limit(200),
    ]);
    if (ops.error) throw new Error(ops.error.message);

    // Personas distintas por línea (dos sellos de la misma persona en el día cuentan una vez).
    const porLinea = new Map<string, Set<string>>();
    for (const o of (ops.data ?? []) as { program_id: string; member_id: string }[]) {
      const s = porLinea.get(o.program_id) ?? new Set<string>();
      s.add(o.member_id);
      porLinea.set(o.program_id, s);
    }
    // Una tarjeta nueva es una persona nueva, no el miembro que se le crea al sumarle en otra línea.
    const altasHoy = ((nuevas.data ?? []) as Miembro[]).filter((m) => !m.parent_member_id).length;

    const lista = ((premios.data ?? []) as Premio[]);
    // Quién es cada uno: el premio de una línea cuelga del miembro de esa línea; el nombre y el
    // código que se buscan en Caja son los de su tarjeta (el principal).
    const delPremio = [...new Set(lista.map((p) => p.member_id))];
    const miembros = new Map<string, Miembro>();
    const leer = async (q: string[]) => {
      if (!q.length) return;
      const { data } = await sb.from('loyalty_members').select('*').eq('company_id', companyId).in('id', q);
      for (const m of (data ?? []) as Miembro[]) miembros.set(m.id, m);
    };
    await leer(delPremio.slice(0, 200));
    await leer([...new Set([...miembros.values()].map((m) => m.parent_member_id).filter((x): x is string => !!x && !miembros.has(x)))]);
    const persona = (id: string) => {
      const m = miembros.get(id);
      return (m?.parent_member_id && miembros.get(m.parent_member_id)) || m;
    };

    return {
      porLinea: Object.fromEntries([...porLinea].map(([k, v]) => [k, v.size])),
      personasHoy: new Set(((ops.data ?? []) as { member_id: string }[]).map((o) => persona(o.member_id)?.id ?? o.member_id)).size,
      altasHoy,
      premios: lista.map((p) => ({ ...p, persona: persona(p.member_id) })),
    };
  }, [companyId, ids]);

  const nombreDe = (programId: string) => {
    const p = programas.find((x) => x.id === programId);
    return p?.line_label?.trim() || p?.name || 'Tarjeta';
  };
  // Con líneas, una cifra por línea; con una sola, «Sumaron hoy».
  const lineas = programas.length > 1 ? programas : [];
  const fecha = new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <section className="card fz-hoy" aria-label="Hoy en tu club">
        <div className="fz-hoy__cab">
          <div>
            <div className="kpi__label">Hoy</div>
            <b className="fz-hoy__fecha">{fecha}</b>
          </div>
          <div className="fz-fila">
            <Link className="btn btn-primary" href="/panel/fideliza/clientes">
              <UserPlus size={16} /> {puedeSumar ? 'Buscar cliente y sumar' : 'Buscar cliente'}
            </Link>
            {puedeSumar && (
              <Link className="btn btn-ghost" href="/panel/fideliza/caja?camara=1">
                <ScanLine size={16} /> Escanear tarjeta
              </Link>
            )}
          </div>
        </div>
        <div className="fz-hoy__cifras">
          {lineas.length ? (
            lineas.map((p) => (
              <div key={p.id}>
                <span>{nombreDe(p.id)}</span>
                <b>{datos ? datos.porLinea[p.id] ?? 0 : '…'}</b>
                <small>personas</small>
              </div>
            ))
          ) : (
            <div>
              <span>Sumaron hoy</span>
              <b>{datos ? datos.personasHoy : '…'}</b>
              <small>personas</small>
            </div>
          )}
          <div>
            <span>Tarjetas nuevas</span>
            <b>{datos ? datos.altasHoy : '…'}</b>
            <small>hoy</small>
          </div>
          <div>
            <span>Premios por entregar</span>
            <b>{datos ? datos.premios.length : '…'}</b>
            <small>{datos && datos.premios.length >= 200 ? 'o más' : 'esperando'}</small>
          </div>
        </div>
      </section>

      {datos && datos.premios.length > 0 && (
        <section className="card fz-premios" aria-label="Premios por entregar">
          <div className="fz-premios__cab">
            <Gift size={18} />
            <b>Premios por entregar</b>
            <span className="muted">· el que vence antes, primero</span>
          </div>
          {/* 26-nov-2026 (The 24/7): «no se entiende». Qué es la lista y qué hace el botón. */}
          <p className="muted fz-premios__que">
            Completaron su tarjeta y su premio está esperando. Dáselo cuando venga: {puedeSumar ? '«Entregar» abre la Caja con su tarjeta y ahí lo marcas como entregado.' : 'lo marca la caja al entregarlo.'}
          </p>
          <ul>
            {datos.premios.slice(0, MAX_PREMIOS).map((p, _i, visibles) => {
              const quien = p.persona;
              const vence = venceEn(p.expires_at);
              const nombre = quien ? quien.alias?.trim() || quien.public_code : '';
              // Dos con el mismo nombre: el código los distingue (es el que se busca en Caja).
              const repetido = Boolean(quien?.alias?.trim()) && visibles.filter((x) => (x.persona?.alias?.trim() || '').toLowerCase() === nombre.toLowerCase()).length > 1;
              return (
                <li key={p.id}>
                  <div className="fz-premios__quien">
                    {quien ? (
                      <Link href={`/panel/fideliza/clientes/${quien.id}`}>{nombre}{repetido && <span className="muted fz-premios__codigo"> · {quien.public_code}</span>}</Link>
                    ) : (
                      <span className="muted">Cliente</span>
                    )}
                    <small>
                      Premio: {sinTu(p.description)} · lo ganó el {fechaCorta(p.issued_at)}
                      {lineas.length ? ` · ${nombreDe(p.program_id)}` : ''}
                      {vence && <em className={vence.startsWith('vence hoy') || vence === 'vence mañana' ? 'fz-premios__urge' : ''}> · {vence}</em>}
                    </small>
                  </div>
                  {puedeSumar && quien && (
                    <Link className="btn btn-sm" href={`/panel/fideliza/caja?q=${encodeURIComponent(quien.public_code)}`}>
                      Entregar premio
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          {datos.premios.length > MAX_PREMIOS && (
            <p className="muted fz-premios__mas">
              Y {datos.premios.length - MAX_PREMIOS} más. Salen en la ficha de cada cliente y en Caja al buscarlo.
            </p>
          )}
        </section>
      )}
    </>
  );
}
