/**
 * ══════════════════════════════════════════════════════════════════════════
 * TARJETAS QUE SE ABREN EN SU SITIO · portafolio y agenda en la página de enlaces
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Como el Linktree con Calendly del video que trajo Alvaro (16-nov-2026): al
 * tocar un botón, ESE botón crece y se convierte en lo que abre (los trabajos,
 * o la ficha de la reunión → calendario → horas → datos → listo). Nada salta a
 * otra página y nada aparece de la nada: el alto se anima de un estado al otro
 * (los botones de abajo se apartan con él) y lo nuevo entra escalonado.
 *
 *   · `.xp` es el contenedor; `.xp__bt` el botón de siempre; `.xp__cuerpo` lo que
 *     se abre. El portafolio va en <details>: sin JavaScript se abre igual.
 *     La agenda va en un <a> a la agenda completa: sin JavaScript, o si la
 *     reserva pide algo que aquí no se pregunta (sedes, adelanto), navega.
 *   · Una sola abierta a la vez. «Reducir movimiento» del sistema: sin animación.
 *   · Todo texto que llega del servidor entra con textContent, nunca como HTML.
 *
 * Sin dependencias ni bundle (la página es HTML plano, ver paginaPublica.ts).
 */

export interface ColoresExpandir {
  acc: string;
  accInk: string;
  /** Superficie de lo que se abre y su tinta. */
  bg: string;
  ink: string;
  muted: string;
  linea: string;
  suave: string;
  /** Radio del contenedor abierto. */
  radio: string;
}

export function cssExpandir(c: ColoresExpandir, conEntrada: boolean): string {
  const entrada = conEntrada
    ? `@media (prefers-reduced-motion:no-preference){
.cab,.redes,.lista>*{animation:xp-sube .6s cubic-bezier(.2,.8,.2,1) both}
.redes{animation-delay:.08s}
${Array.from({ length: 14 }, (_, i) => `.lista>:nth-child(${i + 1}){animation-delay:${(0.12 + i * 0.05).toFixed(2)}s}`).join('')}
}
@keyframes xp-sube{from{opacity:0;transform:translateY(14px)}}`
    : '';
  const vars = `--xp-acc:${c.acc};--xp-acc-ink:${c.accInk};--xp-bg:${c.bg};--xp-ink:${c.ink};--xp-muted:${c.muted};--xp-linea:${c.linea};--xp-suave:${c.suave}`;
  return `${entrada}
.xp{${vars};border-radius:${c.radio};position:relative}
.xp>summary{list-style:none}.xp>summary::-webkit-details-marker{width:0;height:0;font-size:0}
.xp__bt .fl svg{transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.xp.abierto,.xp[open]{box-shadow:0 22px 50px rgba(10,10,10,.16)}
.xp.abierto>.xp__bt,.xp[open]>.xp__bt{border-radius:${c.radio} ${c.radio} 0 0}
.xp.abierto>.xp__bt .fl svg,.xp[open]>.xp__bt .fl svg{transform:rotate(90deg)}
.xp__cuerpo{background:var(--xp-bg);color:var(--xp-ink);border-radius:0 0 ${c.radio} ${c.radio};padding:16px 16px 18px;font-size:14.5px}
.xp-cargando{display:grid;gap:10px}
.xp-cargando i{display:block;height:14px;border-radius:7px;background:linear-gradient(90deg,var(--xp-suave),var(--xp-linea),var(--xp-suave));background-size:200% 100%;animation:xp-brillo 1.2s linear infinite}
.xp-cargando i:nth-child(1){height:120px;border-radius:14px}.xp-cargando i:nth-child(3){width:60%}
@keyframes xp-brillo{to{background-position:-200% 0}}
/* Portafolio: rejilla de 2 columnas. Con JavaScript se abre en una ventana encima
   de la página (.pf-modal); sin él, o en la vista previa del panel, en su sitio. */
.pf{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.pf__it{position:relative;display:block;aspect-ratio:4/5;border-radius:14px;overflow:hidden;color:#fff;text-decoration:none;background:linear-gradient(150deg,${c.acc},#14110F);isolation:isolate}
.pf-modal{${vars};width:min(520px,calc(100% - 32px));max-height:88vh;max-height:88dvh;padding:0;border:0;border-radius:${c.radio};background:var(--xp-bg);color:var(--xp-ink);box-shadow:0 24px 70px rgba(0,0,0,.32);font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}
.pf-modal[open]{display:flex;flex-direction:column}
.pf-modal::backdrop{background:rgba(10,10,10,.56);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
@media (prefers-reduced-motion:no-preference){.pf-modal[open]{animation:pf-entra .28s cubic-bezier(.2,.8,.2,1)}}
@keyframes pf-entra{from{opacity:0;transform:translateY(18px) scale(.98)}}
.pf-modal__cab{display:flex;align-items:center;gap:12px;padding:16px 16px 12px}
.pf-modal__cab div{flex:1;min-width:0}
.pf-modal__cab h2{font-size:18px;line-height:1.2}
.pf-modal__cab small{color:var(--xp-muted);font-size:13px}
.pf-modal__x{width:38px;height:38px;flex:none;border:1px solid var(--xp-linea);border-radius:50%;display:grid;place-items:center;background:transparent;color:inherit;font:400 26px/1 system-ui;cursor:pointer}
.pf-modal__x:focus-visible,.pf-modal .pf__it:focus-visible{outline:3px solid var(--xp-acc);outline-offset:2px}
.pf-modal .pf{padding:0 16px 16px;overflow-y:auto;overscroll-behavior:contain}
html:has(.pf-modal[open]){overflow:hidden}
@media(max-width:520px){.pf-modal{width:calc(100% - 24px);margin:auto auto 12px}}
.pf__it img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;transition:transform .7s cubic-bezier(.2,.8,.2,1)}
.pf__it::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.55) 62%,rgba(0,0,0,.9))}
.pf__it:active img{transform:scale(1.04)}
@media(hover:hover){.pf__it:hover img{transform:scale(1.05)}}
.pf__ini{position:absolute;inset:0;display:grid;place-items:center;font:800 64px/1 system-ui;opacity:.35;z-index:-1}
.pf__tx{position:absolute;left:11px;right:11px;bottom:10px}
.pf__tx b{display:block;font-size:14.5px;line-height:1.2}
.pf__tx small{display:block;margin-top:2px;font-size:12px;opacity:.85}
.pf__ir{position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.92);color:#14110F}
.pf__ir svg{width:14px;height:14px}
/* Agenda */
.ag-ficha{display:grid;gap:8px}
.ag-cabeza{display:flex;align-items:center;gap:12px}
.ag-cabeza>div{flex:1;min-width:0;display:grid;gap:6px}
.ag-foto{width:60px;height:60px;flex:none;object-fit:cover;border-radius:16px;display:block;background:var(--xp-suave);border:1px solid var(--xp-linea)}
.ag-ficha h3{font-size:17px;line-height:1.2}
.ag-chips{display:flex;flex-wrap:wrap;gap:6px}
.ag-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:var(--xp-suave);font-size:12.5px;font-weight:600}
.ag-chip--acc{background:var(--xp-acc);color:var(--xp-acc-ink)}
.ag-desc{color:var(--xp-muted);font-size:13.5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ag-sep{height:1px;background:var(--xp-linea);margin:14px 0}
.ag-titulo{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.ag-titulo b{font-size:15px;text-transform:capitalize}
.ag-nav{display:flex;gap:6px}
.ag-nav button,.ag-volver{border:1px solid var(--xp-linea);background:transparent;color:inherit;border-radius:999px;cursor:pointer;font:600 13px system-ui}
.ag-nav button{width:34px;height:34px;display:grid;place-items:center;font-size:18px;line-height:1}
.ag-nav button:disabled{opacity:.3;cursor:default}
.ag-mes{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
.ag-mes span{font-size:11px;font-weight:700;color:var(--xp-muted);padding:4px 0;text-transform:uppercase}
.ag-dia{aspect-ratio:1;max-height:44px;width:100%;border:0;border-radius:50%;background:transparent;color:inherit;font:600 14px system-ui;cursor:pointer;position:relative;transition:background .2s,color .2s,transform .15s}
.ag-dia:disabled{color:var(--xp-muted);opacity:.4;cursor:default;font-weight:400}
.ag-dia:not(:disabled)::after{content:"";position:absolute;left:50%;bottom:5px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--xp-acc)}
.ag-dia:not(:disabled):active{transform:scale(.92)}
.ag-dia[aria-pressed="true"]{background:var(--xp-acc);color:var(--xp-acc-ink)}
.ag-dia[aria-pressed="true"]::after{background:var(--xp-acc-ink)}
.ag-fecha{margin:12px 0 8px;font-weight:700;font-size:14px}
.ag-fecha::first-letter{text-transform:uppercase}
.ag-horas{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px}
.ag-hora{min-height:42px;border:1.5px solid var(--xp-linea);border-radius:12px;background:transparent;color:inherit;font:700 14px system-ui;cursor:pointer;transition:border-color .2s,background .2s,transform .15s}
.ag-hora:active{transform:scale(.96)}
.ag-hora:hover{border-color:var(--xp-acc)}
.ag-resumen{display:flex;align-items:center;gap:10px;padding:12px;border-radius:14px;background:var(--xp-suave)}
.ag-resumen div{flex:1;min-width:0}
.ag-resumen b{display:block;font-size:14.5px}
.ag-resumen b::first-letter{text-transform:uppercase}
.ag-resumen small{color:var(--xp-muted)}
.ag-volver{padding:7px 12px;flex:none}
.ag-campo{display:block;margin-top:12px}
.ag-campo span{display:block;font-weight:600;font-size:13px;margin-bottom:5px}
.ag-campo input{width:100%;min-height:48px;border:1.5px solid var(--xp-linea);border-radius:12px;padding:10px 13px;font:16px system-ui;background:transparent;color:inherit}
.ag-campo input:focus{outline:none;border-color:var(--xp-acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--xp-acc) 22%,transparent)}
.ag-campo em{display:block;color:#C8321F;font-style:normal;font-size:12.5px;margin-top:4px}
.ag-boton{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;margin-top:14px;border:0;border-radius:14px;background:var(--xp-acc);color:var(--xp-acc-ink);font:700 15.5px system-ui;cursor:pointer;text-decoration:none;transition:transform .15s,opacity .2s}
.ag-boton:active{transform:scale(.98)}
.ag-boton:disabled{opacity:.6;cursor:progress}
.ag-boton--sec{background:transparent;color:inherit;border:1.5px solid var(--xp-linea);margin-top:8px}
.ag-boton svg{width:18px;height:18px}
.ag-aviso{margin-top:10px;padding:10px 12px;border-radius:12px;background:#FFF1EC;color:#9A2E12;font-size:13px}
.ag-nota{margin-top:10px;color:var(--xp-muted);font-size:12.5px;text-align:center}
.ag-listo{text-align:center;padding:6px 0 2px}
.ag-check{width:64px;height:64px;margin:4px auto 10px;border-radius:50%;display:grid;place-items:center;background:var(--xp-acc);color:var(--xp-acc-ink)}
.ag-check svg{width:32px;height:32px;stroke-dasharray:30;stroke-dashoffset:0}
@media (prefers-reduced-motion:no-preference){.ag-check{animation:xp-pop .5s cubic-bezier(.2,1.4,.4,1) both}.ag-check svg{animation:xp-trazo .5s .25s ease-out both}}
@keyframes xp-pop{from{transform:scale(.4);opacity:0}}
@keyframes xp-trazo{from{stroke-dashoffset:30}}
.ag-listo h3{font-size:19px}
.ag-listo p{color:var(--xp-muted);margin-top:4px}
.ag-codigo{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:8px;background:var(--xp-suave);font:700 13px ui-monospace,monospace;letter-spacing:.06em}
.ag-servicios{display:grid;gap:8px}
.ag-servicio{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px;border:1.5px solid var(--xp-linea);border-radius:14px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.ag-servicio:hover{border-color:var(--xp-acc)}
.ag-servicio img{width:48px;height:48px;border-radius:10px;object-fit:cover;flex:none}
.ag-servicio div{flex:1;min-width:0}
.ag-servicio b{display:block}
.ag-servicio small{color:var(--xp-muted)}
.xp button:focus-visible,.xp a:focus-visible,.xp summary:focus-visible{outline:3px solid var(--xp-acc);outline-offset:2px}
`;
}

/**
 * El motor. Va dentro de la página: sin módulos, sin build, ES5 con algo de
 * DOM moderno (Element.animate; si no existe, sin animación y todo funciona).
 */
export const SCRIPT_EXPANDIR = `<script>
(function(){
var quieto=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var CURVA='cubic-bezier(.2,.8,.2,1)';
var DIAS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
var MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
var CORTOS=['L','M','M','J','V','S','D'];
var SVG_CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var SVG_CAL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
var SVG_WA='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>';

var SVG_VIDEO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}
function cuerpoDe(xp){return xp.querySelector('.xp__cuerpo');}
function btDe(xp){return xp.querySelector('.xp__bt');}
function estaAbierto(xp){return xp.classList.contains('abierto');}
function marcar(xp,si){
  xp.classList.toggle('abierto',si);
  if(xp.tagName==='DETAILS')xp.open=si;else cuerpoDe(xp).hidden=!si;
  btDe(xp).setAttribute('aria-expanded',si?'true':'false');
}
/** Anima el alto del contenedor entre antes y después de cambiar(). */
function transformar(xp,cambiar,luego){
  var h0=xp.getBoundingClientRect().height;
  if(xp._anim){xp._anim.cancel();xp._anim=null;}
  cambiar();
  var h1=xp.getBoundingClientRect().height;
  if(quieto||!xp.animate||Math.abs(h1-h0)<2){if(luego)luego();return;}
  xp.style.overflow='hidden';
  var a=xp.animate([{height:h0+'px'},{height:h1+'px'}],{duration:Math.min(620,300+Math.abs(h1-h0)*.3),easing:CURVA});
  xp._anim=a;
  var fin=function(){xp.style.overflow='';if(xp._anim===a)xp._anim=null;if(luego)luego();};
  a.onfinish=fin;a.oncancel=function(){xp.style.overflow='';};
}
/** Lo nuevo entra escalonado: desde abajo, o de lado al avanzar/volver un paso. */
function entrar(nodos,dir){
  if(quieto)return;
  var dx=dir==='adelante'?18:dir==='atras'?-18:0,dy=dx?0:12;
  for(var i=0;i<nodos.length;i++){
    if(nodos[i].animate)nodos[i].animate([{opacity:0,transform:'translate('+dx+'px,'+dy+'px)'},{opacity:1,transform:'none'}],{duration:460,delay:40+i*45,easing:CURVA,fill:'backwards'});
  }
}
function asomar(xp){
  var r=xp.getBoundingClientRect(),vh=window.innerHeight;
  if(r.top<12||r.top>vh*.45)window.scrollBy({top:r.top-16,behavior:quieto?'auto':'smooth'});
}
function abrir(xp){
  document.querySelectorAll('.xp.abierto').forEach(function(o){if(o!==xp)cerrar(o);});
  var tipo=xp.getAttribute('data-xp');
  // La agenda pone su esqueleto ANTES de medir: así el alto ya cuenta con él.
  transformar(xp,function(){if(tipo==='agenda')agenda(xp);marcar(xp,true);});
  asomar(xp);
  entrar(cuerpoDe(xp).children,'');
  if(tipo==='portafolio')entrar(xp.querySelectorAll('.pf__it'),'adelante');
}
function cerrar(xp){
  var h0=xp.getBoundingClientRect().height,h1=btDe(xp).getBoundingClientRect().height;
  if(quieto||!xp.animate){marcar(xp,false);return;}
  if(xp._anim)xp._anim.cancel();
  xp.style.overflow='hidden';
  var c=cuerpoDe(xp);if(c.animate)c.animate([{opacity:1},{opacity:0}],{duration:220,fill:'forwards'});
  var a=xp.animate([{height:h0+'px'},{height:h1+'px'}],{duration:Math.min(520,260+(h0-h1)*.2),easing:CURVA});
  xp._anim=a;
  a.onfinish=function(){marcar(xp,false);xp.style.overflow='';if(c.getAnimations)c.getAnimations().forEach(function(x){x.cancel();});xp._anim=null;};
}
/** El portafolio, en una ventana encima de la página (no crece en su sitio). */
function ventanaPf(xp){
  if(!xp._dlg){
    var d=el('dialog','pf-modal'),cab=el('div','pf-modal__cab'),t=el('div');
    var b=btDe(xp),nom=b.querySelector('.tx b'),cnt=b.querySelector('.tx small');
    var h=el('h2','',nom?nom.textContent:'');h.id='pf-titulo';t.appendChild(h);
    if(cnt)t.appendChild(el('small','',cnt.textContent));
    var x=el('button','pf-modal__x','\\u00d7');x.type='button';x.setAttribute('aria-label','Cerrar');
    x.onclick=function(){d.close();};
    cab.appendChild(t);cab.appendChild(x);d.appendChild(cab);
    d.appendChild(xp.querySelector('.pf'));
    d.setAttribute('aria-labelledby','pf-titulo');
    d.addEventListener('click',function(ev){if(ev.target===d)d.close();});
    d.addEventListener('close',function(){b.setAttribute('aria-expanded','false');});
    document.body.appendChild(d);
    xp._dlg=d;
  }
  document.querySelectorAll('.xp.abierto').forEach(function(o){cerrar(o);});
  xp._dlg.showModal();
  btDe(xp).setAttribute('aria-expanded','true');
  xp._dlg.querySelector('.pf').scrollTop=0;
  entrar(xp._dlg.querySelectorAll('.pf__it'),'');
}
document.querySelectorAll('.xp').forEach(function(xp){
  btDe(xp).addEventListener('click',function(ev){
    if(ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.button===1)return;
    ev.preventDefault();
    if(xp.getAttribute('data-xp')==='portafolio'&&typeof HTMLDialogElement==='function'){ventanaPf(xp);return;}
    if(estaAbierto(xp))cerrar(xp);else abrir(xp);
  });
});

/* ── La agenda ─────────────────────────────────────────────────────────── */
function soles(n){return 'S/ '+Number(n).toFixed(2).replace(/\\.00$/,'');}
function precioDe(p){return p==null?'':p>0?soles(p):'Gratis';}
function duracionDe(m){return m>=60&&m%60===0?(m/60)+' h':m>60?Math.floor(m/60)+' h '+(m%60)+' min':m+' min';}
function partes(f){var x=f.split('-');return new Date(Date.UTC(+x[0],+x[1]-1,+x[2]));}
function fechaLarga(f){var d=partes(f);return DIAS[d.getUTCDay()]+' '+d.getUTCDate()+' de '+MESES[d.getUTCMonth()];}
function sumarMin(inicio,min){var d=new Date(Date.UTC(+inicio.slice(0,4),+inicio.slice(5,7)-1,+inicio.slice(8,10),+inicio.slice(11,13),+inicio.slice(14,16)));d.setUTCMinutes(d.getUTCMinutes()+min);return d.toISOString().slice(0,16).replace('T',' ');}
function compacto(m){return m.replace(/[-: ]/g,'').slice(0,8)+'T'+m.slice(11).replace(':','')+'00';}
function idem(){var a=new Uint8Array(12);(window.crypto||window.msCrypto).getRandomValues(a);return Array.prototype.map.call(a,function(b){return('0'+b.toString(16)).slice(-2);}).join('');}
function leerCliente(){try{return JSON.parse(localStorage.getItem('fz:cliente')||'{}')||{};}catch(e){return{};}}
function guardarCliente(c){try{localStorage.setItem('fz:cliente',JSON.stringify(c));}catch(e){}}

function agenda(xp){
  if(xp._ag)return;
  var a=xp.getAttribute('data-agenda'),href=btDe(xp).href,c=cuerpoDe(xp);
  var s=xp._ag={datos:null,item:null,mes:'',fecha:'',inicio:'',idem:idem(),tomadas:{}};
  c.textContent='';
  var esq=el('div','xp-cargando');esq.appendChild(el('i'));esq.appendChild(el('i'));esq.appendChild(el('i'));c.appendChild(esq);
  fetch('/api/fideliza/publico/agenda?slug='+encodeURIComponent(a),{headers:{accept:'application/json'}})
    .then(function(r){return r.json();})
    .then(function(d){
      if(!d||d.status!=='ok'||!d.enLinea||!d.items||!d.items.length){location.href=(d&&d.url)||href;return;}
      s.datos=d;
      if(d.items.length===1)s.item=d.items[0];
      pintar(xp,s.item?'calendario':'servicios','');
    })
    .catch(function(){location.href=href;});
}
function horasDe(s,f){
  var h=(s.datos.horas[String(s.item.duracion)]||{})[f]||[];
  return h.filter(function(x){return!s.tomadas[x];});
}
function diasLibres(s){
  var por=s.datos.horas[String(s.item.duracion)]||{};
  return Object.keys(por).sort().filter(function(f){return horasDe(s,f).length>0;});
}
function pintar(xp,paso,dir){
  var s=xp._ag,c=cuerpoDe(xp);
  transformar(xp,function(){
    c.textContent='';
    if(paso!=='listo'&&paso!=='servicios')c.appendChild(ficha(xp));
    var bloque=paso==='servicios'?servicios(xp):paso==='calendario'?calendario(xp):paso==='datos'?datos(xp):listo(xp);
    c.appendChild(bloque);
  });
  entrar(paso==='calendario'||paso==='datos'?c.lastChild.children:c.children,dir);
}
function ficha(xp){
  var s=xp._ag,it=s.item,f=el('div','ag-ficha');
  var cab=el('div','ag-cabeza'),txt=el('div');
  if(it.foto){var img=el('img','ag-foto');img.src=it.foto;img.alt='';img.decoding='async';cab.appendChild(img);}
  txt.appendChild(el('h3','',it.nombre));
  var chips=el('div','ag-chips');
  chips.appendChild(el('span','ag-chip','⏱ '+duracionDe(it.duracion)));
  var p=precioDe(it.precio);if(p)chips.appendChild(el('span','ag-chip'+(it.precio>0?'':' ag-chip--acc'),p));
  if(s.datos.items.length>1){var cam=el('button','ag-volver','Cambiar');cam.type='button';cam.style.marginLeft='auto';cam.onclick=function(){s.item=null;s.fecha='';s.inicio='';pintar(xp,'servicios','atras');};chips.appendChild(cam);}
  txt.appendChild(chips);cab.appendChild(txt);f.appendChild(cab);
  if(it.descripcion)f.appendChild(el('p','ag-desc',it.descripcion));
  f.appendChild(el('div','ag-sep'));
  return f;
}
function servicios(xp){
  var s=xp._ag,box=el('div','ag-servicios');
  box.appendChild(el('b','','¿Qué quieres agendar?'));
  s.datos.items.forEach(function(it){
    var b=el('button','ag-servicio');b.type='button';
    if(it.foto){var img=el('img');img.src=it.foto;img.alt='';img.loading='lazy';b.appendChild(img);}
    var t=el('div');t.appendChild(el('b','',it.nombre));t.appendChild(el('small','',[duracionDe(it.duracion),precioDe(it.precio)].filter(Boolean).join(' · ')));b.appendChild(t);
    b.onclick=function(){s.item=it;s.fecha='';s.inicio='';pintar(xp,'calendario','adelante');};
    box.appendChild(b);
  });
  return box;
}
function calendario(xp){
  var s=xp._ag,libres=diasLibres(s),box=el('div');
  if(s.aviso){var av=el('p','ag-aviso',s.aviso);av.setAttribute('role','alert');box.appendChild(av);s.aviso='';}
  if(!libres.length){
    box.appendChild(el('p','ag-desc','Por ahora no quedan horarios en línea.'));
    var ir=el('a','ag-boton','Ver la agenda completa');ir.href=btDe(xp).href;box.appendChild(ir);
    return box;
  }
  if(!s.fecha||libres.indexOf(s.fecha)<0)s.fecha=libres[0];
  if(!s.mes)s.mes=s.fecha.slice(0,7);
  var meses=[];libres.forEach(function(f){var m=f.slice(0,7);if(meses.indexOf(m)<0)meses.push(m);});
  if(meses.indexOf(s.mes)<0)s.mes=meses[0];
  var i=meses.indexOf(s.mes),y=+s.mes.slice(0,4),m=+s.mes.slice(5,7);
  var cab=el('div','ag-titulo');cab.appendChild(el('b','',MESES[m-1]+' '+y));
  var nav=el('div','ag-nav');
  var ant=el('button','','‹');ant.type='button';ant.setAttribute('aria-label','Mes anterior');ant.disabled=i<=0;
  var sig=el('button','','›');sig.type='button';sig.setAttribute('aria-label','Mes siguiente');sig.disabled=i>=meses.length-1;
  ant.onclick=function(){s.mes=meses[i-1];s.fecha='';var p=libres.filter(function(f){return f.slice(0,7)===s.mes;});s.fecha=p[0]||'';pintar(xp,'calendario','atras');};
  sig.onclick=function(){s.mes=meses[i+1];var p=libres.filter(function(f){return f.slice(0,7)===s.mes;});s.fecha=p[0]||'';pintar(xp,'calendario','adelante');};
  nav.appendChild(ant);nav.appendChild(sig);cab.appendChild(nav);box.appendChild(cab);
  var grilla=el('div','ag-mes');grilla.setAttribute('role','group');grilla.setAttribute('aria-label','Días');
  CORTOS.forEach(function(d){grilla.appendChild(el('span','',d));});
  var primero=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7,total=new Date(Date.UTC(y,m,0)).getUTCDate(),desde=1;
  // El mes en curso empieza en la semana de hoy: las semanas pasadas no ocupan sitio.
  var hoy=s.datos.hoy||'';
  if(hoy.slice(0,7)===s.mes){var lunes=+hoy.slice(8,10)-(partes(hoy).getUTCDay()+6)%7;if(lunes>1){desde=lunes;primero=0;}}
  for(var k=0;k<primero;k++)grilla.appendChild(el('i'));
  for(var dia=desde;dia<=total;dia++){
    (function(dia){
      var f=s.mes+'-'+('0'+dia).slice(-2),b=el('button','ag-dia',String(dia));b.type='button';
      var hay=libres.indexOf(f)>=0;b.disabled=!hay;b.setAttribute('aria-pressed',f===s.fecha?'true':'false');
      b.setAttribute('aria-label',fechaLarga(f)+(hay?'':' · sin horarios'));
      b.onclick=function(){
        s.fecha=f;
        grilla.querySelectorAll('.ag-dia').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
        transformar(xp,function(){var n=horas(xp);box.replaceChild(n,box.lastChild);box.replaceChild(el('p','ag-fecha',fechaLarga(f)),box.lastChild.previousSibling);});
        entrar(box.lastChild.children,'');
      };
      grilla.appendChild(b);
    })(dia);
  }
  box.appendChild(grilla);
  box.appendChild(el('p','ag-fecha',fechaLarga(s.fecha)));
  box.appendChild(horas(xp));
  return box;
}
function horas(xp){
  var s=xp._ag,g=el('div','ag-horas');g.setAttribute('role','group');g.setAttribute('aria-label','Horas libres');
  horasDe(s,s.fecha).forEach(function(ini){
    var b=el('button','ag-hora',ini.slice(11));b.type='button';
    b.onclick=function(){s.inicio=ini;pintar(xp,'datos','adelante');};
    g.appendChild(b);
  });
  return g;
}
function datos(xp){
  var s=xp._ag,box=el('div'),cli=leerCliente();
  var res=el('div','ag-resumen');var t=el('div');
  t.appendChild(el('b','',fechaLarga(s.inicio.slice(0,10))));
  t.appendChild(el('small','',s.inicio.slice(11)+' – '+sumarMin(s.inicio,s.item.duracion).slice(11)+' · '+duracionDe(s.item.duracion)));
  res.appendChild(t);
  var cam=el('button','ag-volver','Cambiar');cam.type='button';cam.onclick=function(){s.inicio='';pintar(xp,'calendario','atras');};
  res.appendChild(cam);box.appendChild(res);
  function campo(id,etq,tipo,valor,auto){
    var l=el('label','ag-campo');l.appendChild(el('span','',etq));
    var i=el('input');i.type=tipo;i.name=id;i.value=valor||'';i.autocomplete=auto;i.required=true;if(tipo==='tel'){i.inputMode='tel';i.placeholder='987 654 321';}
    l.appendChild(i);var e=el('em');e.hidden=true;l.appendChild(e);
    return{l:l,i:i,e:e};
  }
  var nombre=campo('nombre','Tu nombre','text',cli.nombre,'name'),tel=campo('telefono','Tu WhatsApp','tel',cli.telefono,'tel');
  box.appendChild(nombre.l);box.appendChild(tel.l);
  var aviso=el('p','ag-aviso');aviso.hidden=true;aviso.setAttribute('role','alert');
  var ok=el('button','ag-boton');ok.type='button';ok.innerHTML=SVG_CHECK;ok.appendChild(document.createTextNode(' Confirmar'));
  box.appendChild(aviso);box.appendChild(ok);
  box.appendChild(el('p','ag-nota','Te escribimos a ese WhatsApp si hay algún cambio.'));
  function error(c,m){c.e.textContent=m;c.e.hidden=!m;}
  ok.onclick=function(){
    var n=nombre.i.value.trim(),d=tel.i.value.replace(/\\D/g,'');
    error(nombre,n.length<2?'Escribe tu nombre':'');
    error(tel,d.length<8||d.length>15?'Revisa tu número':'');
    if(n.length<2||d.length<8||d.length>15)return;
    aviso.hidden=true;ok.disabled=true;ok.lastChild.textContent=' Agendando…';
    var cuerpo={slug:xp.getAttribute('data-agenda'),idem:s.idem,web:'',item:s.item.id,inicio:s.inicio,nombre:n,telefono:tel.i.value.trim()};
    if(s.datos.sede)cuerpo.sede=s.datos.sede;
    fetch('/api/fideliza/publico/agenda',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cuerpo)})
      .then(function(r){return r.json().catch(function(){return{status:'error'};});})
      .then(function(j){
        if(j.status==='ok'){guardarCliente({nombre:n,telefono:tel.i.value.trim()});s.codigo=j.codigo||'';s.meet=typeof j.meet==='string'&&j.meet.indexOf('https://meet.google.com/')===0?j.meet:'';s.estado=j.estado||'';s.nombre=n;pintar(xp,'listo','adelante');return;}
        s.idem=idem();ok.disabled=false;ok.lastChild.textContent=' Confirmar';
        if(j.status==='lleno'||j.status==='pasada'){s.tomadas[s.inicio]=1;s.inicio='';s.aviso='Alguien acaba de tomar esa hora. Elige otra.';pintar(xp,'calendario','atras');return;}
        if(j.errores){if(j.errores.nombre)error(nombre,j.errores.nombre);if(j.errores.telefono)error(tel,j.errores.telefono);return;}
        aviso.textContent=j.status==='demasiados'?'Ya tienes varias reservas sin confirmar. Escríbenos por WhatsApp.':'No pudimos agendar. Revisa tu conexión e inténtalo otra vez.';
        transformar(xp,function(){aviso.hidden=false;});
      })
      .catch(function(){s.idem=idem();ok.disabled=false;ok.lastChild.textContent=' Confirmar';aviso.textContent='Sin conexión. Revisa tu internet.';transformar(xp,function(){aviso.hidden=false;});});
  };
  setTimeout(function(){if(!nombre.i.value)nombre.i.focus({preventScroll:true});},quieto?0:420);
  return box;
}
function listo(xp){
  var s=xp._ag,d=s.datos,box=el('div','ag-listo');
  var ch=el('div','ag-check');ch.innerHTML=SVG_CHECK;box.appendChild(ch);
  var apartada=s.estado==='pending_payment';
  box.appendChild(el('h3','',apartada?'Apartado: falta confirmar':'¡Listo, '+s.nombre.split(' ')[0]+'!'));
  box.appendChild(el('p','',s.item.nombre+' · '+fechaLarga(s.inicio.slice(0,10))+' a las '+s.inicio.slice(11)));
  if(s.codigo)box.appendChild(el('span','ag-codigo',s.codigo));
  if(apartada){var ir=el('a','ag-boton','Terminar en la agenda');ir.href=d.url;box.appendChild(ir);}
  if(s.meet&&!apartada){var mt=el('a','ag-boton');mt.innerHTML=SVG_VIDEO;mt.appendChild(document.createTextNode(' Enlace de Google Meet'));mt.href=s.meet;mt.target='_blank';mt.rel='noopener';box.appendChild(mt);}
  var fin=sumarMin(s.inicio,s.item.duracion);
  var g=el('a','ag-boton'+(apartada||s.meet?' ag-boton--sec':''));g.innerHTML=SVG_CAL;g.appendChild(document.createTextNode(' Añadir a Google Calendar'));
  g.href='https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(s.item.nombre+' · '+d.negocio)+'&dates='+compacto(s.inicio)+'/'+compacto(fin)+'&ctz=America/Lima&details='+encodeURIComponent((s.codigo?'Código: '+s.codigo+'\\n':'')+location.href.split('#')[0]);
  g.target='_blank';g.rel='noopener';box.appendChild(g);
  if(d.whatsapp){
    var w=el('a','ag-boton ag-boton--sec');w.innerHTML=SVG_WA;w.appendChild(document.createTextNode(' Avisar por WhatsApp'));
    w.href='https://wa.me/'+d.whatsapp+'?text='+encodeURIComponent('Hola, agendé en tu página'+(s.codigo?' ('+s.codigo+')':'')+':\\n• '+s.item.nombre+'\\n• '+fechaLarga(s.inicio.slice(0,10))+', '+s.inicio.slice(11)+'\\nA nombre de: '+s.nombre);
    w.target='_blank';w.rel='noopener';box.appendChild(w);
  }
  (d.indicaciones||[]).forEach(function(t){box.appendChild(el('p','ag-nota',t));});
  return box;
}
})();
</script>`;
