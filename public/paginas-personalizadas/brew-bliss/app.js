const copy = {
  es: {
    welcomeTitle: 'Bienvenido a<br>nuestro café<br><em>refugio!</em>',
    heroTagline: 'Tu pausa favorita empieza aquí.',
    openingHours: '7 am—8 pm<br>Café<br>Batidos<br>Postres',
    menuHeaderSub: 'Hecho para tu pausa',
    oasis: 'Oasis de café', escape: 'tu escape hacia', showAll: 'ver todo',
    newCollection: 'nueva colección', collectionDetails: 'temporada 2026<br>ofertas especiales',
    forYou: 'para ti', bag: 'Tu bolsa', subtotal: 'Subtotal',
    demoNote: 'Pedido de demostración: no se envía al local.',
    footerLine: 'Tu pausa, en movimiento.',
    order: 'Añadir a la bolsa', emptyBag: 'Elige una bebida de la carta para empezar.',
    emptyFavorites: 'Toca un corazón en una bebida y aparecerá aquí.', emptyFavoritesTitle: 'Tu rincón favorito', exploreDrinks: 'Explorar bebidas',
    added: 'Añadido a la bolsa', callWaiter: 'Llamar al mesero', waiterDemo: 'Solicitud de muestra registrada. No se ha avisado al local.',
    loyaltyTitle: 'Tu tarjeta de fidelización', loyaltyName: 'Tarjeta de ejemplo · Cliente invitado',
    loyaltyProgress: '4 de 8 cafés. ¡Te faltan 4 para uno de cortesía!', loyaltyDemo: 'Ejemplo visual. Los sellos aún no se acumulan con los pedidos.',
    confirmOrder: 'Confirmar pedido de muestra', orderComplete: 'Pedido de muestra listo',
    orderCompleteNote: 'Tu selección quedó registrada solo en esta página. El local no recibió el pedido.',
    backToMenu: 'Volver a la carta', favorites: 'Favoritos',
    viewMedia: 'Ver foto y video', samplePhoto: 'Foto ilustrativa', sampleVideo: 'Video de preparación ilustrativo',
    mediaDisclaimer: 'Material de referencia. La bebida servida puede variar.', photoCredit: 'Foto · Pexels', videoCredit: 'Video · Pexels',
    demoQR: 'QR de la demo', demoQRTitle: 'Demo en tu móvil', demoQRHelp: 'Escanea el código para abrir vendemias.com.', openVendemias: 'Abrir vendemias.com ↗',
    payWith: 'Paga con Yape / Plin', sampleNumber: 'Número de ejemplo · no recibe pagos', copyNumber: 'Copiar', copied: '¡Copiado!', copyFailed: 'No se pudo copiar el número.', paymentCopied: 'Número de ejemplo copiado.',
    drinkNotes: [
      'Café frío y caramelo, con una textura suave y cremosa.',
      'Un café corto e intenso para una pausa con carácter.',
      'Café cremoso con notas dulces de vainilla.',
      'Mocha frío con un guiño a los frutos rojos.'
    ],
    menu: 'Explorar el menú', closeBag: 'Cerrar bolsa',
    drinks: [
      ['Caramelo helado', 'Latte'],
      ['Doble', 'deleite'],
      ['Nube de vainilla', 'café'],
      ['Mocha de frutos rojos', 'twist']
    ]
  },
  en: {
    welcomeTitle: 'Welcome to<br>our coffee<br><em>haven!</em>',
    heroTagline: 'Your favorite pause starts here.',
    openingHours: '7 am—8 pm<br>Coffee<br>Milkshakes<br>Desserts',
    menuHeaderSub: 'Made for your coffee break',
    oasis: 'Coffee oasis', escape: 'your escape into', showAll: 'show all',
    newCollection: 'new collection', collectionDetails: 'season 2026<br>special offers',
    forYou: 'for you', bag: 'Your bag', subtotal: 'Subtotal',
    demoNote: 'Demo order: nothing is sent to the café.',
    footerLine: 'Your pause, in motion.',
    order: 'Add to bag', emptyBag: 'Choose a drink from the menu to get started.',
    emptyFavorites: 'Tap a heart on a drink and it will appear here.', emptyFavoritesTitle: 'Your favorites corner', exploreDrinks: 'Explore drinks',
    added: 'Added to bag', callWaiter: 'Call a server', waiterDemo: 'Sample request recorded. The café has not been notified.',
    loyaltyTitle: 'Your loyalty card', loyaltyName: 'Sample card · Guest',
    loyaltyProgress: '4 of 8 coffees. Four more for one on us!', loyaltyDemo: 'Visual example. Orders do not earn stamps yet.',
    confirmOrder: 'Confirm sample order', orderComplete: 'Sample order ready',
    orderCompleteNote: 'Your selection was recorded on this page only. The café did not receive the order.',
    backToMenu: 'Back to menu', favorites: 'Favorites',
    viewMedia: 'View photo and video', samplePhoto: 'Illustrative photo', sampleVideo: 'Illustrative preparation video',
    mediaDisclaimer: 'Reference media. The served drink may look different.', photoCredit: 'Photo · Pexels', videoCredit: 'Video · Pexels',
    demoQR: 'Demo QR', demoQRTitle: 'Demo on your phone', demoQRHelp: 'Scan the code to open vendemias.com.', openVendemias: 'Open vendemias.com ↗',
    payWith: 'Pay with Yape / Plin', sampleNumber: 'Sample number · does not receive payments', copyNumber: 'Copy', copied: 'Copied!', copyFailed: 'Could not copy the number.', paymentCopied: 'Sample number copied.',
    drinkNotes: [
      'Iced coffee and caramel with a smooth, creamy texture.',
      'A short, bold coffee for a spirited pause.',
      'Creamy coffee with sweet vanilla notes.',
      'Iced mocha with a hint of red berries.'
    ],
    menu: 'Explore the menu', closeBag: 'Close bag',
    drinks: [
      ['Iced Caramel', 'Latte'],
      ['Double', 'Delight'],
      ['Vanilla Cloud', 'Brew'],
      ['Berry Mocha', 'Twist']
    ]
  }
};

const drinks = [
  { id: 'caramel', icon: 'cup-latte', price: 3.50, photo: 'caramel.jpg', video: 'iced-demo.mp4', poster: 'iced-poster.jpg', photoSource: 'https://www.pexels.com/photo/close-up-of-a-glass-with-iced-caramel-coffee-15086187/', videoSource: 'https://www.pexels.com/video/pouring-iced-coffee-into-glass-with-milk-32543620/' },
  { id: 'double', icon: 'cup-espresso', price: 2.50, photo: 'espresso.jpg', video: 'espresso-demo.mp4', poster: 'espresso-poster.jpg', photoSource: 'https://www.pexels.com/photo/close-up-shot-of-a-cup-of-espresso-5461662/', videoSource: 'https://www.pexels.com/video/person-pouring-hot-coffee-in-a-glass-5694287/' },
  { id: 'vanilla', icon: 'cup-cloud', price: 3.50, photo: 'vanilla.jpg', video: 'latte-demo.mp4', poster: 'latte-poster.jpg', photoSource: 'https://www.pexels.com/photo/close-up-photo-of-iced-latte-7487389/', videoSource: 'https://www.pexels.com/video/artistic-latte-art-pouring-in-coffee-cup-30068397/' },
  { id: 'berry', icon: 'cup-berry', price: 3.60, photo: 'berry.jpg', video: 'iced-demo.mp4', poster: 'iced-poster.jpg', photoSource: 'https://www.pexels.com/photo/delicious-milkshake-with-straw-5946658/', videoSource: 'https://www.pexels.com/video/pouring-iced-coffee-into-glass-with-milk-32543620/' }
];
const $ = selector => document.querySelector(selector);
const progressText = $('#progressText');
const vectorHand = $('.vector-hand');
const vectorCoffee = $('.vector-coffee');
const splashArt = $('.vector-splash-art');
const splashMaskArt = $('.splash-mask-art');
const waterMotion = $('.water-motion');
const waterJets = [...document.querySelectorAll('.water-jet')];
const splashFinal = $('.vector-splash-final');
const waterJetSpecs = [
  { anchor: [49, 149], start: 480, duration: 1050,
    edges: [
      [[44, 149], [27, 145], [49, 126], [47, 110], [45, 91], [14, 72], [14, 54], [15, 38], [30, 15], [39, 15]],
      [[55, 151], [62, 137], [59, 115], [55, 100], [53, 85], [25, 71], [27, 52], [29, 37], [39, 20], [42, 17]]
    ] },
  { anchor: [67, 151], start: 630, duration: 900,
    edges: [
      [[61, 151], [49, 136], [62, 119], [68, 104], [75, 88], [61, 79], [69, 72]],
      [[72, 152], [61, 137], [70, 120], [75, 107], [84, 92], [70, 78], [74, 73]]
    ] },
  { anchor: [92, 151], start: 760, duration: 760,
    edges: [
      [[86, 151], [76, 139], [82, 125], [95, 118], [106, 110], [110, 103], [96, 101]],
      [[98, 152], [84, 141], [90, 127], [100, 121], [114, 114], [115, 106], [100, 103]]
    ] },
  { anchor: [130, 149], start: 870, duration: 680,
    edges: [
      [[126, 149], [138, 144], [149, 137], [153, 120]],
      [[134, 150], [145, 146], [159, 138], [159, 123]]
    ] }
];
const splashDrops = [...document.querySelectorAll('.vector-splash-drops use')];
let savedFavorites = [];
try { savedFavorites = JSON.parse(localStorage.getItem('brew-bliss-favorites') || '[]'); } catch { savedFavorites = []; }
const state = { lang: 'es', index: 4, favoritesOnly: false, favorites: new Set(Array.isArray(savedFavorites) ? savedFavorites : []), bag: new Map(), orderReceipt: null, activeMedia: null, toastTimer: null };
let mediaOpener = null;
let paymentCopyTimer = null;
const samplePaymentNumber = '000000000';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.documentElement.classList.add('vector-motion');
let carouselTimer = null;
let carouselHover = false;
let carouselHoldUntil = 0;
let phaseTimers = [];
let progressFrame = null;
let splashFrame = null;
let pointerStart = null;
let introComplete = false;
const money = value => '$' + value.toFixed(2);
const tr = key => copy[state.lang][key];

function translate() {
  document.documentElement.lang = state.lang;
  document.title = state.lang === 'es' ? 'Brew Bliss Café · Tu oasis de café' : 'Brew Bliss Café · Your coffee oasis';
  document.querySelector('meta[name="description"]').content = state.lang === 'es'
    ? 'Brew Bliss Café: una experiencia animada para amantes del café.'
    : 'Brew Bliss Café: an animated experience for coffee lovers.';
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = tr(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(element => { element.innerHTML = tr(element.dataset.i18nHtml); });
  $('.current-lang').textContent = state.lang.toUpperCase();
  $('.other-lang').textContent = state.lang === 'es' ? 'EN' : 'ES';
  $('#languageToggle').setAttribute('aria-label', state.lang === 'es' ? 'Switch to English' : 'Cambiar a español');
  $('#splashPhone').setAttribute('aria-label', state.lang === 'es' ? 'Bienvenida animada' : 'Animated welcome');
  $('#menuPhone').setAttribute('aria-label', state.lang === 'es' ? 'Carta de bebidas' : 'Drinks menu');
  $('#splashArrow').setAttribute('aria-label', tr('menu'));
  $('#cardsViewport').setAttribute('aria-label', state.lang === 'es' ? 'Bebidas destacadas' : 'Featured drinks');
  $('.phone-nav').setAttribute('aria-label', state.lang === 'es' ? 'Navegación de la carta' : 'Menu navigation');
  $('#favoritesNav').setAttribute('aria-label', tr('favorites'));
  $('#homeNav').setAttribute('aria-label', state.lang === 'es' ? 'Para ti' : 'For you');
  $('#bagNav').setAttribute('aria-label', tr('bag'));
  $('#loyaltyNav').setAttribute('aria-label', tr('loyaltyTitle'));
  $('#bellButton').setAttribute('aria-label', tr('callWaiter'));
  $('#qrButton').setAttribute('aria-label', tr('demoQR'));
  $('#closeMedia').setAttribute('aria-label', state.lang === 'es' ? 'Cerrar fotos y video' : 'Close photos and video');
  $('#closeQR').setAttribute('aria-label', state.lang === 'es' ? 'Cerrar QR' : 'Close QR');
  $('#closeLoyalty').setAttribute('aria-label', state.lang === 'es' ? 'Cerrar tarjeta' : 'Close card');
  $('#closeBag').setAttribute('aria-label', tr('closeBag'));
  $('.loyalty-qr').setAttribute('aria-label', `${tr('demoQR')}: ${tr('openVendemias')}`);
  $('#copyPayment').setAttribute('aria-label', $('#copyPayment').classList.contains('copied') ? tr('copied') : tr('copyNumber'));
  if ($('#copyPayment').classList.contains('copied')) $('#copyLabel').textContent = tr('copied');
  $('.loyalty-stamps').setAttribute('aria-label', state.lang === 'es' ? '4 de 8 sellos' : '4 of 8 stamps');
  renderCards();
  renderBag();
  if (state.activeMedia) updateMedia();
}

function cardMarkup(drink, cloneIndex = 1) {
  const i = drinks.indexOf(drink);
  const [title, script] = tr('drinks')[i];
  const dark = i === 1;
  return `<article class="drink-card ${dark ? 'is-dark' : ''}" data-drink="${drink.id}" ${cloneIndex === 1 ? '' : 'inert aria-hidden="true"'}>
    <button type="button" class="favorite-card ${state.favorites.has(drink.id) ? 'active' : ''}" data-favorite="${drink.id}" aria-label="${tr('favorites')}: ${title} ${script}" aria-pressed="${state.favorites.has(drink.id)}"><svg><use href="#i-heart"/></svg></button>
    <div class="drink-title">${title}</div><div class="drink-script">${script}</div>
    <svg class="drink-art" aria-hidden="true"><use href="#${drink.icon}"/></svg>
    <button type="button" class="drink-preview" data-preview="${drink.id}" aria-label="${tr('viewMedia')}: ${title} ${script}"><img src="assets/${drink.photo}" alt="" loading="lazy" decoding="async"><span aria-hidden="true">▶</span><small>${tr('viewMedia')}</small></button>
    <strong class="drink-price">${money(drink.price)}</strong>
    <button type="button" class="order-card" data-order="${drink.id}" aria-label="${tr('order')}: ${title} ${script}"><span>${tr('order')}</span><svg><use href="#i-arrow"/></svg></button>
  </article>`;
}

function setTrackPosition(instant = false) {
  const track = $('#cardsTrack');
  const viewport = $('#cardsViewport');
  const card = track.querySelector('.drink-card');
  if (!card) return;
  const cardWidth = card.getBoundingClientRect().width;
  const stride = cardWidth + (parseFloat(getComputedStyle(track).columnGap) || 0);
  const offset = (viewport.clientWidth - cardWidth) / 2 - state.index * stride;
  if (instant || reducedMotion.matches) track.style.transition = 'none';
  track.style.transform = `translate3d(${offset}px,0,0)`;
  if (instant && !reducedMotion.matches) requestAnimationFrame(() => { track.style.transition = ''; });
}

function renderCards() {
  const viewport = $('#cardsViewport');
  const empty = $('#emptyFavorites');
  const visible = state.favoritesOnly ? drinks.filter(drink => state.favorites.has(drink.id)) : drinks;
  if (state.favoritesOnly) {
    $('#cardsTrack').innerHTML = visible.map(cardMarkup).join('');
    state.index = 0;
    empty.hidden = visible.length !== 0;
  } else {
    $('#cardsTrack').innerHTML = [0, 1, 2].flatMap(copyIndex => drinks.map(drink => cardMarkup(drink, copyIndex))).join('');
    if (state.index < 4 || state.index >= 8) state.index = 4;
    empty.hidden = true;
  }
  syncNav();
  requestAnimationFrame(() => setTrackPosition(true));
}

function syncNav() {
  document.querySelectorAll('.phone-nav button').forEach(button => button.classList.remove('active'));
  const active = $('#loyaltySheet').classList.contains('open') ? $('#loyaltyNav')
    : $('#bagSheet').classList.contains('open') ? $('#bagNav')
    : state.favoritesOnly ? $('#favoritesNav') : $('#homeNav');
  active.classList.add('active');
}

function advanceCard(direction = 1) {
  if (state.favoritesOnly || reducedMotion.matches && direction === 0) return;
  state.index += direction;
  setTrackPosition();
  if (state.index >= 8 || state.index < 4) {
    window.setTimeout(() => {
      state.index = state.index >= 8 ? 4 : 7;
      setTrackPosition(true);
    }, reducedMotion.matches ? 0 : 610);
  }
}

function startCarousel() {
  window.clearInterval(carouselTimer);
  carouselTimer = null;
}

function setProgress(value) {
  progressText.textContent = `${value}%`;
}

function renderStir(progress) {
  const centerX = 58;
  const centerY = 82;
  const radius = 19;
  const angle = 1.84 + progress * Math.PI * 5;
  const tipX = centerX + radius * Math.cos(angle);
  const tipY = centerY + radius * Math.sin(angle);
  const point = value => value.toFixed(2);

  // Move the whole hand, arm and fixed spoon as one rigid drawing.
  const wristX = 109;
  const wristY = 46;
  const spoonTipX = 53;
  const spoonTipY = 100;
  const rotation = .1 * Math.sin(angle - 1.84);
  const a = Math.cos(rotation);
  const b = Math.sin(rotation);
  const c = -b;
  const d = a;
  const wristShiftX = tipX - (wristX + a * (spoonTipX - wristX) + c * (spoonTipY - wristY));
  const wristShiftY = tipY - (wristY + b * (spoonTipX - wristX) + d * (spoonTipY - wristY));
  const e = wristShiftX + wristX - a * wristX - c * wristY;
  const f = wristShiftY + wristY - b * wristX - d * wristY;
  vectorHand.setAttribute('transform', `matrix(${a} ${b} ${c} ${d} ${e} ${f})`);

  const trail = Math.min(1.7, .18 + progress * 2.4);
  const start = angle - trail;
  const startX = centerX + radius * Math.cos(start);
  const startY = centerY + radius * Math.sin(start);
  vectorCoffee.setAttribute('d', `M${point(startX)} ${point(startY)} A${radius} ${radius} 0 0 1 ${point(tipX)} ${point(tipY)}`);
  vectorCoffee.style.opacity = String(Math.min(.85, .25 + progress * 1.6));
}

function renderWaterJet(jet, spec, progress, index) {
  if (progress <= 0) {
    jet.setAttribute('d', '');
    return;
  }
  const growth = 1 - Math.pow(1 - progress, 2);
  const [anchorX, anchorY] = spec.anchor;
  const contours = spec.edges.map(edge =>
    edge.map(([x, y], pointIndex) => {
      const distance = pointIndex / (edge.length - 1);
      const bend = Math.sin(Math.PI * growth) * Math.sin(growth * 7 + index * 1.4 + distance * 2);
      const px = anchorX + (x - anchorX) * growth + bend * (5 + index) * distance;
      const py = anchorY + (y - anchorY) * growth - Math.sin(Math.PI * growth) * 5 * distance;
      return [px, py];
    })
  );
  const format = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const [left, right] = contours;
  let path = `M${format(left[0])}`;
  for (let point = 1; point < left.length; point += 3) {
    path += ` C${format(left[point])} ${format(left[point + 1])} ${format(left[point + 2])}`;
  }
  const leftTip = left[left.length - 1];
  const rightTip = right[right.length - 1];
  path += ` Q${((leftTip[0] + rightTip[0]) / 2).toFixed(1)} ${(Math.min(leftTip[1], rightTip[1]) - 2 * growth).toFixed(1)} ${format(rightTip)}`;
  for (let point = right.length - 1; point >= 3; point -= 3) {
    path += ` C${format(right[point - 1])} ${format(right[point - 2])} ${format(right[point - 3])}`;
  }
  jet.setAttribute('d', `${path} Z`);
}

function renderSplash(elapsed) {
  const clamp = value => Math.max(0, Math.min(1, value));
  const easeOut = value => 1 - Math.pow(1 - value, 2);
  const flight = easeOut(clamp(elapsed / 960));
  const settle = easeOut(clamp((elapsed - 960) / 420));
  const cupLift = elapsed < 960 ? 230 - 242 * flight : -12 * (1 - settle);
  const cupDrift = elapsed < 960 ? 28 - 32 * flight : -4 * (1 - settle);
  const cupTilt = elapsed < 960 ? -11 + 15 * flight : 4 * (1 - settle);
  const cupTransform = `translate(${cupDrift.toFixed(2)} ${cupLift.toFixed(2)}) rotate(${cupTilt.toFixed(2)} 150 225)`;
  splashArt.setAttribute('transform', cupTransform);
  splashMaskArt.setAttribute('transform', cupTransform);
  waterMotion.setAttribute('transform', cupTransform);

  // The streams stretch and bend on every frame; they are not a reveal of the final picture.
  waterJets.forEach((jet, index) => {
    const spec = waterJetSpecs[index];
    renderWaterJet(jet, spec, clamp((elapsed - spec.start) / spec.duration), index);
  });
  const frozen = elapsed >= 2000;
  splashArt.setAttribute('visibility', frozen ? 'hidden' : 'visible');
  waterMotion.setAttribute('visibility', frozen ? 'hidden' : 'visible');
  splashFinal.setAttribute('visibility', frozen ? 'visible' : 'hidden');

  const dropHeights = [15, 30, 54, 65, 83, 104, 135, 130];
  const dropDrift = [34, 8, 50, 24, -12, 42, 10, -5];
  splashDrops.forEach((drop, index) => {
    const lift = 151 - dropHeights[index];
    const start = 720 + lift / 151 * 120;
    const duration = 670 + lift / 151 * 370;
    const progress = easeOut(clamp((elapsed - start) / duration));
    drop.setAttribute('transform', `translate(${((1 - progress) * dropDrift[index]).toFixed(2)} ${((1 - progress) * lift).toFixed(2)})`);
    drop.style.opacity = progress > 0 ? '1' : '0';
  });
}

function animateSplash() {
  const started = performance.now();
  const tick = now => {
    const elapsed = Math.min(2000, now - started);
    renderSplash(elapsed);
    if (elapsed < 2000) splashFrame = window.requestAnimationFrame(tick);
  };
  splashFrame = window.requestAnimationFrame(tick);
}

function stopSequence() {
  phaseTimers.forEach(window.clearTimeout);
  phaseTimers = [];
  if (progressFrame) window.cancelAnimationFrame(progressFrame);
  if (splashFrame) window.cancelAnimationFrame(splashFrame);
}
function phase(name) {
  $('#splashPhone').className = `phone phone-splash phase-${name}`;
}
function animateProgress() {
  const started = performance.now();
  const duration = 3400;
  const tick = now => {
    const ratio = Math.min(1, (now - started) / duration);
    setProgress(Math.round(ratio * 100));
    renderStir(ratio);
    if (ratio < 1) progressFrame = window.requestAnimationFrame(tick);
  };
  progressFrame = window.requestAnimationFrame(tick);
}
function playSequence() {
  stopSequence();
  if (introComplete) return;
  if (document.hidden) return;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  if (reducedMotion.matches) {
    setProgress(100);
    renderStir(1);
    renderSplash(2000);
    phase('reveal');
    introComplete = true;
    document.body.classList.remove('intro-active');
    return;
  }
  document.body.classList.add('intro-active');
  phase('loading');
  setProgress(0);
  renderStir(0);
  animateProgress();
  phaseTimers.push(window.setTimeout(() => {
    setProgress(100);
    renderStir(1);
    renderSplash(0);
    phase('reveal');
    animateSplash();
    introComplete = true;
    document.body.classList.remove('intro-active');
  }, 3500));
}

function showToast(message) {
  const toast = $('#phoneToast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}
function addToBag(id) {
  state.orderReceipt = null;
  state.bag.set(id, (state.bag.get(id) || 0) + 1);
  renderBag();
  openBag();
}
function changeQty(id, delta) {
  const count = (state.bag.get(id) || 0) + delta;
  if (count <= 0) state.bag.delete(id); else state.bag.set(id, count);
  renderBag();
}
function renderBag() {
  const entries = [...state.bag.entries()];
  const count = entries.reduce((sum, [,qty]) => sum + qty, 0);
  $('#bagCount').textContent = count;
  $('#bagCount').hidden = count === 0;
  $('#bagTotal').textContent = money(entries.reduce((sum, [id,qty]) => sum + drinks.find(d => d.id === id).price * qty, 0));
  if (state.orderReceipt) {
    $('#bagItems').innerHTML = `<div class="order-complete"><span class="order-check">✓</span><h3>${tr('orderComplete')}</h3><strong>${money(state.orderReceipt.total)}</strong><p>${tr('orderCompleteNote')}</p><button type="button" data-back-menu>${tr('backToMenu')}</button></div>`;
    $('#bagFooter').hidden = true;
    return;
  }
  $('#bagFooter').hidden = false;
  $('#confirmOrder').disabled = count === 0;
  $('#bagItems').innerHTML = entries.length ? entries.map(([id, qty]) => {
    const drink = drinks.find(d => d.id === id);
    const [title, script] = tr('drinks')[drinks.indexOf(drink)];
    return `<div class="bag-item"><svg aria-hidden="true"><use href="#${drink.icon}"/></svg><div class="bag-item-info"><strong>${title} ${script}</strong><small>${money(drink.price)}</small><div class="qty"><button type="button" data-qty="${id}" data-delta="-1" aria-label="- ${title}"><svg><use href="#i-minus"/></svg></button><span>${qty}</span><button type="button" data-qty="${id}" data-delta="1" aria-label="+ ${title}"><svg><use href="#i-plus"/></svg></button></div></div><strong>${money(drink.price * qty)}</strong></div>`;
  }).join('') : `<p class="bag-empty">${tr('emptyBag')}</p>`;
}
function confirmOrder() {
  if (!state.bag.size) return;
  state.orderReceipt = { total: [...state.bag].reduce((sum, [id, qty]) => sum + drinks.find(drink => drink.id === id).price * qty, 0) };
  state.bag.clear();
  renderBag();
}
function openBag() {
  closeLoyalty(false);
  closeMedia(false);
  closeQR(false);
  $('#bagSheet').classList.add('open');
  $('#bagSheet').inert = false;
  $('#bagSheet').setAttribute('aria-hidden', 'false');
  syncNav();
  $('#closeBag').focus({ preventScroll: true });
}
function closeBag(restoreFocus = true) {
  const wasOpen = $('#bagSheet').classList.contains('open');
  $('#bagSheet').classList.remove('open');
  $('#bagSheet').inert = true;
  $('#bagSheet').setAttribute('aria-hidden', 'true');
  syncNav();
  if (wasOpen && restoreFocus) $('#bagNav').focus({ preventScroll: true });
}
function openLoyalty() {
  if ($('#bagSheet').classList.contains('open')) closeBag(false);
  closeMedia(false);
  closeQR(false);
  $('#loyaltySheet').classList.add('open');
  $('#loyaltySheet').inert = false;
  $('#loyaltySheet').setAttribute('aria-hidden', 'false');
  syncNav();
  $('#closeLoyalty').focus({ preventScroll: true });
}
function closeLoyalty(restoreFocus = true) {
  $('#loyaltySheet').classList.remove('open');
  $('#loyaltySheet').inert = true;
  $('#loyaltySheet').setAttribute('aria-hidden', 'true');
  syncNav();
  if (restoreFocus) $('#loyaltyNav').focus({ preventScroll: true });
}
function updateMedia() {
  const drink = drinks.find(item => item.id === state.activeMedia);
  if (!drink) return;
  const index = drinks.indexOf(drink);
  const [title, script] = tr('drinks')[index];
  $('#mediaTitle').textContent = `${title} ${script}`;
  $('#mediaNote').textContent = tr('drinkNotes')[index];
  $('#mediaPhoto').src = `assets/${drink.photo}`;
  $('#mediaPhoto').alt = `${tr('samplePhoto')}: ${title} ${script}`;
  $('#mediaVideo').poster = `assets/${drink.poster}`;
  const videoPath = `assets/${drink.video}`;
  if ($('#mediaVideo').getAttribute('src') !== videoPath) $('#mediaVideo').src = videoPath;
  $('#photoCredit').href = drink.photoSource;
  $('#videoCredit').href = drink.videoSource;
  $('#addFromMedia').setAttribute('aria-label', `${tr('order')}: ${title} ${script}`);
}
function openMedia(id, opener) {
  if ($('#bagSheet').classList.contains('open')) closeBag();
  closeLoyalty(false);
  closeQR(false);
  state.activeMedia = id;
  mediaOpener = opener;
  updateMedia();
  $('#mediaSheet').classList.add('open');
  $('#mediaSheet').inert = false;
  $('#mediaSheet').setAttribute('aria-hidden', 'false');
  $('#closeMedia').focus({ preventScroll: true });
}
function closeMedia(restoreFocus = true) {
  const wasOpen = $('#mediaSheet').classList.contains('open');
  $('#mediaVideo').pause();
  $('#mediaVideo').removeAttribute('src');
  $('#mediaVideo').load();
  $('#mediaSheet').classList.remove('open');
  $('#mediaSheet').inert = true;
  $('#mediaSheet').setAttribute('aria-hidden', 'true');
  state.activeMedia = null;
  if (wasOpen && restoreFocus && mediaOpener?.isConnected) mediaOpener.focus({ preventScroll: true });
}
function openQR() {
  if ($('#bagSheet').classList.contains('open')) closeBag();
  closeLoyalty(false);
  closeMedia(false);
  $('#qrSheet').classList.add('open');
  $('#qrSheet').inert = false;
  $('#qrSheet').setAttribute('aria-hidden', 'false');
  $('#closeQR').focus({ preventScroll: true });
}
function closeQR(restoreFocus = true) {
  const wasOpen = $('#qrSheet').classList.contains('open');
  $('#qrSheet').classList.remove('open');
  $('#qrSheet').inert = true;
  $('#qrSheet').setAttribute('aria-hidden', 'true');
  if (wasOpen && restoreFocus) $('#qrButton').focus({ preventScroll: true });
}

$('#languageToggle').addEventListener('click', () => { state.lang = state.lang === 'es' ? 'en' : 'es'; translate(); });
function showMenu(updateHash = true) {
  document.body.classList.add('menu-active');
  if (updateHash) history.replaceState(null, '', '#menu');
}
function showIntro() {
  closeBag(false);
  closeLoyalty(false);
  closeMedia(false);
  closeQR(false);
  document.body.classList.remove('menu-active');
  history.replaceState(null, '', location.pathname + location.search);
}
$('#splashArrow').addEventListener('click', () => showMenu());
$('#bellButton').addEventListener('click', () => showToast(tr('waiterDemo')));
async function copyPaymentNumber() {
  let copied = false;
  try {
    await navigator.clipboard.writeText(samplePaymentNumber);
    copied = true;
  } catch {
    const field = document.createElement('textarea');
    field.value = samplePaymentNumber;
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(field);
    field.select();
    try { copied = document.execCommand('copy'); } catch {}
    field.remove();
  }
  if (!copied) { showToast(tr('copyFailed')); return; }
  const button = $('#copyPayment');
  button.classList.remove('copied');
  void button.offsetWidth;
  button.classList.add('copied');
  button.setAttribute('aria-label', tr('copied'));
  $('#copyLabel').textContent = tr('copied');
  showToast(tr('paymentCopied'));
  window.clearTimeout(paymentCopyTimer);
  paymentCopyTimer = window.setTimeout(() => {
    button.classList.remove('copied');
    button.setAttribute('aria-label', tr('copyNumber'));
    $('#copyLabel').textContent = tr('copyNumber');
  }, 1900);
}
$('#copyPayment').addEventListener('click', copyPaymentNumber);
$('#qrButton').addEventListener('click', openQR);
$('#closeQR').addEventListener('click', () => closeQR());
$('#closeMedia').addEventListener('click', () => closeMedia());
$('#addFromMedia').addEventListener('click', () => {
  const id = state.activeMedia;
  closeMedia(false);
  if (id) addToBag(id);
});
$('#loyaltyNav').addEventListener('click', openLoyalty);
$('#closeLoyalty').addEventListener('click', () => closeLoyalty());
function switchMainView(favoritesOnly) {
  closeBag(false);
  closeLoyalty(false);
  closeMedia(false);
  closeQR(false);
  state.favoritesOnly = favoritesOnly;
  renderCards();
}
$('#favoritesNav').addEventListener('click', () => switchMainView(true));
$('#homeNav').addEventListener('click', () => switchMainView(false));
$('#showAll').addEventListener('click', () => switchMainView(false));
$('#exploreFromFavorites').addEventListener('click', () => switchMainView(false));
$('#bagNav').addEventListener('click', openBag);
$('#closeBag').addEventListener('click', closeBag);
$('#confirmOrder').addEventListener('click', confirmOrder);
$('#cardsTrack').addEventListener('click', event => {
  const preview = event.target.closest('[data-preview]');
  if (preview) { openMedia(preview.dataset.preview, preview); return; }
  const favorite = event.target.closest('[data-favorite]');
  const order = event.target.closest('[data-order]');
  if (favorite) {
    state.favorites.has(favorite.dataset.favorite) ? state.favorites.delete(favorite.dataset.favorite) : state.favorites.add(favorite.dataset.favorite);
    try { localStorage.setItem('brew-bliss-favorites', JSON.stringify([...state.favorites])); } catch {}
    renderCards();
  }
  if (order) addToBag(order.dataset.order);
});
$('#bagItems').addEventListener('click', event => {
  if (event.target.closest('[data-back-menu]')) { closeBag(); return; }
  const button = event.target.closest('[data-qty]');
  if (button) changeQty(button.dataset.qty, Number(button.dataset.delta));
});
$('#cardsViewport').addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') carouselHover = true; });
$('#cardsViewport').addEventListener('pointerleave', () => { carouselHover = false; carouselHoldUntil = Date.now() + 1500; });
$('#cardsViewport').addEventListener('pointerdown', event => { if (event.pointerType !== 'touch') pointerStart = event.clientX; carouselHoldUntil = Date.now() + 6000; });
$('#cardsViewport').addEventListener('pointerup', event => {
  if (pointerStart === null) return;
  const delta = event.clientX - pointerStart;
  pointerStart = null;
  carouselHoldUntil = Date.now() + 6000;
  if (Math.abs(delta) > 35 && !state.favoritesOnly) advanceCard(delta < 0 ? 1 : -1);
});
let cardTouchX = null;
$('#cardsViewport').addEventListener('touchstart', event => { if (event.touches.length === 1) cardTouchX = event.touches[0].clientX; carouselHoldUntil = Date.now() + 6000; }, { passive: true });
$('#cardsViewport').addEventListener('touchend', event => {
  if (cardTouchX === null || !event.changedTouches.length) return;
  const delta = event.changedTouches[0].clientX - cardTouchX;
  cardTouchX = null;
  if (Math.abs(delta) > 35 && !state.favoritesOnly) advanceCard(delta < 0 ? 1 : -1);
}, { passive: true });
let stagePointer = null;
function handleStageSwipe(dx, dy) {
  if (!introComplete) return;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (dx < 0 && !document.body.classList.contains('menu-active')) showMenu();
  if (dx > 0 && document.body.classList.contains('menu-active')) showIntro();
}
$('.stage').addEventListener('pointerdown', event => { if (event.pointerType !== 'touch' && !event.target.closest('#cardsViewport, .bag-sheet, .loyalty-sheet, .media-sheet, .qr-sheet')) stagePointer = { x: event.clientX, y: event.clientY }; });
$('.stage').addEventListener('pointerup', event => {
  if (!stagePointer) return;
  handleStageSwipe(event.clientX - stagePointer.x, event.clientY - stagePointer.y);
  stagePointer = null;
});
let stageTouch = null;
$('.stage').addEventListener('touchstart', event => { if (event.touches.length === 1 && !event.target.closest('#cardsViewport, .bag-sheet, .loyalty-sheet, .media-sheet, .qr-sheet')) stageTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
$('.stage').addEventListener('touchend', event => { if (!stageTouch || !event.changedTouches.length) return; handleStageSwipe(event.changedTouches[0].clientX - stageTouch.x, event.changedTouches[0].clientY - stageTouch.y); stageTouch = null; }, { passive: true });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if ($('#mediaSheet').classList.contains('open')) closeMedia();
  else if ($('#qrSheet').classList.contains('open')) closeQR();
  else if ($('#bagSheet').classList.contains('open')) closeBag();
  else if ($('#loyaltySheet').classList.contains('open')) closeLoyalty();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopSequence(); if (introComplete) renderSplash(2000); } else if (!introComplete) playSequence(); });
window.addEventListener('resize', () => setTrackPosition(true));
reducedMotion.addEventListener('change', () => { playSequence(); startCarousel(); });
$('#bagSheet').inert = true;
$('#loyaltySheet').inert = true;
$('#mediaSheet').inert = true;
$('#qrSheet').inert = true;
translate();
startCarousel();
// A shared #menu URL must still begin with the full coffee animation.
if (location.hash === '#menu') history.replaceState(null, '', location.pathname + location.search);
playSequence();
