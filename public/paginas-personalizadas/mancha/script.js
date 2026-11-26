const hero = document.querySelector('.hero-scroll');
const logo = document.querySelector('.hero-logo-wrap');
const mascot = document.querySelector('#flying-mascot');
const speech = mascot.querySelector('.mascot-speech');
const status = mascot.querySelector('.mascot-status');
const targets = [...document.querySelectorAll('[data-mascot-target]')];
const header = document.querySelector('#site-header');
const menu = document.querySelector('#carta');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let ticking = false;
let currentPose = 'original';

const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);

function setPose(next, food = 'burger') {
  if (next === currentPose && mascot.dataset.food === food) return;
  mascot.classList.toggle('is-pointing', next === 'point');
  mascot.classList.toggle('is-eating', next === 'eat');
  mascot.dataset.food = food;
  currentPose = next;
  status.textContent = next === 'eat' ? (food === 'drink' ? '¡GLUP! ✳' : '¡ÑAM! ✳') : 'MIRA ESTO ↗';
}

function nearestProduct(viewport) {
  const candidates = targets.map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > 90 && rect.top < viewport * .92);
  candidates.sort((a, b) => Math.abs((a.rect.top + a.rect.bottom) / 2 - viewport * .49) - Math.abs((b.rect.top + b.rect.bottom) / 2 - viewport * .49));
  return candidates[0] || null;
}

function renderScroll() {
  ticking = false;
  const viewport = window.innerHeight;
  const width = window.innerWidth;
  const heroTravel = Math.max(1, hero.offsetHeight - viewport);
  const progress = clamp(window.scrollY / heroTravel);
  const meltProgress = reduceMotion.matches ? 0 : progress;
  [[.08, .62], [.18, .62], [.28, .60], [.38, .57], [.48, .46]].forEach(([start, length], index) => {
    logo.style.setProperty(`--melt-${index + 1}`, ease(clamp((meltProgress - start) / length)).toFixed(3));
  });
  logo.style.setProperty('--melt-drops', ease(clamp((meltProgress - .78) / .18)).toFixed(3));
  const menuRect = menu.getBoundingClientRect();
  const inMenu = menuRect.top < viewport * .78 && menuRect.bottom > 80;
  const onRed = menuRect.top < 85 && menuRect.bottom > 85;
  const mobile = width < 760;
  const size = mascot.offsetWidth;
  header.classList.toggle('on-red', onRed);
  mascot.classList.toggle('in-menu', inMenu);

  if (reduceMotion.matches) {
    logo.style.transform = '';
    logo.style.opacity = '1';
    speech.style.opacity = progress < .4 ? '1' : '0';
    const active = inMenu ? nearestProduct(viewport) : null;
    setPose(inMenu && active ? 'eat' : inMenu ? 'point' : 'original', active?.element.dataset.food || 'burger');
    mascot.style.opacity = menuRect.bottom <= viewport ? '0' : '1';
    mascot.style.transform = `translate(${inMenu ? width * .035 : width * .65}px, ${active ? clamp((active.rect.top + active.rect.bottom) / 2 - size / 2, 95, viewport - size - 20) : viewport * .27}px)`;
    return;
  }

  const logoMove = ease(clamp((progress - .45) / .5));
  logo.style.transform = `translateY(${mix(0, -viewport * .03, logoMove)}px) scale(${mix(1, 1.03, logoMove)})`;
  logo.style.opacity = '1';
  speech.style.opacity = String(1 - ease(clamp((progress - .17) / .23)));

  const depart = ease(clamp((progress - .11) / .78));
  const approach = ease(clamp((viewport - menuRect.top) / (viewport * .72)));
  const heroX = mix(width * .62, width * (mobile ? .12 : .1), depart);
  const heroY = mix(viewport * (mobile ? .28 : .12), viewport * .6, depart);
  const active = inMenu ? nearestProduct(viewport) : null;
  const productY = active
    ? clamp((active.rect.top + active.rect.bottom) / 2 - size / 2, 100, Math.max(100, viewport - size - 18))
    : viewport * .52;
  const railX = width * (mobile ? .025 : .075);
  const x = mix(heroX, railX, approach);
  const y = mix(heroY, productY, approach);
  const tilt = mix(-18 * depart, 0, approach) + (active ? Math.sin(window.scrollY / 60) * 2 : 0);
  mascot.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
  // Finish the exit while the red menu still fills the viewport.
  mascot.style.opacity = String(clamp((menuRect.bottom - viewport) / (viewport * .15)));

  if (inMenu) {
    if (active) {
      const phase = clamp((viewport * .7 - active.rect.top) / (active.rect.height * .55 + viewport * .28));
      setPose(phase < .34 ? 'point' : 'eat', active.element.dataset.food || 'burger');
      active.element.classList.add('mascot-active');
      targets.forEach(target => { if (target !== active.element) target.classList.remove('mascot-active'); });
    } else {
      setPose('point');
    }
  } else {
    setPose(progress < .28 ? 'original' : 'point');
    targets.forEach(target => target.classList.remove('mascot-active'));
  }
}

function requestRender() {
  if (!ticking) { ticking = true; requestAnimationFrame(renderScroll); }
}

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } });
}, { threshold: .09, rootMargin: '0px 0px -30px 0px' });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
window.addEventListener('scroll', requestRender, { passive: true });
window.addEventListener('resize', requestRender);
reduceMotion.addEventListener('change', requestRender);
renderScroll();
