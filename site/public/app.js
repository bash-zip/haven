/* haven site — light/dark screenshot swap. */
'use strict';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* light/dark toggles: each .shot-stage swaps its own screenshots. */
document.querySelectorAll('.shot-stage').forEach(stage => {
  const shots = [...stage.querySelectorAll('.shot')];
  const toggles = [...stage.querySelectorAll('.tgl')];
  const show = i => {
    shots.forEach((img, k) => img.classList.toggle('is-on', k === i));
    toggles.forEach((btn, k) => btn.classList.toggle('is-on', k === i));
  };
  toggles.forEach((btn, i) => {
    btn.addEventListener('click', () => show(i));
    btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(i); });
  });
});
