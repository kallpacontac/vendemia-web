'use client';
/**
 * Ajustes › Boletas y facturas. Solo el dueño los cambia (Postgres lo impone).
 *
 * El proveedor se elige aquí y se puede cambiar cuando se quiera: el token de
 * cada uno queda guardado aparte, y lo ya emitido se sigue consultando con el
 * proveedor con el que salió.
 */
import { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { INFO_PROVEEDOR } from '../dominio/proveedoresInfo';
import { erroresEmisor, rucValido, soloDigitos, TOPE_BOLETA_SIN_DOCUMENTO } from '../dominio/validar';
import { PROVEEDORES, type IdProveedor } from '../dominio/tipos';
import { guardarAjustes, tasaTexto, type Ajustes } from './api';

/** «2027-01-01» → «1 de enero de 2027». */
const fechaLarga = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function AjustesFacturacion({
  companyId,
  inicial,
  alGuardar,
}: {
  companyId: string;
  inicial: Ajustes;
  alGuardar: (a: Ajustes) => void;
}) {
  const avisar = useAvisar();
  const [a, setA] = useState<Ajustes>(inicial);
  const [token, setToken] = useState('');
  const [ultimos, setUltimos] = useState({ boleta: String(inicial.ultimo_boleta), factura: String(inicial.ultimo_factura) });
  const [guardando, setGuardando] = useState(false);
  const esDueno = inicial.rol === 'dueno';
  const info = INFO_PROVEEDOR[a.proveedor];
  const tokenGuardado = inicial.tokens?.[a.proveedor];
  const otraTasa = a.igv_tipo === 'gravado' && a.igv_porcentaje !== 18;
  // La tasa de hoy y su próximo cambio los calcula Postgres: solo valen si lo guardado ya es «mype».
  const mypeGuardado = a.igv_tipo === 'mype' && inicial.igv_tipo === 'mype';

  const poner = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => setA((x) => ({ ...x, [k]: v }));

  const faltan = a.activo
    ? erroresEmisor(
        {
          ruc: a.ruc, razonSocial: a.razon_social, nombreComercial: a.nombre_comercial, direccion: a.direccion,
          ubigeo: a.ubigeo, departamento: a.departamento, provincia: a.provincia, distrito: a.distrito,
        },
        info.pideUbigeo,
      )
    : [];

  async function guardar() {
    if (a.ruc && !rucValido(a.ruc)) return avisar('El RUC del negocio no es válido.', 'error');
    if (faltan.length) return avisar(faltan[0], 'error');
    const datos: Record<string, unknown> = {
      activo: a.activo, proveedor: a.proveedor, ambiente: a.ambiente, ruc: a.ruc, razon_social: a.razon_social,
      nombre_comercial: a.nombre_comercial, direccion: a.direccion, ubigeo: a.ubigeo, departamento: a.departamento,
      provincia: a.provincia, distrito: a.distrito, serie_boleta: a.serie_boleta.toUpperCase(),
      serie_factura: a.serie_factura.toUpperCase(), igv_tipo: a.igv_tipo, igv_porcentaje: a.igv_porcentaje,
      leyenda_amazonia: a.igv_tipo === 'exonerado' ? a.leyenda_amazonia ?? '2001' : null, ticket_ancho: a.ticket_ancho,
      al_cobrar: a.al_cobrar,
    };
    // Solo si lo cambió: así no se pisa lo que ya avanzó la serie.
    if (ultimos.boleta !== String(inicial.ultimo_boleta)) datos.ultimo_boleta = Number(ultimos.boleta) || 0;
    if (ultimos.factura !== String(inicial.ultimo_factura)) datos.ultimo_factura = Number(ultimos.factura) || 0;
    setGuardando(true);
    try {
      const nuevo = await guardarAjustes(companyId, datos, token.trim() ? token.trim() : null);
      setToken('');
      setA({ ...nuevo, igv_porcentaje: Number(nuevo.igv_porcentaje) });
      setUltimos({ boleta: String(nuevo.ultimo_boleta), factura: String(nuevo.ultimo_factura) });
      alGuardar(nuevo);
      avisar('Ajustes guardados.');
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  const campo = (k: keyof Ajustes, etiqueta: string, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}, full = false) => (
    <label className={full ? 'full' : undefined}>
      <span className="field-label">{etiqueta}</span>
      <input
        className="input"
        value={String(a[k] ?? '')}
        disabled={!esDueno}
        onChange={(e) => poner(k, e.target.value as never)}
        {...extra}
      />
    </label>
  );

  return (
    <div className="card fe-ajustes">
      <div className="card-mini-head">
        <h3>Ajustes de boletas y facturas</h3>
        {!esDueno && <small className="muted">Solo el dueño los cambia</small>}
      </div>

      <div className="toggle-row">
        <div className="t">
          <b>Emitir boletas y facturas desde Vendemia</b>
          <small>Apagado, nadie puede emitir. Puedes dejarlo listo y encenderlo cuando termines las pruebas.</small>
        </div>
        <input type="checkbox" checked={a.activo} disabled={!esDueno} onChange={(e) => poner('activo', e.target.checked)} />
      </div>

      <h4 className="fe-sub">Proveedor</h4>
      <div className="grid-form">
        <label>
          <span className="field-label">Quién lo manda a SUNAT</span>
          <select
            className="select"
            value={a.proveedor}
            disabled={!esDueno}
            onChange={(e) => {
              const p = e.target.value as IdProveedor;
              setA((x) => ({ ...x, proveedor: p, ambiente: INFO_PROVEEDOR[p].real ? x.ambiente : 'pruebas' }));
            }}
          >
            {PROVEEDORES.map((p) => (
              <option key={p} value={p}>{INFO_PROVEEDOR[p].nombre}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Ambiente</span>
          <select
            className="select"
            value={a.ambiente}
            disabled={!esDueno || !info.real}
            onChange={(e) => poner('ambiente', e.target.value as Ajustes['ambiente'])}
          >
            <option value="pruebas">Pruebas (no vale ante SUNAT)</option>
            <option value="produccion">Producción (comprobantes reales)</option>
          </select>
        </label>
        <p className="full muted fe-ayuda">{info.comoConectar}</p>
        {a.proveedor === 'apisperu' && (
          <p className="full muted fe-ayuda">
            En APIsPerú, pruebas o producción se eligen en su panel, al dar de alta la empresa. Pon aquí lo mismo para que
            el ticket diga si es de prueba.
          </p>
        )}
        {info.real && (
          <label className="full">
            <span className="field-label">
              <KeyRound size={13} style={{ verticalAlign: '-2px' }} /> Token de {info.nombre}
              {tokenGuardado ? <span className="muted"> · guardado (…{tokenGuardado})</span> : null}
            </span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder={tokenGuardado ? 'Deja vacío para mantener el que está' : 'Pega aquí el token'}
              value={token}
              disabled={!esDueno}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
        )}
      </div>

      <h4 className="fe-sub">El negocio, como sale en el comprobante</h4>
      <div className="grid-form">
        {campo('ruc', 'RUC', { inputMode: 'numeric', maxLength: 11, onChange: (e) => poner('ruc', soloDigitos(e.target.value).slice(0, 11)) })}
        {campo('razon_social', 'Razón social (como en SUNAT)')}
        {campo('nombre_comercial', 'Nombre comercial (opcional)')}
        {campo('direccion', 'Dirección fiscal')}
        {info.pideUbigeo && (
          <>
            {campo('ubigeo', 'Ubigeo (6 dígitos)', { inputMode: 'numeric', maxLength: 6, onChange: (e) => poner('ubigeo', soloDigitos(e.target.value).slice(0, 6)) })}
            {campo('departamento', 'Departamento')}
            {campo('provincia', 'Provincia')}
            {campo('distrito', 'Distrito')}
          </>
        )}
      </div>

      <h4 className="fe-sub">IGV</h4>
      <div className="grid-form">
        <label>
          <span className="field-label">Cómo cobra el IGV este local</span>
          <select
            className="select"
            value={a.igv_tipo === 'gravado' ? (otraTasa ? 'otra' : '18') : a.igv_tipo}
            disabled={!esDueno}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'exonerado') setA((x) => ({ ...x, igv_tipo: 'exonerado', leyenda_amazonia: x.leyenda_amazonia ?? '2001' }));
              else if (v === 'mype') setA((x) => ({ ...x, igv_tipo: 'mype' }));
              else if (v === 'otra') setA((x) => ({ ...x, igv_tipo: 'gravado', igv_porcentaje: x.igv_porcentaje !== 18 ? x.igv_porcentaje : 8 }));
              else setA((x) => ({ ...x, igv_tipo: 'gravado', igv_porcentaje: 18 }));
            }}
          >
            <option value="18">18 % (lo general)</option>
            <option value="mype">Restaurante u hotel MYPE (tasa reducida por ley)</option>
            <option value="otra">Otra tasa…</option>
            <option value="exonerado">Exonerado · Amazonía (p. ej. Iquitos)</option>
          </select>
        </label>
        {otraTasa && (
          <label>
            <span className="field-label">Tasa (%)</span>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0.01"
              max="30"
              value={a.igv_porcentaje}
              disabled={!esDueno}
              onChange={(e) => poner('igv_porcentaje', Number(e.target.value))}
            />
          </label>
        )}
        {a.igv_tipo === 'exonerado' && (
          <label>
            <span className="field-label">Qué vende</span>
            <select
              className="select"
              value={a.leyenda_amazonia ?? '2001'}
              disabled={!esDueno}
              onChange={(e) => poner('leyenda_amazonia', e.target.value as '2001' | '2002' | 'ambas')}
            >
              <option value="2001">Bienes (tienda, comida para llevar…)</option>
              <option value="2002">Servicios (salón, restaurante, cancha…)</option>
              <option value="ambas">Servicios y productos (p. ej. barbería que vende ceras)</option>
            </select>
          </label>
        )}
        {a.igv_tipo === 'mype' && (
          <p className="full fe-ayuda">
            {mypeGuardado ? (
              <>
                Hoy sale con <b>{tasaTexto(inicial.igv_tasa_hoy)} %</b>.
                {inicial.igv_tasa_cambio
                  ? ` Desde el ${fechaLarga(inicial.igv_tasa_cambio.desde)} pasa a ${tasaTexto(inicial.igv_tasa_cambio.tasa)} %, sin que tengas que tocar nada.`
                  : ''}
              </>
            ) : (
              'Vendemia pone la tasa que manda la ley según la fecha: 10,5 % en 2026, 15 % en 2027 y 18 % desde 2028.'
            )}{' '}
            Solo vale si el local es micro o pequeña empresa (ventas de hasta 1.700 UIT al año), al menos el 70 % de lo
            que vende es restaurante, hotel u hospedaje y no está vinculado a otras empresas.
          </p>
        )}
        <p className="full muted fe-ayuda">
          La tasa la confirma el contador del local. Exonerado solo si el local está en la Amazonía y vende para consumo en
          la misma región (Iquitos sí; Huancayo no).
        </p>
      </div>

      <h4 className="fe-sub">Series y ticket</h4>
      <div className="grid-form">
        {campo('serie_boleta', 'Serie de boletas', { maxLength: 4, onChange: (e) => poner('serie_boleta', e.target.value.toUpperCase()) })}
        <label>
          <span className="field-label">Último número de boleta ya emitido</span>
          <input className="input" inputMode="numeric" value={ultimos.boleta} disabled={!esDueno}
            onChange={(e) => setUltimos((u) => ({ ...u, boleta: soloDigitos(e.target.value) }))} />
        </label>
        {campo('serie_factura', 'Serie de facturas', { maxLength: 4, onChange: (e) => poner('serie_factura', e.target.value.toUpperCase()) })}
        <label>
          <span className="field-label">Último número de factura ya emitido</span>
          <input className="input" inputMode="numeric" value={ultimos.factura} disabled={!esDueno}
            onChange={(e) => setUltimos((u) => ({ ...u, factura: soloDigitos(e.target.value) }))} />
        </label>
        <p className="full muted fe-ayuda">
          Si el local ya emite con otro sistema, usa una serie nueva (B002, F002) para no chocar números, o pon aquí el
          último número que emitió con esa serie.
        </p>
        <label>
          <span className="field-label">Ticketera</span>
          <select className="select" value={a.ticket_ancho} disabled={!esDueno}
            onChange={(e) => poner('ticket_ancho', Number(e.target.value) === 58 ? 58 : 80)}>
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </select>
        </label>
        <label>
          <span className="field-label">Al cobrar en Caja</span>
          <select className="select" value={a.al_cobrar} disabled={!esDueno}
            onChange={(e) => poner('al_cobrar', e.target.value as Ajustes['al_cobrar'])}>
            <option value="preguntar">Botón «Emitir boleta»</option>
            <option value="automatico">Emitir la boleta sola</option>
            <option value="no">Nada (la hago aquí)</option>
          </select>
        </label>
        {a.al_cobrar === 'automatico' && (
          <p className="full muted fe-ayuda">
            Cada cobro de Caja saca su boleta sin documento, hasta S/{TOPE_BOLETA_SIN_DOCUMENTO}. Si pasa de eso, o el
            cliente pide boleta con DNI o factura, se hace con el botón. Solo la emite el dueño o el administrador.
          </p>
        )}
      </div>

      {esDueno && (
        <div className="fe-pie">
          {faltan.length > 0 && <small className="fe-falta">{faltan[0]}</small>}
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
            <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}
