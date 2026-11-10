(() => {
  const panels = [...document.querySelectorAll('[data-catalog-panel]')];
  const choices = document.querySelectorAll('[data-catalog-choice]');
  const player = document.querySelector('[data-catalog-video]');
  const video = player.querySelector('video');
  const sound = player.querySelector('.catalog-video-sound');
  const soundLabel = sound.querySelector('span');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function pausePreview() {
    video.pause();
    video.muted = true;
  }

  function updateSoundLabel() {
    const audible = !video.muted && video.volume > 0;
    sound.setAttribute('aria-pressed', String(audible));
    soundLabel.textContent = audible ? 'Выключить звук' : 'Включить звук';
  }

  video.addEventListener('volumechange', updateSoundLabel);
  sound.addEventListener('click', () => {
    const enableSound = video.muted || video.volume === 0;
    video.muted = !enableSound;
    if (enableSound && video.volume === 0) video.volume = 1;
    if (enableSound) video.play().catch(() => {});
    updateSoundLabel();
  });
  updateSoundLabel();
  sound.hidden = false;

  const previewObserver = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || player.closest('[hidden]')) {
      pausePreview();
      return;
    }
    if (!reducedMotion.matches && video.paused) video.play().catch(() => {});
  }, { threshold: 0.25 });
  previewObserver.observe(video);

  function selectFromLocation() {
    const target = document.getElementById(location.hash.slice(1));
    const selection = panels.includes(target) ? target : null;

    for (const panel of panels) {
      panel.hidden = panel !== selection;
      if (panel.hidden) {
        for (const player of panel.querySelectorAll('video[controls]')) player.pause();
      }
    }
    for (const choice of choices) {
      if (choice.hash === location.hash) choice.setAttribute('aria-current', 'location');
      else choice.removeAttribute('aria-current');
    }

    if (!selection?.contains(player)) pausePreview();
    if (selection) selection.focus({ preventScroll: true });
    if (target) target.scrollIntoView();
  }

  window.addEventListener('hashchange', selectFromLocation);
  selectFromLocation();
})();
