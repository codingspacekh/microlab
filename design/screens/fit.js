// Fits the circuit (the 692×820 stage) to the canvas, as the app's "Fit to window" does (F-17).
function fitStages() {
  document.querySelectorAll('.canvas').forEach((c) => {
    const st = c.querySelector('.stage');
    if (!st) return;
    const k = Math.min(c.clientWidth / 692, c.clientHeight / 820, 1.25);
    st.style.transform = `translate(-50%, -50%) scale(${k.toFixed(3)})`;
    const z = c.querySelector('.zoom');
    if (z) z.textContent = Math.round(k * 100) + '%';
  });
}
addEventListener('load', fitStages);
addEventListener('resize', fitStages);
