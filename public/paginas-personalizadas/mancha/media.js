const galleryCatalogue = {
  clasica: { name: 'La de siempre', photos: ['burger-clasica.webp', 'burger-clasica-detail.webp'], video: 'demo-burger-grill', source: 'https://www.pexels.com/video/close-up-view-of-delicious-grilled-burger-4131833/' },
  chicken: { name: 'Chick’n Crunch', photos: ['burger-chicken.webp', 'burger-chicken-detail.webp'], video: 'demo-chicken', source: 'https://www.pexels.com/video/a-sandwich-and-fries-on-a-plate-20416794/' },
  gringa: { name: 'Gringa', photos: ['burger-gringa.webp', 'burger-gringa-poster.webp'], video: 'demo-burger-close', source: 'https://www.pexels.com/video/close-up-shot-of-a-delicious-hamburger-5920544/' },
  mahalo: { name: 'Mahalo', photos: ['burger-mahalo.webp', 'burger-mahalo-poster.webp'], video: 'demo-burger-close', source: 'https://www.pexels.com/video/close-up-shot-of-a-delicious-hamburger-5920544/' },
  baconjam: { name: 'Bacon Jam', photos: ['burger-baconjam.webp', 'burger-baconjam-poster.webp'], video: 'demo-burger-close', source: 'https://www.pexels.com/video/close-up-shot-of-a-delicious-hamburger-5920544/' },
  power: { name: 'La Power', photos: ['salchipapas.webp', 'salchipapas-detail.webp'], video: 'demo-fries', source: 'https://www.pexels.com/video/close-up-view-of-french-fries-7490594/' },
  papas: { name: 'Papas Huamantanga', photos: ['papas.webp', 'papas-detail.webp'], video: 'demo-fries', source: 'https://www.pexels.com/video/close-up-view-of-french-fries-7490594/' },
  chicha: { name: 'Chicha morada', photos: ['chicha.webp', 'chicha-detail.webp'], video: 'demo-drink', source: 'https://www.pexels.com/video/a-person-pouring-purple-liquid-into-a-glass-9223178/' }
};

const mediaOverlay = document.querySelector('#media-overlay');
const mediaClose = document.querySelector('#media-close');
const mediaTitle = document.querySelector('#media-title');
const mediaStage = document.querySelector('#media-stage');
const mediaThumbs = document.querySelector('#media-thumbs');
const mediaNote = document.querySelector('#media-note');
const mediaSource = document.querySelector('#media-source');
let currentGallery = null;
let currentMedia = 0;
let mediaPreviousFocus = null;

function showMedia(index) {
  if (!currentGallery) return;
  currentMedia = (index + 3) % 3;
  const item = galleryCatalogue[currentGallery];
  mediaStage.querySelector('video')?.pause();
  mediaStage.replaceChildren();

  if (currentMedia < item.photos.length) {
    const photo = document.createElement('img');
    photo.src = `./assets/${item.photos[currentMedia]}`;
    photo.alt = `${item.name}, fotografía ${currentMedia + 1} de Mancha`;
    mediaStage.append(photo);
    mediaNote.textContent = 'Fotografía de Mancha Burger Studio.';
    mediaSource.hidden = true;
  } else {
    const video = document.createElement('video');
    video.src = `./assets/${item.video}.mp4`;
    video.poster = `./assets/${item.video}-preview.webp`;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', `Video de referencia para ${item.name}`);
    mediaStage.append(video);
    mediaNote.textContent = 'Video de referencia para esta demo. El producto del clip no es de Mancha.';
    mediaSource.href = item.source;
    mediaSource.hidden = false;
  }

  [...mediaThumbs.children].forEach((thumb, thumbIndex) => {
    thumb.setAttribute('aria-pressed', String(thumbIndex === currentMedia));
    thumb.classList.toggle('active', thumbIndex === currentMedia);
  });
}

function openGallery(id) {
  const item = galleryCatalogue[id];
  if (!item) return;
  mediaPreviousFocus = document.activeElement;
  currentGallery = id;
  mediaTitle.textContent = item.name;
  mediaThumbs.replaceChildren();

  [...item.photos, `${item.video}-preview.webp`].forEach((filename, index) => {
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'media-thumb';
    thumb.setAttribute('aria-label', index === 2 ? 'Ver video de referencia' : `Ver foto ${index + 1}`);
    const img = document.createElement('img');
    img.src = `./assets/${filename}`;
    img.alt = '';
    thumb.append(img);
    if (index === 2) {
      const play = document.createElement('span');
      play.className = 'media-play';
      play.textContent = '▶';
      play.setAttribute('aria-hidden', 'true');
      thumb.append(play);
    }
    thumb.addEventListener('click', () => showMedia(index));
    mediaThumbs.append(thumb);
  });

  mediaOverlay.hidden = false;
  document.body.classList.add('media-open');
  showMedia(0);
  mediaClose.focus();
}

function closeGallery() {
  if (mediaOverlay.hidden) return;
  mediaStage.querySelector('video')?.pause();
  mediaStage.replaceChildren();
  mediaOverlay.hidden = true;
  document.body.classList.remove('media-open');
  currentGallery = null;
  mediaPreviousFocus?.focus();
}

document.addEventListener('click', event => {
  const opener = event.target.closest('[data-gallery-open]');
  if (opener) openGallery(opener.dataset.galleryOpen);
});
mediaClose.addEventListener('click', closeGallery);
mediaOverlay.addEventListener('click', event => { if (event.target === mediaOverlay) closeGallery(); });
document.addEventListener('keydown', event => {
  if (mediaOverlay.hidden) return;
  if (event.key === 'Escape') { closeGallery(); return; }
  if (event.key === 'ArrowRight') { showMedia(currentMedia + 1); return; }
  if (event.key === 'ArrowLeft') { showMedia(currentMedia - 1); return; }
  if (event.key !== 'Tab') return;
  const focusable = [mediaClose, ...mediaThumbs.children, ...(mediaSource.hidden ? [] : [mediaSource])];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
