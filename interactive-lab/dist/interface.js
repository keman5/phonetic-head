// Layout interactions are independent of animation and audio state.
const tabs = [...document.querySelectorAll('.inspector-tabs [role="tab"]')];
export function showInspector(id, focus = false) {
  for (const tab of tabs) {
    const selected = tab.id === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && focus) tab.focus();
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => showInspector(tab.id));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    showInspector(tabs[next].id, true);
  });
});
const mobile = matchMedia('(max-width: 760px)');
const library = document.getElementById('sound-library');
function syncLibrary() { library.open = !mobile.matches; }
syncLibrary();
mobile.addEventListener('change', syncLibrary);
library.addEventListener('click', event => {
  if (mobile.matches && event.target.closest('[data-vowel]')) {
    library.open = false;
    library.querySelector('summary').focus({preventScroll: true});
  }
});
library.addEventListener('change', event => {
  if (mobile.matches && event.target.id === 'entry-select') {
    library.open = false;
    library.querySelector('summary').focus({preventScroll: true});
  }
});
