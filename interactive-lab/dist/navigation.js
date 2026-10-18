const destinations = [
  ['courses', '课程', './index.html'],
  ['daily', '每日路径', './index.html#daily-path'],
  ['speech', '语音教练', './practice.html'],
  ['singing', '唱歌练习', './practice.html?mode=sing'],
  ['lab', '实验室', './lab.html'],
];

function currentDestination() {
  const page = location.pathname.split('/').pop();
  if (page === 'lab.html') return 'lab';
  if (page === 'practice.html') return new URLSearchParams(location.search).get('mode') === 'sing' ? 'singing' : 'speech';
  if ((!page || page === 'index.html') && location.hash === '#daily-path') return 'daily';
  return 'courses';
}

const navigation = document.querySelector('.site-navigation');
if (navigation) {
  navigation.replaceChildren(...destinations.map(([id, label, href]) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.dataset.destination = id;
    return link;
  }));
  const updateCurrent = () => {
    const current = currentDestination();
    for (const link of navigation.children) {
      if (link.dataset.destination === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  };
  updateCurrent();
  window.addEventListener('hashchange', updateCurrent);
  window.addEventListener('popstate', updateCurrent);
  window.addEventListener('pageshow', updateCurrent);
}
