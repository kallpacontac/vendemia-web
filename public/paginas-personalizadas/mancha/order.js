const orderCatalogue = [
  { id: 'clasica', name: 'La de siempre', price: 15, group: 'Burgers' },
  { id: 'chicken', name: 'Chick’n Crunch', price: 22, group: 'Burgers' },
  { id: 'gringa', name: 'Gringa', price: 22, group: 'Burgers' },
  { id: 'mahalo', name: 'Mahalo', price: 25, group: 'Burgers' },
  { id: 'baconjam', name: 'Bacon Jam', price: 25, group: 'Burgers' },
  { id: 'power', name: 'La Power', price: 21, group: 'Antojos' },
  { id: 'papas', name: 'Papas Huamantanga', price: 10, group: 'Antojos' },
  { id: 'chicha', name: 'Chicha morada', price: null, group: 'Bebidas' }
];

const orderOverlay = document.querySelector('#order-overlay');
const orderMenu = document.querySelector('#order-menu');
const orderClose = document.querySelector('#order-close');
const orderCount = document.querySelector('#order-count');
const orderTotal = document.querySelector('#order-total');
const orderPriceNote = document.querySelector('#order-price-note');
const orderError = document.querySelector('#order-error');
const pickupDetail = document.querySelector('#pickup-detail');
const deliveryDetail = document.querySelector('#delivery-detail');
const deliveryAddress = document.querySelector('#delivery-address');
const orderName = document.querySelector('#order-name');
const orderWhen = document.querySelector('#order-when');
const orderNotes = document.querySelector('#order-notes');
const quantities = new Map();
let previousFocus = null;

const money = amount => `S/ ${amount}`;
const quantityFor = id => quantities.get(id) || 0;
const selectedItems = () => orderCatalogue.filter(item => quantityFor(item.id) > 0);
const fulfillment = () => document.querySelector('input[name="fulfillment"]:checked').value;

function renderOrder() {
  orderMenu.innerHTML = ['Burgers', 'Antojos', 'Bebidas'].map(group => {
    const rows = orderCatalogue.filter(item => item.group === group).map(item => `
      <div class="order-menu-row">
        <div><strong>${item.name}</strong><small>${item.price === null ? 'Precio por confirmar' : money(item.price)}</small></div>
        <div class="order-quantity">
          <button type="button" data-minus-item="${item.id}" aria-label="Quitar una unidad de ${item.name}" ${quantityFor(item.id) ? '' : 'disabled'}>−</button>
          <span aria-label="${quantityFor(item.id)} ${quantityFor(item.id) === 1 ? 'unidad' : 'unidades'}">${quantityFor(item.id)}</span>
          <button type="button" data-add-item="${item.id}" aria-label="Agregar una unidad de ${item.name}">+</button>
        </div>
      </div>`).join('');
    return `<section class="order-menu-group"><h3>${group}</h3>${rows}</section>`;
  }).join('');

  const count = selectedItems().reduce((sum, item) => sum + quantityFor(item.id), 0);
  const subtotal = selectedItems().reduce((sum, item) => sum + (item.price || 0) * quantityFor(item.id), 0);
  const hasUnpriced = selectedItems().some(item => item.price === null);
  orderCount.textContent = String(count);
  orderCount.hidden = count === 0;
  orderTotal.textContent = count === 0 ? 'Elige algo de la carta' : subtotal ? `Subtotal de productos: ${money(subtotal)}` : 'Subtotal por confirmar';
  const pending = [hasUnpriced ? 'el precio de la bebida' : null, fulfillment() === 'delivery' ? 'el costo de envío' : null].filter(Boolean);
  orderPriceNote.textContent = pending.length
    ? `${pending.join(' y ').replace(/^./, letter => letter.toUpperCase())} ${pending.length > 1 ? 'se confirman' : 'se confirma'} por WhatsApp antes de preparar el pedido.`
    : 'Confirmaremos disponibilidad y tiempo estimado por WhatsApp.';
}

function showError(message) {
  orderError.textContent = message;
  orderError.hidden = !message;
}

function openOrder() {
  if (!orderOverlay.hidden) return;
  previousFocus = document.activeElement;
  orderOverlay.hidden = false;
  document.body.classList.add('order-open');
  showError('');
  renderOrder();
  orderClose.focus();
}

function closeOrder() {
  orderOverlay.hidden = true;
  document.body.classList.remove('order-open');
  showError('');
  previousFocus?.focus();
}

function changeQuantity(id, delta) {
  if (!orderCatalogue.some(item => item.id === id)) return;
  quantities.set(id, Math.max(0, Math.min(99, quantityFor(id) + delta)));
  showError('');
  renderOrder();
}

document.addEventListener('click', event => {
  const add = event.target.closest('[data-add-item]');
  if (add) {
    const wasOpen = !orderOverlay.hidden;
    changeQuantity(add.dataset.addItem, 1);
    if (!wasOpen) openOrder();
    else orderMenu.querySelector(`[data-add-item="${add.dataset.addItem}"]`)?.focus();
    return;
  }
  const minus = event.target.closest('[data-minus-item]');
  if (minus) {
    changeQuantity(minus.dataset.minusItem, -1);
    orderMenu.querySelector(`[data-minus-item="${minus.dataset.minusItem}"]`)?.focus();
    return;
  }
  if (event.target.closest('[data-open-order]')) openOrder();
});

orderClose.addEventListener('click', closeOrder);
orderOverlay.addEventListener('click', event => { if (event.target === orderOverlay) closeOrder(); });
document.addEventListener('keydown', event => {
  if (orderOverlay.hidden) return;
  if (event.key === 'Escape') { closeOrder(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...orderOverlay.querySelectorAll('button, input, textarea, a[href]')]
    .filter(element => !element.disabled && element.getClientRects().length);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

document.querySelectorAll('input[name="fulfillment"]').forEach(input => input.addEventListener('change', () => {
  const delivery = fulfillment() === 'delivery';
  pickupDetail.hidden = delivery;
  deliveryDetail.hidden = !delivery;
  deliveryAddress.required = delivery;
  showError('');
  renderOrder();
}));

document.querySelector('#order-send').addEventListener('click', () => {
  const selected = selectedItems();
  if (!selected.length) { showError('Elige al menos un producto de la carta.'); return; }
  if (fulfillment() === 'delivery' && !deliveryAddress.value.trim()) {
    showError('Escribe la dirección para consultar el delivery.');
    deliveryAddress.focus();
    return;
  }

  const subtotal = selected.reduce((sum, item) => sum + (item.price || 0) * quantityFor(item.id), 0);
  const lines = ['Hola, quiero hacer un pedido en Mancha:', ''];
  selected.forEach(item => lines.push(`• ${quantityFor(item.id)} × ${item.name} — ${item.price === null ? 'precio por confirmar' : money(item.price * quantityFor(item.id))}`));
  lines.push('', subtotal ? `Subtotal de productos con precio publicado: ${money(subtotal)}` : 'Precios por confirmar');
  lines.push(fulfillment() === 'pickup'
    ? 'Modalidad: recojo en tienda (Jr. Diego de Almagro 501, Jesús María)'
    : `Modalidad: delivery\nDirección: ${deliveryAddress.value.trim()}`);
  if (orderName.value.trim()) lines.push(`Nombre: ${orderName.value.trim()}`);
  if (orderWhen.value.trim()) lines.push(`Para: ${orderWhen.value.trim()}`);
  if (orderNotes.value.trim()) lines.push(`Notas: ${orderNotes.value.trim()}`);
  lines.push('', '¿Me confirman disponibilidad, tiempo estimado y total final?');
  const link = document.createElement('a');
  link.href = `https://wa.me/51961818343?text=${encodeURIComponent(lines.join('\n'))}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
});

renderOrder();
