'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FÁBRICA DE PLACAS · solo el superadmin de Vendemia (tabla platform_admins)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Crea placas SIN DUEÑO para tener stock: cada una con su URL fija y su código
 * secreto de activación. Quien la compra la canjea desde su panel con ese
 * código y pasa a ser suya.
 *
 * Es una pantalla global (lib/panel/rutas.ts), no de un negocio: el admin de
 * plataforma normalmente no es miembro de ninguno. La barrera de verdad está
 * en la base: loyalty_admin_device_batch/order exigen loyalty_es_admin().
 *
 * Los códigos solo existen en la respuesta (en la base queda su hash): las
 * tarjetas de activación se descargan ahora o se pierden. Los ENLACES no son
 * secretos (van impresos en la placa): la lista de lotes de abajo los deja
 * copiar o grabar en el chip cuando haga falta, también desde el móvil.
 */
import { useEffect, useMemo, useState } from 'react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje, type PlacaStock } from '@/modules/fideliza/cliente/api';
import EnlacesPlacas, { ordenLote } from '@/modules/fideliza/ui/EnlacesPlacas';
import { urlPlaca, urlPlacaQr } from '@/modules/fideliza/dominio/config';
import { descargarHtml, hojaActivacion, hojaFrentes } from '@/modules/fideliza/ui/hojaLote';

interface PlacaFabricada {
  id: string;
  public_token: string;
  activation_code: string;
}
interface Lote {
  nombre: string;
  kind: 'qr' | 'nfc_qr';
  codigoPedido: string | null;
  placas: PlacaFabricada[];
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

export default function Fabrica() {
  const { esAdminPlataforma } = useSesion();
  const avisar = useAvisar();
  const [cantidad, setCantidad] = useState(20);
  const [nombre, setNombre] = useState(`stock-${hoy()}`);
  const [pedido, setPedido] = useState(false);
  const [kind, setKind] = useState<'qr' | 'nfc_qr'>('qr');
  const [ocupado, setOcupado] = useState(false);
  const [lote, setLote] = useState<Lote | null>(null);

  // Con un lote en pantalla, salir sin descargar pierde los códigos para siempre.
  useEffect(() => {
    if (!lote) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [lote]);

  // Los lotes ya fabricados, con sus enlaces. Se relee al fabricar uno nuevo.
  const { datos: stock, releer: releerStock } = useCargar(
    async () => (esAdminPlataforma ? lecturas.stock() : ([] as PlacaStock[])),
    [esAdminPlataforma],
  );
  const lotes = useMemo(() => {
    const porLote = new Map<string, PlacaStock[]>();
    for (const p of stock ?? []) porLote.set(p.batch ?? '', [...(porLote.get(p.batch ?? '') ?? []), p]);
    return [...porLote.entries()]
      .map(([nombre, ps]) => ({
        nombre,
        placas: ordenLote(ps),
        kind: ps.some((p) => p.kind === 'nfc_qr') ? ('nfc_qr' as const) : ('qr' as const),
        libres: ps.filter((p) => !p.company_id).length,
        fecha: ps.reduce((m, p) => (p.created_at > m ? p.created_at : m), ''),
      }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [stock]);

  if (!esAdminPlataforma) {
    return (
      <main className="main">
        <Topbar titulo="Fábrica de placas" />
        <div className="card">Esta pantalla es solo para el equipo de Vendemia.</div>
      </main>
    );
  }

  const maximo = pedido ? 200 : 500;
  const limpio = nombre.trim().replace(/\s+/g, '-');

  async function fabricar() {
    if (!limpio || cantidad < 1 || cantidad > maximo) return;
    setOcupado(true);
    try {
      if (pedido) {
        const r = await accion<{ order_code: string; devices: PlacaFabricada[] }>('placa.pedido', { count: cantidad, batch: limpio, kind });
        setLote({ nombre: limpio, kind, codigoPedido: r.order_code, placas: ordenLote(r.devices) });
      } else {
        const placas = await accion<PlacaFabricada[]>('placa.lote', { count: cantidad, batch: limpio, kind });
        setLote({ nombre: limpio, kind, codigoPedido: null, placas: ordenLote(placas) });
      }
      releerStock();
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  /** QR privado de la tarjeta de la caja: el código va en el fragmento (no llega al servidor). */
  const activar = (c: string) => `${window.location.origin}/panel/fideliza/placas?activar=1#codigo=${c}`;

  function bajarCsv(l: Lote) {
    const csv = [
      'n,id,token,url_nfc,url_qr,codigo_placa,codigo_pedido,enlace_activacion',
      ...l.placas.map((p, i) =>
        [i + 1, p.id, p.public_token, urlPlaca(p.public_token), urlPlacaQr(p.public_token), p.activation_code, l.codigoPedido ?? '', activar(l.codigoPedido ?? p.activation_code)].join(','),
      ),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `placas-${l.nombre}.csv`;
    a.click();
  }

  /** La hoja de QR no lleva nada secreto: se puede volver a sacar de cualquier lote. */
  async function reimprimirFrentes(nombreLote: string, placas: PlacaStock[]) {
    try {
      const html = await hojaFrentes(placas.map((p) => ({ public_token: p.public_token, activation_code: '' })), nombreLote);
      descargarHtml(html, `placas-${nombreLote}-frentes.html`);
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  async function imprimir(l: Lote, cual: 'frentes' | 'activacion') {
    try {
      const html =
        cual === 'frentes'
          ? await hojaFrentes(l.placas, l.nombre)
          : await hojaActivacion(
              // Pedido de un negocio: todas las tarjetas llevan el código común.
              l.placas.map((p) => ({ ...p, activation_code: l.codigoPedido ?? p.activation_code })),
              l.nombre,
              activar,
            );
      descargarHtml(html, `placas-${l.nombre}-${cual}.html`);
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  return (
    <main className="main">
      <Topbar titulo="Fábrica de placas" sub="Stock sin dueño: se imprime ahora y lo canjea quien la compre" />

      {lote ? (
        <div className="card" style={{ maxWidth: 720 }}>
          <b style={{ fontSize: 16 }}>
            {lote.placas.length} placas creadas · lote «{lote.nombre}»
          </b>
          {lote.codigoPedido && (
            <p style={{ marginTop: 8 }}>
              Código del pedido (las activa todas): <b className="fz-mono">{lote.codigoPedido}</b>
            </p>
          )}
          <div className="fz-panel-aviso" style={{ marginTop: 12 }}>
            <span>
              Los <b>códigos de activación</b> solo se ven ahora: descarga las tarjetas (y el CSV si quieres respaldo) antes de salir. Los enlaces sí quedan abajo, en «Lotes fabricados».
            </span>
          </div>
          <div className="fz-fila" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => void imprimir(lote, 'frentes')}>
              1 · Hoja de QR (imprenta)
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => void imprimir(lote, 'activacion')}>
              2 · Tarjetas de activación (privado)
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => bajarCsv(lote)}>
              3 · CSV (privado)
            </button>
          </div>
          <ul className="fz-ayudas">
            <li><b>Hoja de QR:</b> el frente de cada placa, numerado #01, #02… Se puede mandar a la imprenta: no lleva nada secreto.</li>
            <li><b>Tarjetas de activación:</b> cada una va DENTRO del sobre de la placa con el mismo número. Quien tenga el código se queda la placa.</li>
            <li><b>CSV:</b> respaldo con todo, códigos incluidos. Al proveedor de NFC, solo la columna url_nfc.</li>
          </ul>

          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Enlaces de cada placa</h4>
          <EnlacesPlacas placas={lote.placas} nfc={lote.kind === 'nfc_qr'} />
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 12 }}
            onClick={() => window.confirm('¿Ya descargaste las tarjetas de activación? Los códigos no se vuelven a mostrar.') && setLote(null)}
          >
            Fabricar otro lote
          </button>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="fz-col2">
            <div className="fz-campo">
              <label className="field-label" htmlFor="cantidad">Cantidad</label>
              <input id="cantidad" className="input" type="number" min={1} max={maximo} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
              <small>Entre 1 y {maximo}.</small>
            </div>
            <div className="fz-campo">
              <label className="field-label" htmlFor="lote">Nombre del lote</label>
              <input id="lote" className="input" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <small>Para reconocerlo tú. El cliente no lo ve.</small>
            </div>
          </div>

          <label className="field-label">¿Para quién son?</label>
          <label className="fz-fila" style={{ gap: 8 }}>
            <input type="radio" name="pedido" checked={!pedido} onChange={() => setPedido(false)} />
            <span><b>Stock suelto</b> · cada placa con su propio código, se venden por separado</span>
          </label>
          <label className="fz-fila" style={{ gap: 8, marginBottom: 12 }}>
            <input type="radio" name="pedido" checked={pedido} onChange={() => setPedido(true)} />
            <span><b>Pedido de un negocio</b> · además, un solo código las activa todas</span>
          </label>

          <label className="field-label">Soporte</label>
          <label className="fz-fila" style={{ gap: 8 }}>
            <input type="radio" name="kind" checked={kind === 'qr'} onChange={() => setKind('qr')} />
            <span><b>Solo QR</b> · pegatinas, carteles, mesas</span>
          </label>
          <label className="fz-fila" style={{ gap: 8, marginBottom: 14 }}>
            <input type="radio" name="kind" checked={kind === 'nfc_qr'} onChange={() => setKind('nfc_qr')} />
            <span><b>NFC + QR</b> · placa con chip, que además lleva el QR impreso</span>
          </label>

          <button className="btn btn-primary" disabled={ocupado || !limpio || cantidad < 1 || cantidad > maximo} onClick={() => void fabricar()}>
            {ocupado ? 'Fabricando…' : `Fabricar ${cantidad} placas`}
          </button>
          <ul className="fz-ayudas">
            <li>Las placas nacen <b>sin dueño</b>: al escanearlas dicen «Esta placa aún no está activada».</li>
            <li>Quien la compra entra (o crea su cuenta), escribe el código de su tarjeta o escanea su QR, y la placa pasa a ser suya.</li>
            <li>Después elige a dónde lleva: su página o un enlace directo. Lo puede cambiar cuando quiera sin reimprimir.</li>
          </ul>
        </div>
      )}

      <div className="card" style={{ maxWidth: 720, marginTop: 16 }}>
        <b style={{ fontSize: 16 }}>Lotes fabricados</b>
        <p className="fz-def">
          Para grabar los chips o pasarle los enlaces a la imprenta. El número de cada placa es el mismo que el de su hoja de QR. Los códigos de activación no
          están aquí: solo existen en las tarjetas que descargaste.
        </p>
        {!stock ? (
          <p className="fz-def">Cargando…</p>
        ) : !lotes.length ? (
          <p className="fz-def">Todavía no hay lotes.</p>
        ) : (
          lotes.map((g) => (
            <details key={g.nombre} className="fz-lote">
              <summary>
                <b>{g.nombre || 'sin nombre'}</b>
                <small>
                  {g.placas.length} placas · {g.kind === 'nfc_qr' ? 'NFC + QR' : 'solo QR'} · {g.libres} sin activar
                </small>
              </summary>
              <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }} onClick={() => void reimprimirFrentes(g.nombre, g.placas)}>
                Hoja de QR (imprenta)
              </button>
              <EnlacesPlacas placas={g.placas} nfc={g.kind === 'nfc_qr'} />
            </details>
          ))
        )}
      </div>
    </main>
  );
}
