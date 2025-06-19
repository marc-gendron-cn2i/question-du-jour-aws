// tooltip.js
const aboutEl = document.querySelector('.about');

function openTooltip() {
  aboutEl.classList.add('show-tooltip');
  localStorage.setItem('tooltipShown', 'true');
}

function closeTooltip() {
  aboutEl.classList.remove('show-tooltip');
  localStorage.setItem('tooltipShown', 'false');
}

['mouseenter', 'focus'].forEach(evt => aboutEl.addEventListener(evt, openTooltip));
['mouseleave', 'blur'].forEach(evt => aboutEl.addEventListener(evt, closeTooltip));

aboutEl.addEventListener('click', () => {
  const shown = aboutEl.classList.toggle('show-tooltip');
  localStorage.setItem('tooltipShown', shown ? 'true' : 'false');
});

if (localStorage.getItem('tooltipShown') === 'true') {
  aboutEl.classList.add('show-tooltip');
}
