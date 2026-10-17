/**
 * Página intermedia para pagos por número. Yape y Plin no ofrecen una URL
 * universal de pago personal: el cliente copia el celular y lo pega en su app.
 */
import { esc, pagina } from '@/modules/fideliza/servidor/html';

const iconoPago = `<svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M9 8h5a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h5M12 6v2M12 16v2M9 19h6"/></svg>`;

export async function GET(_req: Request, { params }: { params: { numero: string } }) {
  const numero = params.numero;
  if (!/^9\d{8}$/.test(numero)) {
    return pagina({
      titulo: 'Número no disponible',
      status: 404,
      cuerpo: '<div class="caja"><p class="premio">Este número no está disponible.</p></div>',
    });
  }
  const visible = `${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6)}`;
  const seguro = esc(numero);
  return pagina({
    titulo: 'Paga con Yape o Plin',
    cuerpo: `<div class="caja" style="text-align:center">
      <div style="width:72px;height:72px;border-radius:22px;background:#F1ECFF;color:#6336B6;display:grid;place-items:center;margin:0 auto 14px">${iconoPago}</div>
      <p class="premio">Yape / Plin</p>
      <p class="nota">Copia el celular y pégalo en Yape o Plin.</p>
      <p id="numero" style="font-size:30px;font-weight:800;letter-spacing:.04em;margin:20px 0 6px">${esc(visible)}</p>
      <button id="copiar" class="btn prim" type="button" data-numero="${seguro}">Copiar número</button>
      <p id="estado" class="nota" role="status" aria-live="polite">Antes de pagar, verifica el nombre del destinatario en tu app.</p>
    </div>
    <script>
      const boton=document.getElementById('copiar');
      boton.addEventListener('click',async()=>{
        const numero=boton.dataset.numero;
        try{await navigator.clipboard.writeText(numero)}catch(e){
          const campo=document.createElement('textarea');campo.value=numero;campo.style.position='fixed';campo.style.opacity='0';document.body.appendChild(campo);campo.select();document.execCommand('copy');campo.remove();
        }
        boton.textContent='Número copiado';document.getElementById('estado').textContent='Listo. Abre Yape o Plin y pega el número.';
      });
    </script>`,
  });
}
