(() => {
  'use strict';

  const clips = [...document.querySelectorAll('.workshop-life-home .workshop-life-clip')].map(card => ({
    video: card.querySelector('video'),
    sound: card.querySelector('[data-workshop-life-sound]')
  }));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hasSound = video => !video.muted && video.volume > 0;

  function syncMotion() {
    for (const {video} of clips) {
      video.autoplay = !reducedMotion.matches;
      if (reducedMotion.matches) video.pause();
    }
  }

  function syncSound(clip) {
    const enabled = hasSound(clip.video);
    if (enabled) {
      for (const other of clips) {
        if (other !== clip) other.video.muted = true;
      }
    }
    clip.sound.setAttribute('aria-pressed', String(enabled));
    clip.sound.title = enabled ? 'Выключить звук' : 'Включить звук';
  }

  syncMotion();
  reducedMotion.addEventListener('change', syncMotion);
  for (const clip of clips) {
    const {video, sound} = clip;
    video.addEventListener('volumechange', () => syncSound(clip));
    sound.addEventListener('click', () => {
      const enableSound = !hasSound(video);
      video.muted = !enableSound;
      if (enableSound && video.volume === 0) video.volume = 1;
      if (enableSound) video.play().catch(() => {});
      syncSound(clip);
    });
    syncSound(clip);
    sound.hidden = false;
  }
})();
