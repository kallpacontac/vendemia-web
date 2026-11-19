'use client';
/**
 * Ajustes › Boletas › «Impresora de este equipo»: imprimir directo a la ticketera, sin la app de
 * impresión de Android (PrintDin gratis pone «Sólo para uso personal» en cada boleta).
 * Se guarda en ESTE equipo, al momento, sin «Guardar»: cada tablet tiene su ticketera.
 */
import { useEffect, useState } from 'react';
import { Bluetooth, Printer, Usb } from 'lucide-react';
import {
  elegirBluetooth, elegirUsb, guardarConfig, hayBluetooth, hayUsb, imprimirDirecto, leerConfig, ticketDePrueba,
  type ConfigImpresora, type ModoImpresion,
} from './impresoraDirecta';

export default function ImpresoraDelEquipo({ ancho, negocio }: { ancho: 58 | 80; negocio: string }) {
  const [conf, setConf] = useState<ConfigImpresora>({ modo: 'sistema' });
  const [soporta, setSoporta] = useState({ bt: false, usb: false });
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    setConf(leerConfig());
    setSoporta({ bt: hayBluetooth(), usb: hayUsb() });
  }, []);

  const hacer = async (paso: () => Promise<string>) => {
    setOcupado(true);
    setMensaje(null);
    try {
      setMensaje({ tipo: 'ok', texto: await paso() });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  const cambiarModo = (modo: ModoImpresion) => {
    setMensaje(null);
    // Como siempre: se guarda ya. Directa: se guarda al elegir la ticketera.
    if (modo === 'sistema') {
      const c = { modo };
      guardarConfig(c);
      setConf(c);
    } else {
      setConf({ modo });
    }
  };

  const buscar = () =>
    hacer(async () => {
      const c = conf.modo === 'usb' ? await elegirUsb() : await elegirBluetooth();
      setConf(c);
      return `Lista: ${c.nombre}. Toca «Imprimir prueba» para confirmar.`;
    });

  const probar = () =>
    hacer(async () => {
      await imprimirDirecto(Promise.resolve(ticketDePrueba(negocio)), ancho);
      return 'Enviada. Si salió el papel de prueba, ya está: Imprimir en Caja sale directo.';
    });

  const elegida = conf.modo !== 'sistema' && !!conf.nombre;
  const sinSoporte = (conf.modo === 'bluetooth' && !soporta.bt) || (conf.modo === 'usb' && !soporta.usb);

  return (
    <>
      <h4 className="fe-sub">Impresora de este equipo</h4>
      <div className="grid-form">
        <label>
          <span className="field-label">Al tocar «Imprimir»</span>
          <select className="select" value={conf.modo} onChange={(e) => cambiarModo(e.target.value as ModoImpresion)}>
            <option value="sistema">Como siempre (ventana de impresión)</option>
            <option value="bluetooth">Directo a la ticketera por Bluetooth</option>
            <option value="usb">Directo a la ticketera por cable USB</option>
          </select>
        </label>

        {conf.modo !== 'sistema' && (
          <div className="fe-impresora">
            <span className="field-label">Ticketera</span>
            <span className="fe-impresora__fila">
              <b>{elegida ? conf.nombre : 'Sin elegir'}</b>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void buscar()} disabled={ocupado || sinSoporte}>
                {conf.modo === 'usb' ? <Usb size={14} /> : <Bluetooth size={14} />} {elegida ? 'Cambiar' : 'Buscar'}
              </button>
              {elegida && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void probar()} disabled={ocupado}>
                  <Printer size={14} /> {ocupado ? 'Imprimiendo…' : 'Imprimir prueba'}
                </button>
              )}
            </span>
          </div>
        )}

        {mensaje && (
          <p className={`full fe-ayuda ${mensaje.tipo === 'error' ? 'fe-falta' : ''}`} role="status">
            {mensaje.texto}
          </p>
        )}

        <p className="full muted fe-ayuda">
          {conf.modo === 'sistema' && (
            <>
              Android manda el ticket a la app de impresión que tenga instalada. Si la boleta sale con «Versión gratuita…
              uso personal», es esa app: elige «Directo» y Vendemia imprime sin ella.
            </>
          )}
          {conf.modo === 'bluetooth' && (sinSoporte ? (
            <>Este navegador no imprime directo por Bluetooth. Abre Vendemia en <b>Chrome</b> (Android o computadora).</>
          ) : (
            <>
              Prende la ticketera y toca «Buscar». Si no sale en la lista, no tiene Bluetooth directo: usa el cable USB o
              deja «Como siempre». Ancho del papel: {ancho} mm (arriba, en «Ticketera»). Se guarda solo en este equipo.
            </>
          ))}
          {conf.modo === 'usb' && (sinSoporte ? (
            <>Este navegador no imprime directo por USB. Abre Vendemia en <b>Chrome</b> (Android o computadora).</>
          ) : (
            <>
              Conecta la ticketera con su cable (en la tablet, con un adaptador OTG), préndela y toca «Buscar». Ancho del
              papel: {ancho} mm. Se guarda solo en este equipo.
            </>
          ))}
        </p>
      </div>
    </>
  );
}
