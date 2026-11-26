const products = [
  {id:'astro',name:'ASTRO FUR JACKET',price:1150,images:['assets/astro-front.webp','assets/astro-side.webp'],description:'Una silueta amplia en cuero oscuro y textura envolvente. Pieza conceptual de la colección Kallpa 01.'},
  {id:'biker',name:'BIKER LEATHER JACKET',price:670,images:['assets/biker-front.webp','assets/biker-side.webp'],description:'Chaqueta de cuero de líneas limpias, cierre frontal y carácter cotidiano. Pieza conceptual de la colección Kallpa 01.'},
  {id:'moleskin',name:'MOLESKIN JACKET BEIGE',price:560,images:['assets/moleskin-front.webp','assets/moleskin-side.webp','assets/moleskin-back.webp'],description:'Volumen escultórico, cuello alto y tono arena. Pieza conceptual de la colección Kallpa 01.'},
  {id:'bomber',name:'BLACK BOMBER JACKET',price:790,images:['assets/bomber-front.webp','assets/bomber-side.webp'],description:'Bomber negra de acabado satinado y proporciones amplias. Pieza conceptual de la colección Kallpa 01.'}
];

const $ = selector => document.querySelector(selector);
const homeView = $('#home-view');
const productView = $('#product-view');
const siteHeader = $('#site-header');
const headerBrand = $('.header-brand');
const hero = $('#home');
const heroWordmark = $('.hero-wordmark');
const morphWordmark = $('#morph-wordmark');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const productGrid = $('#product-grid');
const galleryImage = $('#gallery-image');
const sizeOptions = $('#size-options');
const cartDrawer = $('#cart-drawer');
const cartBackdrop = $('#cart-backdrop');
const formatPrice = value => `${new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)} USD`;
let activeProduct = null;
let galleryIndex = 0;
let selectedSize = null;
let cart = readCart();
let lastCartFocus = null;
let logoMetrics = null;

function readCart(){try{const saved=JSON.parse(localStorage.getItem('kallpa-cart')||'[]');return Array.isArray(saved)?saved:[]}catch{return []}}
function saveCart(){localStorage.setItem('kallpa-cart',JSON.stringify(cart));renderCart()}

function renderCatalog(){
  productGrid.innerHTML=products.map((p,index)=>`<button class="product-card" type="button" data-product="${p.id}" aria-label="Ver ${p.name}">
    <span class="product-media"><img class="front" src="${p.images[0]}" alt="${p.name}, vista frontal" ${index>1?'loading="lazy"':''}><img class="back" src="${p.images[1]}" alt="" loading="lazy"></span>
    <span class="product-name">${p.name}</span><span class="product-price">${formatPrice(p.price)}</span><span class="product-cta">DISCOVER <span aria-hidden="true">↗</span></span>
  </button>`).join('');
  productGrid.addEventListener('click',event=>{const card=event.target.closest('[data-product]');if(card)location.hash=`product/${card.dataset.product}`});
}

function renderProduct(id){
  const product=products.find(p=>p.id===id);
  if(!product){location.hash='catalog';return}
  activeProduct=product;galleryIndex=0;selectedSize=null;
  $('#detail-name').textContent=product.name;
  $('#detail-price').textContent=formatPrice(product.price);
  $('#detail-description').textContent=product.description;
  $('#size-message').textContent='';
  galleryImage.src=product.images[0];galleryImage.alt=`${product.name}, vista frontal`;
  updateGalleryCounter();
  sizeOptions.innerHTML=['S','M','L','XL'].map(size=>`<button type="button" data-size="${size}" aria-pressed="false">${size}</button>`).join('');
  document.querySelectorAll('.accordion button').forEach(button=>{button.setAttribute('aria-expanded','false');button.querySelector('span').textContent='+';button.nextElementSibling.hidden=true});
  document.title=`${product.name} — Kallpa`;
}

function route(){
  const hash=decodeURIComponent(location.hash.slice(1));
  const isProduct=hash.startsWith('product/');
  homeView.hidden=isProduct;
  productView.hidden=!isProduct;
  if(isProduct){renderProduct(hash.split('/')[1]);window.scrollTo({top:0,behavior:'instant'})}
  else{
    activeProduct=null;document.title='Kallpa — Colección editorial';
    if(hash==='catalog'||hash==='footer')requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById(hash).scrollIntoView({behavior:'smooth'})));
    else window.scrollTo({top:0,behavior:'instant'});
  }
  measureLogo();
  syncHeader();
}

function measureLogo(){
  if(homeView.hidden||reducedMotion.matches){
    morphWordmark.hidden=true;
    document.documentElement.classList.remove('has-logo-morph');
    headerBrand.style.opacity='';
    return;
  }
  morphWordmark.hidden=false;
  morphWordmark.style.fontSize=getComputedStyle(heroWordmark).fontSize;
  const target=headerBrand.getBoundingClientRect();
  logoMetrics={
    startY:hero.getBoundingClientRect().top+window.scrollY+hero.offsetHeight*.44,
    endY:target.top+target.height/2,
    endScale:target.width/morphWordmark.offsetWidth,
    scrollRange:Math.max(1,hero.offsetHeight-siteHeader.offsetHeight)
  };
  document.documentElement.classList.add('has-logo-morph');
}

function syncHeader(){
  const overHero=!homeView.hidden&&window.scrollY<Math.max(80,hero.offsetHeight-siteHeader.offsetHeight*1.2);
  siteHeader.classList.toggle('is-over-hero',overHero);
  siteHeader.classList.toggle('is-scrolled',!overHero&&window.scrollY>10);
  if(!logoMetrics||homeView.hidden||reducedMotion.matches)return;
  const progress=Math.min(1,Math.max(0,window.scrollY/logoMetrics.scrollRange));
  const y=logoMetrics.startY+(logoMetrics.endY-logoMetrics.startY)*progress;
  const scale=1+(logoMetrics.endScale-1)*progress;
  const headerReveal=Math.min(1,Math.max(0,(progress-.94)/.06));
  morphWordmark.style.setProperty('--logo-y',`${y}px`);
  morphWordmark.style.setProperty('--logo-scale',scale);
  morphWordmark.style.opacity=String(1-headerReveal);
  morphWordmark.style.color=overHero?'#fff':'#101010';
  headerBrand.style.opacity=String(headerReveal);
}

function updateGalleryCounter(){
  if(!activeProduct)return;
  $('#gallery-counter').textContent=`${String(galleryIndex+1).padStart(2,'0')} / ${String(activeProduct.images.length).padStart(2,'0')}`;
}

function changeGallery(delta){
  if(!activeProduct)return;
  galleryIndex=(galleryIndex+delta+activeProduct.images.length)%activeProduct.images.length;
  galleryImage.classList.add('is-changing');
  const next=activeProduct.images[galleryIndex];
  const ready=new Image();ready.src=next;
  const swap=()=>{galleryImage.src=next;galleryImage.alt=`${activeProduct.name}, imagen ${galleryIndex+1} de ${activeProduct.images.length}`;updateGalleryCounter();requestAnimationFrame(()=>galleryImage.classList.remove('is-changing'))};
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)swap();else setTimeout(swap,220);
}

function renderCart(){
  const count=cart.reduce((sum,item)=>sum+item.quantity,0);
  $('#cart-count').textContent=count;
  $('#cart-count-drawer').textContent=`(${count})`;
  $('#cart-total').textContent=formatPrice(cart.reduce((sum,item)=>{const product=products.find(p=>p.id===item.id);return sum+(product?product.price*item.quantity:0)},0));
  $('#cart-items').innerHTML=cart.length?cart.map((item,index)=>{const p=products.find(product=>product.id===item.id);if(!p)return '';return `<div class="cart-item"><img src="${p.images[0]}" alt=""><div><strong>${p.name}</strong><small>SIZE ${item.size} · QTY ${item.quantity}</small><small>${formatPrice(p.price*item.quantity)}</small></div><button type="button" data-remove="${index}" aria-label="Quitar ${p.name}">×</button></div>`}).join(''):'<p class="cart-empty">Your cart is empty.</p>';
}

function openCart(){lastCartFocus=document.activeElement;renderCart();cartBackdrop.hidden=false;cartDrawer.hidden=false;document.body.style.overflow='hidden';$('#cart-close').focus()}
function closeCart(){cartBackdrop.hidden=true;cartDrawer.hidden=true;document.body.style.overflow='';lastCartFocus?.focus()}

renderCatalog();renderCart();route();
window.addEventListener('hashchange',route);
window.addEventListener('scroll',syncHeader,{passive:true});
window.addEventListener('resize',()=>{measureLogo();syncHeader()});
$('#gallery-prev').addEventListener('click',()=>changeGallery(-1));
$('#gallery-next').addEventListener('click',()=>changeGallery(1));
sizeOptions.addEventListener('click',event=>{const button=event.target.closest('[data-size]');if(!button)return;selectedSize=button.dataset.size;sizeOptions.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('#size-message').textContent=''});
$('#add-to-cart').addEventListener('click',()=>{
  if(!activeProduct)return;
  if(!selectedSize){$('#size-message').textContent='Selecciona una talla primero.';sizeOptions.querySelector('button')?.focus();return}
  const entry=cart.find(item=>item.id===activeProduct.id&&item.size===selectedSize);
  if(entry)entry.quantity+=1;else cart.push({id:activeProduct.id,size:selectedSize,quantity:1});
  saveCart();openCart();
});
document.querySelectorAll('.accordion button').forEach(button=>button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));button.querySelector('span').textContent=open?'+':'−';button.nextElementSibling.hidden=open}));
$('#cart-trigger').addEventListener('click',openCart);
$('#cart-close').addEventListener('click',closeCart);
cartBackdrop.addEventListener('click',closeCart);
$('#cart-items').addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(!button)return;cart.splice(Number(button.dataset.remove),1);saveCart()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!cartDrawer.hidden)closeCart();if(event.key==='ArrowRight'&&!productView.hidden)changeGallery(1);if(event.key==='ArrowLeft'&&!productView.hidden)changeGallery(-1)});
$('#newsletter-form').addEventListener('submit',event=>{event.preventDefault();const input=$('#newsletter-email');const message=$('#newsletter-message');if(!input.validity.valid){message.textContent='Introduce un email válido.';input.focus();return}message.textContent='La lista de correo estará disponible cuando Kallpa abra sus ventas.';input.value=''});
