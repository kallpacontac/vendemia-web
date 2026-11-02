'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ENCUADRAR LA FOTO · el paso antes de subir la foto de perfil o el logo
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Igual que en Instagram o Facebook: la foto se mueve y se acerca debajo de un
 * círculo, y lo que se ve dentro es lo que sale en la página. El recorte se hace
 * aquí, en el navegador, y a Cloudinary ya llega el cuadrado.
 *
 * Una foto empieza llenando el círculo. Un logo con transparencia empieza entero,
 * porque cortarle las letras es peor que dejarle aire alrededor; «Ver entera» da
 * lo mismo a un logo horizontal con fondo blanco.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn, ZoomOut } from 'lucide-react';
import {
  LADO_SALIDA,
  dibujoEnLienzo,
  encuadreInicial,
  ladoDeZoom,
  ladoEntera,
  ladoLlenar,
  limitar,
  problemaMedidas,
  zoomDeLado,
  type Encuadre,
  type Medidas,
} from '@/modules/fideliza/dominio/encuadre';
import './encuadrar.css';

interface Foto extends Medidas {
  img: HTMLImageElement;
  conAlfa: boolean;
}

function tieneTransparencia(img: HTMLImageElement, tipo: string): boolean {
  if (tipo === 'image/jpeg') return false;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

/** JPEG salvo que haya transparencia que guardar: una foto pesa una décima parte en el celular. */
function recortar(foto: Foto, e: Encuadre): Promise<File> {
  const c = document.createElement('canvas');
  c.width = c.height = LADO_SALIDA;
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Tu navegador no pudo preparar la imagen.'));
  const conAlfa = foto.conAlfa || e.lado > ladoLlenar(foto);
  if (!conAlfa) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, LADO_SALIDA, LADO_SALIDA);
  }
  ctx.imageSmoothingQuality = 'high';
  const d = dibujoEnLienzo(foto, e);
  ctx.drawImage(foto.img, d.x, d.y, d.ancho, d.alto);
  const tipo = conAlfa ? 'image/png' : 'image/jpeg';
  return new Promise((resolver, rechazar) => {
    c.toBlob(
      (blob) => (blob ? resolver(new File([blob], conAlfa ? 'foto.png' : 'foto.jpg', { type: tipo })) : rechazar(new Error('Tu navegador no pudo preparar la imagen.'))),
      tipo,
      0.92,
    );
  });
}

export default function EncuadrarFoto({
  file,
  alListo,
  alCerrar,
}: {
  file: File;
  alListo: (recortada: File) => void;
  alCerrar: () => void;
}) {
  const [foto, setFoto] = useState<Foto | null>(null);
  const [encuadre, setEncuadre] = useState<Encuadre | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const marco = useRef<HTMLDivElement>(null);
  const dedos = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    let vigente = true;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (!vigente) return;
      const medidas = { ancho: img.naturalWidth, alto: img.naturalHeight };
      const mal = problemaMedidas(medidas);
      if (mal) return setProblema(mal);
      const conAlfa = tieneTransparencia(img, file.type);
      setFoto({ ...medidas, img, conAlfa });
      setEncuadre(encuadreInicial(medidas, conAlfa));
    };
    // HEIC en Chrome, sobre todo: el navegador no sabe abrirla y no hay qué encuadrar.
    img.onerror = () => {
      if (vigente) setProblema('No pudimos abrir esta imagen. Prueba con una JPG o PNG.');
    };
    img.src = url;
    return () => {
      vigente = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  // A mano y no con onWheel: React lo registra pasivo y la página de detrás se movería también.
  useEffect(() => {
    const el = marco.current;
    if (!el || !foto) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      setEncuadre((a) => a && limitar(foto, { ...a, lado: a.lado * Math.exp(e.deltaY * 0.0015) }));
    };
    el.addEventListener('wheel', rueda, { passive: false });
    return () => el.removeEventListener('wheel', rueda);
  }, [foto]);

  function mover(ev: React.PointerEvent<HTMLDivElement>) {
    const antes = dedos.current.get(ev.pointerId);
    if (!antes || !foto || !marco.current) return;
    const puntos = Array.from(dedos.current.values());
    const anchoMarco = marco.current.getBoundingClientRect().width;
    const ahora = { x: ev.clientX, y: ev.clientY };
    dedos.current.set(ev.pointerId, ahora);

    if (puntos.length === 2) {
      // Pellizco: la distancia entre los dos dedos, antes y después de este movimiento.
      const otro = puntos[0] === antes ? puntos[1] : puntos[0];
      const distAntes = Math.hypot(antes.x - otro.x, antes.y - otro.y);
      const distAhora = Math.hypot(ahora.x - otro.x, ahora.y - otro.y);
      if (distAntes > 0 && distAhora > 0) setEncuadre((a) => a && limitar(foto, { ...a, lado: (a.lado * distAntes) / distAhora }));
    } else if (puntos.length === 1) {
      const dx = ahora.x - antes.x;
      const dy = ahora.y - antes.y;
      setEncuadre((a) => a && limitar(foto, { lado: a.lado, cx: a.cx - (dx * a.lado) / anchoMarco, cy: a.cy - (dy * a.lado) / anchoMarco }));
    }
  }

  function flecha(ev: React.KeyboardEvent) {
    const paso = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (!paso || !foto) return;
    ev.preventDefault();
    setEncuadre((a) => a && limitar(foto, { lado: a.lado, cx: a.cx + paso[0] * a.lado * 0.03, cy: a.cy + paso[1] * a.lado * 0.03 }));
  }

  async function usar() {
    if (!foto || !encuadre) return;
    setOcupado(true);
    try {
      alListo(await recortar(foto, encuadre));
    } catch (e) {
      setProblema(e instanceof Error ? e.message : 'Tu navegador no pudo preparar la imagen.');
      setOcupado(false);
    }
  }

  const noCuadrada = foto && foto.ancho !== foto.alto;
  const conHuecos = foto && encuadre && encuadre.lado > ladoLlenar(foto);

  return createPortal(
    <div
      className="modal-fondo"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div className="modal enc-modal" role="dialog" aria-modal="true" aria-label="Encuadra tu foto">
        <div className="modal__cab"><b>Encuadra tu foto</b></div>
        <div className="modal__cuerpo">
          {problema ? (
            <p role="alert">{problema}</p>
          ) : (
            <>
              <div
                ref={marco}
                className="enc-marco"
                role="group"
                tabIndex={0}
                aria-label="Foto a encuadrar. Muévela con las flechas."
                onKeyDown={flecha}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                }}
                onPointerMove={mover}
                onPointerUp={(e) => dedos.current.delete(e.pointerId)}
                onPointerCancel={(e) => dedos.current.delete(e.pointerId)}
              >
                {foto && encuadre && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={foto.img.src}
                    alt=""
                    draggable={false}
                    style={{
                      width: `${(foto.ancho / encuadre.lado) * 100}%`,
                      height: `${(foto.alto / encuadre.lado) * 100}%`,
                      left: `${((encuadre.lado / 2 - encuadre.cx) / encuadre.lado) * 100}%`,
                      top: `${((encuadre.lado / 2 - encuadre.cy) / encuadre.lado) * 100}%`,
                    }}
                  />
                )}
                <i className="enc-circulo" aria-hidden="true" />
              </div>
              <div className="enc-zoom">
                <ZoomOut size={16} aria-hidden="true" />
                <input
                  type="range"
                  aria-label="Acercar o alejar"
                  min={0}
                  max={1}
                  step={0.005}
                  disabled={!foto}
                  value={foto && encuadre ? zoomDeLado(foto, encuadre.lado) : 0}
                  onChange={(e) => {
                    if (!foto) return;
                    const lado = ladoDeZoom(foto, Number(e.target.value));
                    setEncuadre((a) => a && limitar(foto, { ...a, lado }));
                  }}
                />
                <ZoomIn size={16} aria-hidden="true" />
              </div>
              <p className="muted enc-ayuda">
                Arrastra para mover y acerca con la barra. Lo que queda dentro del círculo es lo que verán tus clientes.
                {noCuadrada && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="enc-entera"
                      onClick={() => foto && setEncuadre((a) => a && limitar(foto, { ...a, lado: conHuecos ? ladoLlenar(foto) : ladoEntera(foto) }))}
                    >
                      {conHuecos ? 'Llenar el círculo' : 'Ver entera'}
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
        <div className="modal__pie">
          <button type="button" className="btn btn-ghost" onClick={alCerrar} disabled={ocupado}>
            {problema ? 'Cerrar' : 'Cancelar'}
          </button>
          {!problema && (
            <button type="button" className="btn btn-primary" onClick={() => void usar()} disabled={!foto || ocupado}>
              {ocupado ? 'Preparando…' : 'Usar esta foto'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
