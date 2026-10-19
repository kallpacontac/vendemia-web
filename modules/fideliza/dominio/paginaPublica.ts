/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA PÁGINA PÚBLICA DE ENLACES · un solo HTML para el cliente y la vista previa
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La misma función pinta fideliza.vendemias.com/n/<negocio> (en el servidor)
 * y la vista previa del editor (en un iframe del panel). No hay dos versiones
 * que puedan desincronizarse: lo que el dueño ve es lo que verá su cliente.
 *
 * HTML y CSS planos y JavaScript mínimo solo para interacciones locales (como
 * copiar un número de Yape / Plin): abre al instante en un Android de gama
 * media con datos móviles. Todo texto pasa por esc(); los colores llegan
 * validados (#RRGGBB) y las imágenes solo si son https.
 */
import { icono } from './iconos';
import { colorValido, esOscuro, mezcla, resolverEstilo, tintaSobre, type Estilo } from './estilo';

export interface BotonPagina {
  tipo: string;
  label: string;
  url: string;
  subtitulo?: string;
  destacado?: boolean;
}

export interface DatosPagina {
  nombre: string;
  categoria?: string;
  bio?: string;
  logo?: string | null;
  color: string;
  estilo?: Partial<Estilo> | null;
  redes: { tipo: string; url: string }[];
  botones: BotonPagina[];
}

export const escHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const esc = escHtml;
const https = (u: string | null | undefined) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '');

/** Extrae únicamente el celular peruano de nuestras URL canónicas de pago. */
function numeroPagoMovil(url: string): string {
  const segura = https(url);
  if (!segura) return '';
  try {
    const u = new URL(segura);
    if (u.hostname !== 'fideliza.vendemias.com') return '';
    return u.pathname.match(/^\/pagar\/(9\d{8})\/?$/)?.[1] ?? '';
  } catch {
    return '';
  }
}

/**
 * Cloudinary conserva el original de 1000 px para Google Wallet, pero la
 * página pública no necesita descargarlo entero. Estas variantes quedan
 * cacheadas en su CDN y se sirven en WebP/AVIF cuando el navegador lo admite.
 * Las URL de otros proveedores se dejan intactas.
 */
export function imagenPagina(url: string | null | undefined, uso: 'avatar' | 'fondo'): string {
  const segura = https(url);
  if (!segura) return '';
  try {
    const u = new URL(segura);
    const marca = '/image/upload/';
    const i = u.pathname.indexOf(marca);
    if (u.hostname !== 'res.cloudinary.com' || i < 0) return segura;
    const transformacion = uso === 'avatar' ? 'c_limit,h_384,w_384/f_auto,q_auto:good' : 'c_limit,w_1200/f_auto,q_auto:good';
    u.pathname = `${u.pathname.slice(0, i + marca.length)}${transformacion}/${u.pathname.slice(i + marca.length)}`;
    return u.toString();
  } catch {
    return segura;
  }
}

const origenImagen = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/**
 * Instagram sí tiene una ruta web para abrir las historias activas de un
 * perfil. TikTok no expone una ruta web estable a la Story actual: allí se
 * abre el perfil y la app enseña el aro si hay una historia disponible.
 */
function urlHistoria(tipo: string, perfil: string): string {
  const segura = https(perfil);
  if (!segura) return '';
  if (tipo !== 'instagram' && tipo !== 'tiktok') return '';
  if (tipo === 'tiktok') return segura;
  try {
    const u = new URL(segura);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return '';
    const usuario = u.pathname.split('/').filter(Boolean)[0] ?? '';
    return /^[A-Za-z0-9._]+$/.test(usuario) ? `https://www.instagram.com/stories/${usuario}/` : '';
  } catch {
    return '';
  }
}

/** Variables de color de cada plantilla, a partir del color principal. */
function paleta(plantilla: string, acc: string, conFondo: boolean) {
  const accInk = tintaSobre(acc);
  const oscuro = mezcla(acc, '#000000', 0.55);
  switch (plantilla) {
    case 'oscura':
      return {
        bg: '#0B0C0D', ink: '#F4F4F2', muted: '#A3A3A0',
        card: 'rgba(255,255,255,.045)', borde: 'rgba(255,255,255,.10)',
        tile: mezcla(acc, '#0B0C0D', 0.78), tileInk: mezcla(acc, '#FFFFFF', 0.3),
        red: 'rgba(255,255,255,.06)', redInk: '#F4F4F2', anillo: acc,
      };
    case 'vidrio':
      return {
        bg: conFondo ? '#1b1b1f' : `linear-gradient(160deg, ${mezcla(acc, '#FFFFFF', 0.82)}, #E7E8EE 55%, ${mezcla(acc, '#FFFFFF', 0.9)})`,
        ink: '#14110F', muted: '#4A4A4A',
        card: 'rgba(255,255,255,.42)', borde: 'rgba(255,255,255,.75)',
        tile: 'rgba(255,255,255,.6)', tileInk: '#14110F',
        red: '#1D1D1F', redInk: '#FFFFFF', anillo: acc,
      };
    case 'foto':
      return {
        bg: `linear-gradient(170deg, ${mezcla(acc, '#000', 0.2)}, ${oscuro})`, ink: '#FFFFFF', muted: 'rgba(255,255,255,.85)',
        card: 'rgba(255,255,255,.82)', borde: 'rgba(255,255,255,.9)',
        tile: 'transparent', tileInk: oscuro, btnInk: oscuro,
        red: 'transparent', redInk: '#FFFFFF', anillo: '#FFFFFF',
      };
    case 'marco':
      return {
        bg: `linear-gradient(165deg, ${acc}, ${oscuro})`, ink: '#FFFFFF', muted: 'rgba(255,255,255,.85)',
        card: 'rgba(0,0,0,.42)', borde: 'rgba(255,255,255,.12)',
        tile: 'transparent', tileInk: '#FFFFFF', btnInk: '#FFFFFF',
        red: 'transparent', redInk: '#FFFFFF', anillo: '#FFFFFF',
      };
    case 'color':
      return {
        bg: acc, ink: accInk, muted: accInk === '#FFFFFF' ? 'rgba(255,255,255,.85)' : 'rgba(20,17,15,.75)',
        card: accInk === '#FFFFFF' ? '#FFFFFF' : '#14110F', borde: 'transparent',
        tile: 'transparent', tileInk: acc, btnInk: accInk === '#FFFFFF' ? '#14110F' : '#FFFFFF',
        red: accInk === '#FFFFFF' ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.08)', redInk: accInk, anillo: accInk,
      };
    default: // clásica
      return {
        bg: '#F5F4F0', ink: '#14110F', muted: '#5C5C5C',
        card: '#FFFFFF', borde: '#E7E5DF',
        tile: mezcla(acc, '#FFFFFF', 0.86), tileInk: esOscuro(acc) ? acc : mezcla(acc, '#000000', 0.35),
        red: '#FFFFFF', redInk: '#14110F', anillo: acc,
      };
  }
}

export function htmlPagina(d: DatosPagina, o: { vista?: boolean; indexable?: boolean; titulo?: string } = {}): string {
  const acc = colorValido(d.color);
  const e = resolverEstilo(d.estilo);
  const fondo = imagenPagina(e.fondo, 'fondo');
  const logo = imagenPagina(d.logo, 'avatar');
  const p = paleta(e.plantilla, acc, Boolean(fondo));
  const tarjeta = e.plantilla === 'clasica' || e.plantilla === 'oscura';
  const radio = e.forma === 'pildora' ? '999px' : e.forma === 'recto' ? '6px' : '16px';
  const oscuroFondo = ['oscura', 'foto', 'marco'].includes(e.plantilla) || (e.plantilla === 'color' && tintaSobre(acc) === '#FFFFFF');

  // Estilo de botón elegido en «avanzado», encima del de la plantilla.
  let btnBg = p.card;
  let btnBorde = p.borde;
  let btnInk = (p as { btnInk?: string }).btnInk ?? p.ink;
  let btnBlur = '';
  if (e.botones === 'contorno') {
    btnBg = 'transparent';
    btnBorde = p.ink;
    btnInk = p.ink;
  } else if (e.botones === 'vidrio') {
    btnBg = oscuroFondo ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.45)';
    btnBorde = oscuroFondo ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.8)';
    btnInk = oscuroFondo ? '#FFFFFF' : '#14110F';
    btnBlur = 'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);';
  }

  const fondoPagina =
    (e.plantilla === 'foto' || e.plantilla === 'marco') && fondo
      ? `linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.6)),url("${esc(fondo)}") center/cover fixed`
      : e.plantilla === 'vidrio' && fondo
        ? 'transparent'
        : e.plantilla === 'oscura'
          ? `radial-gradient(120% 60% at 50% 0%, ${mezcla(acc, '#0B0C0D', 0.7)}, #0B0C0D 70%)`
          : p.bg;
  const portada =
    e.plantilla === 'clasica' || e.plantilla === 'oscura' || (e.plantilla === 'vidrio' && fondo)
      ? fondo
        ? `url("${esc(fondo)}") center/cover`
        : e.plantilla === 'clasica'
          ? `linear-gradient(135deg, ${acc}, ${mezcla(acc, '#000000', 0.25)})`
          : ''
      : '';
  // Vidrio con foto: la misma foto, desenfocada y aclarada, de fondo (el texto oscuro se lee).
  const fondoVidrio =
    e.plantilla === 'vidrio' && fondo
      ? `body::before{content:"";position:fixed;inset:-30px;z-index:-2;background:url("${esc(fondo)}") center/cover;filter:blur(22px) saturate(1.15)}body::after{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(244,244,250,.72))}`
      : '';
  // El destacado en «Color» no puede ser del mismo color que el fondo.
  const destBg = e.plantilla === 'color' ? (tintaSobre(acc) === '#FFFFFF' ? '#14110F' : '#FFFFFF') : acc;
  const sinAvatar = e.plantilla === 'foto' && Boolean(fondo);
  const inicial = esc((d.nombre || '?').trim().slice(0, 1).toUpperCase());
  const redHistoria = e.historia ? d.redes.find((r) => r.tipo === e.historia) : undefined;
  const historiaUrl = redHistoria && e.historia ? urlHistoria(e.historia, redHistoria.url) : '';
  const contenidoAvatar = logo
    ? `<img src="${esc(logo)}" alt="" width="104" height="104" loading="eager" decoding="async" fetchpriority="high">`
    : `<span class="av-inicial">${inicial}</span>`;
  const claseAvatar = `av${e.plantilla === 'marco' ? ' av--marco' : ''}${historiaUrl ? ` av--historia av--${e.historia}` : ''}`;

  const avatar = sinAvatar
    ? ''
    : historiaUrl && e.historia
      ? `<a class="${claseAvatar}" href="${esc(historiaUrl)}" rel="noopener" aria-label="${e.historia === 'instagram' ? 'Ver historias de Instagram' : 'Abrir TikTok'}">${contenidoAvatar}<i class="story-badge" aria-hidden="true">${icono(e.historia)}</i></a>`
      : `<div class="${claseAvatar}">${contenidoAvatar}</div>`;

  const redes = d.redes.length
    ? `<nav class="redes" aria-label="Redes sociales">${d.redes
        .map((r) => `<a href="${esc(r.url)}" rel="noopener" aria-label="${esc(r.tipo)}">${icono(r.tipo)}</a>`)
        .join('')}</nav>`
    : '';

  const botones = d.botones
    .map((b) => {
      const sub = b.subtitulo ? `<small>${esc(b.subtitulo)}</small>` : '';
      const cls = `bt${b.destacado ? ' bt--dest' : ''}`;
      const contenido = tarjeta
        ? `<span class="tile">${icono(b.tipo)}</span><span class="tx"><b>${esc(b.label)}</b>${sub}</span><span class="fl">${icono('flecha')}</span>`
        : `<span class="ic">${icono(b.tipo)}</span><span class="tx"><b>${esc(b.label)}</b>${sub}</span>`;
      const numero = b.tipo === 'yape' ? numeroPagoMovil(b.url) : '';
      if (numero) {
        return `<button type="button" class="${cls} ${tarjeta ? 'bt--tarjeta' : 'bt--pildora'} pago-abrir" data-numero="${numero}" aria-haspopup="dialog">${contenido}</button>`;
      }
      return `<a class="${cls} ${tarjeta ? 'bt--tarjeta' : 'bt--pildora'}" href="${esc(b.url)}" rel="noopener">${contenido}</a>`;
    })
    .join('');

  const tienePagoMovil = d.botones.some((b) => b.tipo === 'yape' && Boolean(numeroPagoMovil(b.url)));
  const modalRadio = e.forma === 'recto' ? '12px' : '24px';
  const modalPago = tienePagoMovil
    ? `<dialog class="pago-modal" id="pago-modal" aria-labelledby="pago-titulo">
  <div class="pago-modal__cab"><span class="pago-modal__icon" aria-hidden="true">${icono('yape')}</span><button type="button" class="pago-cerrar" aria-label="Cerrar">&times;</button></div>
  <p class="pago-modal__etiqueta">Yape / Plin</p>
  <h2 id="pago-titulo">Paga por número</h2>
  <p class="pago-modal__ayuda">Copia el celular y pégalo en Yape o Plin.</p>
  <output class="pago-numero" id="pago-numero" aria-live="polite"></output>
  <button type="button" class="pago-copiar" id="pago-copiar">Copiar número</button>
  <p class="pago-estado" id="pago-estado" aria-live="polite">Antes de pagar, verifica el nombre del negocio en tu app.</p>
</dialog>`
    : '';
  const scriptPago =
    tienePagoMovil && !o.vista
      ? `<script>
(function(){
  var modal=document.getElementById('pago-modal');
  var numero=document.getElementById('pago-numero');
  var copiar=document.getElementById('pago-copiar');
  var estado=document.getElementById('pago-estado');
  if(!modal||!numero||!copiar||!estado||typeof modal.showModal!=='function')return;
  document.querySelectorAll('.pago-abrir').forEach(function(abrir){
    abrir.addEventListener('click',function(){
      var raw=abrir.getAttribute('data-numero')||'';
      numero.textContent=raw.replace(/(\d{3})(\d{3})(\d{3})/,'$1 $2 $3');
      numero.setAttribute('data-raw',raw);
      copiar.textContent='Copiar número';
      estado.textContent='Antes de pagar, verifica el nombre del negocio en tu app.';
      modal.showModal();
    });
  });
  modal.querySelector('.pago-cerrar').addEventListener('click',function(){modal.close();});
  modal.addEventListener('click',function(evento){if(evento.target===modal)modal.close();});
  function copiado(){copiar.textContent='Número copiado';estado.textContent='Listo. Abre Yape o Plin y pega el número.';}
  function respaldo(raw){
    var campo=document.createElement('textarea');campo.value=raw;campo.setAttribute('readonly','');campo.style.position='fixed';campo.style.opacity='0';document.body.appendChild(campo);campo.select();
    try{document.execCommand('copy');copiado();}catch(error){estado.textContent='Mantén presionado el número para copiarlo.';}
    document.body.removeChild(campo);
  }
  copiar.addEventListener('click',function(){
    var raw=numero.getAttribute('data-raw')||'';if(!raw)return;
    if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(raw).then(copiado).catch(function(){respaldo(raw);});}else{respaldo(raw);}
  });
})();
</script>`
      : '';

  const titulo = esc(o.titulo || d.nombre || 'Mi página');
  const serif = e.plantilla === 'foto' || e.plantilla === 'marco';
  const imagenPrioritaria = sinAvatar ? fondo : logo || fondo;
  const origenesImagen = [...new Set([logo, fondo].map(origenImagen).filter(Boolean))];
  const conexionesImagen = origenesImagen.map((origen) => `<link rel="preconnect" href="${esc(origen)}"><link rel="dns-prefetch" href="${esc(origen)}">`).join('');
  const precargaImagen = imagenPrioritaria ? `<link rel="preload" as="image" href="${esc(imagenPrioritaria)}" fetchpriority="high">` : '';

  return `<!doctype html><html lang="es-PE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${titulo}</title>${o.indexable ? '' : '<meta name="robots" content="noindex,nofollow">'}<meta name="theme-color" content="${acc}">${conexionesImagen}${precargaImagen}
<style>
*{box-sizing:border-box;margin:0}
html{background:${fondoPagina.includes('url(') ? '#111' : p.bg.startsWith('linear') ? '#eee' : p.bg}}
body{min-height:100vh;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:${p.ink};background:${fondoPagina};-webkit-font-smoothing:antialiased}
.pg{max-width:480px;margin:0 auto;padding:0 18px 28px;min-height:100vh;display:flex;flex-direction:column}
.portada{height:${portada ? '150px' : '40px'};margin:0 -18px;background:${portada || 'transparent'};${e.plantilla === 'oscura' && fondo ? 'opacity:.55;' : ''}}
.cab{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;margin-top:${portada ? '-56px' : sinAvatar ? '38vh' : '22px'}}
.av{width:112px;height:112px;border-radius:50%;padding:4px;background:${p.anillo};box-shadow:0 8px 28px rgba(0,0,0,.18);display:block;position:relative;color:inherit;text-decoration:none}
.av>img,.av>.av-inicial{width:100%;height:100%;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:#fff;border:3px solid ${e.plantilla === 'oscura' ? '#0B0C0D' : '#fff'};font:800 40px system-ui;color:#14110F}
.av--marco{border-radius:4px;padding:6px;background:#fff;width:132px;height:150px}
.av--marco>img,.av--marco>.av-inicial{border-radius:2px;border:0}
.av--historia{padding:5px;transition:transform .15s}
.av--historia:active{transform:scale(.96)}
.av--instagram{background:linear-gradient(135deg,#FEDA75,#FA7E1E 30%,#D62976 62%,#4F5BD5)}
.av--tiktok{background:linear-gradient(135deg,#25F4EE 0 33%,#111 33% 66%,#FE2C55 66%)}
.story-badge{position:absolute;right:-4px;bottom:3px;width:31px;height:31px;border-radius:50%;display:grid;place-items:center;background:#111;color:#fff;border:3px solid #fff;box-shadow:0 3px 9px rgba(0,0,0,.24)}
.story-badge svg{width:16px;height:16px}
h1{font-size:${serif ? '28px' : '24px'};font-weight:${serif ? '500' : '800'};margin-top:6px;${serif ? 'font-family:Georgia,"Times New Roman",serif;text-transform:uppercase;letter-spacing:.08em;' : ''}${sinAvatar ? 'text-shadow:0 2px 12px rgba(0,0,0,.45);' : ''}}
.cat{font-size:14px;font-weight:600;color:${e.plantilla === 'oscura' ? mezcla(acc, '#FFFFFF', 0.25) : p.muted}}
.bio{font-size:14px;color:${p.muted};max-width:340px}
.redes{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:12px 0 4px}
.redes a{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:${p.red};color:${p.redInk};${p.red === 'transparent' ? `border:1.5px solid ${p.redInk};` : e.plantilla === 'clasica' ? `border:1px solid ${p.borde};` : ''}transition:transform .15s}
.redes a:active{transform:scale(.94)}
.redes svg{width:21px;height:21px}
.lista{display:flex;flex-direction:column;gap:12px;margin-top:18px}
.bt{display:flex;width:100%;align-items:center;gap:12px;text-align:left;font:inherit;cursor:pointer;text-decoration:none;color:${btnInk};background:${btnBg};border:1.5px solid ${btnBorde};border-radius:${radio};min-height:58px;padding:10px 14px;${btnBlur}box-shadow:${e.plantilla === 'vidrio' ? '0 6px 18px rgba(20,20,40,.10),inset 0 1px 0 rgba(255,255,255,.7)' : tarjeta && e.plantilla === 'clasica' ? '0 2px 10px rgba(10,10,10,.04)' : 'none'};transition:transform .12s}
.bt:active{transform:scale(.985)}
.bt svg{width:22px;height:22px;flex-shrink:0}
.bt .tx{flex:1;display:flex;flex-direction:column;min-width:0}
.bt b{font-size:15.5px;font-weight:700}
.bt small{font-size:12.5px;opacity:.75;margin-top:1px}
.bt--tarjeta .tile{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:${p.tile};color:${p.tileInk};flex-shrink:0}
.bt--tarjeta .fl{opacity:.5;display:flex}
.bt--tarjeta .fl svg{width:18px;height:18px}
.bt--pildora{justify-content:center;text-align:center}
.bt--pildora .ic{display:flex;position:absolute;left:18px;opacity:.85}
.bt--pildora{position:relative;padding:12px 48px}
.bt--pildora b{${serif ? 'text-transform:uppercase;letter-spacing:.12em;font-size:13.5px;font-weight:600;' : ''}}
.bt--dest{background:${destBg};color:${tintaSobre(destBg)};border-color:${destBg}}
.bt--dest .tile{background:rgba(255,255,255,.2);color:${tintaSobre(destBg)}}
.pago-modal{width:min(420px,calc(100% - 32px));padding:24px;border:1.5px solid #E7E3DD;border-radius:${modalRadio};background:#FFFFFF;color:#14110F;box-shadow:0 24px 70px rgba(0,0,0,.32);font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.pago-modal::backdrop{background:rgba(10,10,10,.56);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.pago-modal[open]{animation:pago-entra .18s ease-out}
@keyframes pago-entra{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
.pago-modal__cab{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.pago-modal__icon{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;background:#FFF0EA;color:#C83D1F}
.pago-modal__icon svg{width:25px;height:25px}
.pago-cerrar{width:40px;height:40px;border:1px solid #E7E3DD;border-radius:50%;display:grid;place-items:center;background:#FFFFFF;color:#14110F;font:400 28px/1 system-ui;cursor:pointer}
.pago-modal__etiqueta{color:#C83D1F;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.pago-modal h2{font-size:25px;line-height:1.15;margin-top:3px}
.pago-modal__ayuda{color:#66625E;margin-top:7px}
.pago-numero{display:block;margin:20px 0 12px;padding:16px;text-align:center;border:1.5px solid #E7E3DD;border-radius:${e.forma === 'recto' ? '8px' : '16px'};font-size:29px;font-weight:800;letter-spacing:.055em;color:#14110F;background:#FAF8F4;user-select:all}
.pago-copiar{width:100%;min-height:52px;border:0;border-radius:${radio};background:#F2552C;color:#14110F;font:700 16px system-ui;cursor:pointer}
.pago-estado{min-height:34px;margin-top:12px;text-align:center;color:#66625E;font-size:12.5px}
.pago-cerrar:focus-visible,.pago-copiar:focus-visible,.pago-abrir:focus-visible{outline:3px solid #C83D1F;outline-offset:3px}
@media(max-width:520px){.pago-modal{width:calc(100% - 24px);margin:auto auto 12px;padding:22px}.pago-modal h2{font-size:23px}.pago-numero{font-size:27px}}
${fondoVidrio}
.pie{margin-top:auto;padding-top:28px;text-align:center;font-size:11.5px;color:${p.muted};opacity:.8;text-decoration:none}
.pie:hover{opacity:1;text-decoration:underline}
.vacio{text-align:center;color:${p.muted};font-size:14px;margin-top:20px}
a:focus-visible{outline:3px solid ${p.ink};outline-offset:2px}
${o.vista ? 'a{pointer-events:none}.pago-abrir{pointer-events:none}' : ''}
</style></head><body><main class="pg">
<div class="portada"></div>
<header class="cab">${avatar}<h1>${esc(d.nombre || 'Tu negocio')}</h1>${e.categoria ? `<p class="cat">${esc(e.categoria)}</p>` : ''}${d.bio ? `<p class="bio">${esc(d.bio)}</p>` : ''}${e.redes === 'arriba' ? redes : ''}</header>
<section class="lista">${botones || (o.vista ? '<p class="vacio">Aquí aparecerán tus botones</p>' : '')}</section>
${e.redes === 'abajo' ? redes : ''}
<a class="pie" href="https://vendemias.com" rel="noopener" aria-label="Visitar Vendemia">Creado con Vendemia</a>
</main>${modalPago}${scriptPago}</body></html>`;
}
