'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ALUMNOS · la ficha de la academia
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una sola pantalla para lo que una academia mira cada día: quién está
 * inscrito, en qué nivel y grupo, hasta cuándo cubre, quién debe y cuánto, y
 * a quién le toca renovar. Agrupado por familia (quien paga), con sus alumnos
 * dentro: la deuda es de la venta, no del niño. Ver lib/panel/alumnos.ts.
 *
 * Solo lee. Lo único que escribe es «Registrar pago» (`registrar_pago`, con
 * importe), y pasa por la cola como todo lo demás.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock, GraduationCap, MessageCircle, Search, Wallet } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import Paginacion, { usePaginacion } from '@/components/panel/Paginacion';
import { RegistrarPago } from '@/components/panel/Saldos';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { familias, DIAS_AVISO_RENOVAR, type EstadoFamilia, type Familia } from '@/lib/panel/alumnos';
import { soles, telefono } from '@/lib/panel/format';
import { hoyLima } from '@/lib/panel/inscripciones';
import { getCatalogo, getCitas, getLeads, getVentas } from '@/lib/supabase/queries';

type Filtro = 'todos' | EstadoFamilia | 'renovar';

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'debe', label: 'Deben' },
  { id: 'por_pagar', label: 'Por pagar' },
  { id: 'renovar', label: 'Por renovar' },
  { id: 'al_dia', label: 'Al día' },
];

const ESTADO: Record<EstadoFamilia, { label: string; color: string; fondo: string }> = {
  debe: { label: 'Debe', color: '#C2410C', fondo: '#FFEDD5' },
  por_pagar: { label: 'Por pagar · sin cupo', color: '#B26B00', fondo: '#FEF6E7' },
  al_dia: { label: 'Al día', color: '#0FA968', fondo: '#E8FBF2' },
};

export default function Alumnos() {
  const { companyId } = useSesion();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');

  const { datos, cargando, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [citas, leads, catalogo] = await Promise.all([
      getCitas(companyId),
      getLeads(companyId, 1000),
      getCatalogo(companyId),
    ]);
    const ventas = await getVentas(companyId, citas);
    return familias(citas, leads, catalogo, ventas, hoyLima());
  }, [companyId]);

  const todas = useMemo(() => datos ?? [], [datos]);

  const resumen = useMemo(() => {
    const alumnos = todas.flatMap((f) => f.alumnos);
    const deben = todas.filter((f) => f.estado === 'debe');
    return {
      activos: alumnos.filter((a) => !a.sinCupo).length,
      porPagar: alumnos.filter((a) => a.sinCupo).length,
      deben: deben.length,
      porCobrar: deben.reduce((t, f) => t + f.debe, 0),
      porRenovar: alumnos.filter((a) => a.porRenovar).length,
    };
  }, [todas]);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todas.filter((f) => {
      if (filtro === 'renovar' && !f.alumnos.some((a) => a.porRenovar)) return false;
      if (filtro !== 'todos' && filtro !== 'renovar' && f.estado !== filtro) return false;
      if (!q) return true;
      return (
        f.responsable.toLowerCase().includes(q) ||
        f.telefono.includes(q.replace(/\D/g, '') || '·') ||
        f.alumnos.some((a) => a.nombre.toLowerCase().includes(q) || a.nivel.toLowerCase().includes(q))
      );
    });
  }, [todas, filtro, busca]);

  // Antes de cualquier return: es un hook.
  const pag = usePaginacion(visibles, 15);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Alumnos" sub="Quién está inscrito, hasta cuándo y si está al día" />

        <div className="mini-row">
          <div className="mini">
            <div className="ic" style={{ background: '#E8FBF2', color: '#0FA968' }}>
              <GraduationCap />
            </div>
            <div>
              <b>{resumen.activos}</b>
              <small>Con cupo</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#FFEDD5', color: '#C2410C' }}>
              <Wallet />
            </div>
            <div>
              <b>{soles(resumen.porCobrar)}</b>
              <small>
                Por cobrar · {resumen.deben} {resumen.deben === 1 ? 'familia' : 'familias'}
              </small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#EEF1FE', color: '#3D5AF1' }}>
              <Clock />
            </div>
            <div>
              <b>{resumen.porRenovar}</b>
              <small>Renuevan en {DIAS_AVISO_RENOVAR} días</small>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <div className="chip-tabs" role="tablist" aria-label="Filtrar alumnos">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filtro === f.id}
                className={filtro === f.id ? 'active' : ''}
                onClick={() => setFiltro(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="search">
            <Search />
            <input
              placeholder="Buscar alumno, familia, teléfono o nivel…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
        </div>

        {cargando && !datos ? (
          <div className="card muted" style={{ textAlign: 'center', padding: 30 }}>
            Cargando…
          </div>
        ) : visibles.length === 0 ? (
          <div className="card">
            <div className="vacio">
              <b>{todas.length === 0 ? 'Todavía no hay alumnos' : 'Nadie con este filtro'}</b>
              {todas.length === 0
                ? 'Cuando Mia inscriba a alguien en un grupo, aparecerá aquí.'
                : 'Prueba con otro filtro o búsqueda.'}
            </div>
          </div>
        ) : (
          <div className="familias">
            {pag.visibles.map((f) => (
              <TarjetaFamilia key={f.leadId} f={f} alGuardar={releer} />
            ))}
          </div>
        )}

        <Paginacion pagina={pag.pagina} paginas={pag.paginas} irA={pag.irA} />

        {resumen.porPagar > 0 && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
            {resumen.porPagar === 1
              ? '1 inscripción espera su primer pago: no tiene cupo y otro se lo puede llevar.'
              : `${resumen.porPagar} inscripciones esperan su primer pago: no tienen cupo y otro se lo puede llevar.`}{' '}
            Retargeting las recuerda como «cupo sin pagar».
          </p>
        )}
      </div>
    </main>
  );
}

function TarjetaFamilia({ f, alGuardar }: { f: Familia; alGuardar: () => void }) {
  const [pagando, setPagando] = useState(false);
  const e = ESTADO[f.estado];
  const soloUno = f.alumnos.length === 1 && f.alumnos[0].nombre === f.responsable;

  return (
    <div className="card familia">
      <div className="familia__cabeza">
        <div className="familia__quien">
          <b>{f.responsable}</b>
          <small className="muted">
            {telefono(f.telefono)}
            {!soloUno && ` · ${f.alumnos.length} ${f.alumnos.length === 1 ? 'alumno' : 'alumnos'}`}
          </small>
        </div>
        <span className="badge-pill" style={{ color: e.color, background: e.fondo }}>
          {f.estado === 'al_dia' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />} {e.label}
          {f.estado === 'debe' ? ` ${soles(f.debe)}` : ''}
        </span>
      </div>

      {f.venta && (
        <p className="familia__cuenta muted">
          Total {soles(f.venta.saldo.total)} · pagó {soles(f.venta.saldo.pagado)}
          {f.venta.pagos.length > 0 &&
            ` en ${f.venta.pagos.length} ${f.venta.pagos.length === 1 ? 'pago' : 'pagos'}`}
        </p>
      )}

      <ul className="familia__alumnos">
        {f.alumnos.map((a) => (
          <li key={a.id}>
            <div>
              <b>
                {a.nombre}
                {a.edad ? <small className="muted"> · {a.edad} años</small> : null}
              </b>
              <small className="muted">
                {a.nivel}
                {a.grupo ? ` · ${a.grupo}` : ''}
              </small>
            </div>
            <span className={`familia__cubre ${a.sinCupo ? 'sin' : ''}`}>
              {a.porRenovar && <span className="badge-pill familia__renovar">Renueva pronto</span>}
              {a.cubre}
            </span>
          </li>
        ))}
      </ul>

      <div className="familia__acciones">
        {pagando && f.venta ? (
          <RegistrarPago v={f.venta} alCerrar={() => setPagando(false)} alGuardar={alGuardar} />
        ) : (
          <>
            {f.estado === 'debe' && f.venta && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setPagando(true)}>
                <Wallet size={14} /> Registrar pago
              </button>
            )}
            <Link className="btn btn-ghost btn-sm" href={`/panel/mensajes?lead=${f.leadId}`}>
              <MessageCircle size={14} /> Ver chat
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
