'use client';

/**
 * «Tu portafolio» en Mi página de Fideliza: los trabajos que se abren en su
 * sitio en la página de enlaces (dominio/portafolio.ts). Foto, nombre, una
 * etiqueta y a dónde lleva; se ordenan con las flechas, como los botones.
 */
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { subirImagenMarca } from '@/modules/fideliza/cliente/imagenMarca';
import { mensaje } from '@/modules/fideliza/cliente/api';
import { MAX_TRABAJOS, TITULO_PORTAFOLIO, type Portafolio, type TrabajoPortafolio } from '@/modules/fideliza/dominio/portafolio';
import { imagenPagina } from '@/modules/fideliza/dominio/paginaPublica';
import type { useValidacion } from '@/modules/fideliza/ui/Validacion';

interface Props {
  valor: Portafolio | undefined;
  alCambiar: (p: Portafolio) => void;
  editable: boolean;
  companyId: string | null;
  v: ReturnType<typeof useValidacion>;
}

export default function EditorPortafolio({ valor, alCambiar, editable, companyId, v }: Props) {
  const p: Portafolio = valor ?? { trabajos: [] };
  const trabajos = p.trabajos ?? [];
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const [fallo, setFallo] = useState('');
  const archivo = useRef<HTMLInputElement>(null);
  const destino = useRef(0);

  const poner = (c: Partial<Portafolio>) => alCambiar({ ...p, trabajos, ...c });
  const cambiar = (i: number, c: Partial<TrabajoPortafolio>) => poner({ trabajos: trabajos.map((t, j) => (j === i ? { ...t, ...c } : t)) });
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= trabajos.length) return;
    const c = [...trabajos];
    [c[i], c[j]] = [c[j], c[i]];
    poner({ trabajos: c });
  };

  async function subir(file: File) {
    if (!companyId) return;
    const i = destino.current;
    setFallo('');
    setSubiendo(i);
    try {
      cambiar(i, { imagen: await subirImagenMarca(file, companyId, 'catalog') });
    } catch (e) {
      setFallo(mensaje(e));
    } finally {
      setSubiendo(null);
      if (archivo.current) archivo.current.value = '';
    }
  }

  return (
    <section className="card" id="tu-portafolio">
      <h3 className="fz-sec">6 · Tu portafolio</h3>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 10 }}>
        Tus trabajos con foto. En tu página sale como un botón más y, al tocarlo, se abren en una ventana. Para cambiarlo de lugar, usa sus flechas en «5 · Tus botones».
      </p>
      {trabajos.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <label className="field-label">Texto del botón</label>
          <input className="input" maxLength={40} value={p.titulo ?? ''} disabled={!editable} placeholder={TITULO_PORTAFOLIO} onChange={(ev) => poner({ titulo: ev.target.value })} />
        </div>
      )}
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (f) void subir(f);
        }}
      />
      {trabajos.map((t, i) => {
        const foto = imagenPagina(t.imagen, 'trabajo');
        return (
          <div key={i} className="fz-boton">
            <div className="fz-fila" style={{ justifyContent: 'space-between' }}>
              <b style={{ fontSize: 13 }}>Trabajo {i + 1}</b>
              {editable && (
                <span className="fz-fila" style={{ gap: 4 }}>
                  <button className="icon-btn" aria-label="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>
                    <ArrowUp size={15} />
                  </button>
                  <button className="icon-btn" aria-label="Bajar" onClick={() => mover(i, 1)} disabled={i === trabajos.length - 1}>
                    <ArrowDown size={15} />
                  </button>
                  <button className="icon-btn" aria-label="Quitar" onClick={() => poner({ trabajos: trabajos.filter((_, j) => j !== i) })}>
                    <Trash2 size={15} />
                  </button>
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0,1fr)', gap: 12, marginTop: 8, alignItems: 'start' }}>
              <button
                type="button"
                className="fz-trabajo-foto"
                disabled={!editable || subiendo !== null}
                onClick={() => {
                  destino.current = i;
                  archivo.current?.click();
                }}
                aria-label={t.imagen ? 'Cambiar foto' : 'Subir foto'}
                style={{
                  width: 84,
                  aspectRatio: '4 / 5',
                  borderRadius: 12,
                  border: '1.5px dashed var(--line, #DEDED9)',
                  background: foto ? `center / cover no-repeat url("${foto}")` : 'var(--surface-2, #F5F3EE)',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: editable ? 'pointer' : 'default',
                  color: 'inherit',
                }}
              >
                {subiendo === i ? <span className="spin" /> : !foto && <ImagePlus size={20} />}
              </button>
              <div style={{ display: 'grid', gap: 8 }}>
                <div>
                  <label className="field-label" htmlFor={`pf-${i}-titulo`}>Nombre</label>
                  <input {...v.campo(`pf-${i}-titulo`)} className="input" maxLength={40} value={t.titulo} disabled={!editable} placeholder="The 24/7 Barber Shop" onChange={(ev) => cambiar(i, { titulo: ev.target.value })} />
                  {v.error(`pf-${i}-titulo`)}
                </div>
                <div>
                  <label className="field-label">Etiqueta (opcional)</label>
                  <input className="input" maxLength={40} value={t.etiqueta ?? ''} disabled={!editable} placeholder="Barbería · Iquitos" onChange={(ev) => cambiar(i, { etiqueta: ev.target.value })} />
                </div>
                <div>
                  <label className="field-label">Enlace (opcional)</label>
                  <input {...v.campo(`pf-${i}-url`)} className="input" inputMode="url" value={t.url ?? ''} disabled={!editable} placeholder="agenda.vendemias.com/su-negocio" onChange={(ev) => cambiar(i, { url: ev.target.value.trim() })} />
                  {v.error(`pf-${i}-url`)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {fallo && <p className="fz-error" role="alert">{fallo}</p>}
      {editable && trabajos.length < MAX_TRABAJOS && (
        <button className="btn btn-ghost" onClick={() => poner({ trabajos: [...trabajos, { titulo: '', etiqueta: '', url: '', imagen: '' }] })}>
          <Plus size={16} /> Añadir trabajo
        </button>
      )}
    </section>
  );
}
