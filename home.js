(() => {
  'use strict';

  const body = document.body;
  const video = document.querySelector('.p-hero-video');
  const hero = document.querySelector('.p-hero');
  const bloom = document.querySelector('.p-hero-bloom');
  const bloomContext = bloom?.getContext('2d',{alpha:true,willReadFrequently:true});
  const desktop = window.matchMedia('(min-width: 961px)');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const deviceGrid = document.querySelector('.p-device-grid');
  const deviceCards = [...document.querySelectorAll('.p-device-grid .p-device')];
  let videoVisible = true;
  let devicesVisible = false;
  let devicePointerFrame = 0;
  let activeDeviceCard = null;
  let devicePointer = null;
  let deviceBounds = null;
  let scrollFrame = 0;
  let playPending = false;
  let playAgain = false;
  let bloomFrame = 0;
  let lastBloom = 0;
  let bloomFailed = false;

  const motionAllowed = () => !preference.matches;
  if (video) {
    video.defaultMuted = true;
    video.muted = true;
    video.volume = 0;
  }


  // Reuse the decoded video for a low-rate glow BEHIND the sharp footage.
  const bloomEnabled = () => !bloomFailed && bloomContext && video && !video.paused && videoVisible && !document.hidden && motionAllowed() && desktop.matches;
  const drawBloom = timestamp => {
    bloomFrame = 0;
    if (!bloomEnabled()) return;
    if (video.readyState >= 2 && timestamp - lastBloom >= 100) {
      try {
        bloomContext.clearRect(0,0,bloom.width,bloom.height);
        bloomContext.drawImage(video,0,0,bloom.width,bloom.height);
        const frame = bloomContext.getImageData(0,0,bloom.width,bloom.height);
        // Only light spills into the backdrop; black pixels add no dark area.
        for (let i = 0; i < frame.data.length; i += 4) {
          frame.data[i + 3] = Math.max(frame.data[i],frame.data[i + 1],frame.data[i + 2]);
        }
        bloomContext.putImageData(frame,0,0);
        bloom.dataset.ready = 'true';
        lastBloom = timestamp;
      } catch {
        bloomFailed = true;
        bloom.removeAttribute('data-ready');
        return;
      }
    }
    bloomFrame = window.requestAnimationFrame(drawBloom);
  };
  const syncBloom = () => {
    if (!bloomEnabled()) {
      if (bloomFrame) window.cancelAnimationFrame(bloomFrame);
      bloomFrame = 0;
      return;
    }
    if (!bloomFrame) bloomFrame = window.requestAnimationFrame(drawBloom);
  };
  video?.addEventListener('playing',syncBloom);
  video?.addEventListener('pause',syncBloom);
  desktop.addEventListener('change',syncBloom);

  const syncVideo = () => {
    if (!video) return;
    if (!motionAllowed() || document.hidden || !videoVisible) {
      playAgain = false;
      video.pause();
      return;
    }
    if (playPending) {
      playAgain = true;
      return;
    }
    if (!video.paused) return;
    playPending = true;
    video.play().catch(() => {
      // The poster stays visible if autoplay is unavailable.
    }).finally(() => {
      playPending = false;
      if (!motionAllowed() || document.hidden || !videoVisible) video.pause();
      else if (playAgain && video.paused) {
        playAgain = false;
        syncVideo();
      }
    });
  };

  const updateScroll = () => {
    scrollFrame = 0;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const progress = height > 0 ? Math.min(1,Math.max(0,window.scrollY / height)) : 0;
    body.style.setProperty('--scroll-progress',String(progress));
    body.classList.toggle('p-scrolled',window.scrollY > 24);
    if (hero) {
      const drift = motionAllowed() && window.innerWidth > 960 ? Math.min(window.scrollY,hero.offsetHeight) * .09 : 0;
      hero.style.setProperty('--hero-drift',`${drift.toFixed(1)}px`);
    }
  };
  const scheduleScroll = () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScroll);
  };

  // The stage floats only while it is visible; pointer work is limited to one frame.
  const resetDevicePointer = () => {
    if (devicePointerFrame) window.cancelAnimationFrame(devicePointerFrame);
    devicePointerFrame = 0;
    if (activeDeviceCard) {
      ['--light-x','--light-y','--device-tilt-x','--device-tilt-y'].forEach(property => activeDeviceCard.style.removeProperty(property));
    }
    activeDeviceCard = null;
    devicePointer = null;
    deviceBounds = null;
  };
  const deviceMotionAllowed = () => devicesVisible && motionAllowed() && !document.hidden;
  const syncDeviceMotion = () => {
    const enabled = deviceMotionAllowed();
    deviceGrid?.classList.toggle('p-device-motion-active',enabled);
    if (!enabled) resetDevicePointer();
  };
  const updateDevicePointer = () => {
    devicePointerFrame = 0;
    if (!activeDeviceCard || !devicePointer || !deviceBounds || !deviceMotionAllowed() || !finePointer.matches) return;
    const x = Math.max(0,Math.min(1,(devicePointer.x - deviceBounds.left) / deviceBounds.width));
    const y = Math.max(0,Math.min(1,(devicePointer.y - deviceBounds.top) / deviceBounds.height));
    activeDeviceCard.style.setProperty('--light-x',`${(x * 100).toFixed(1)}%`);
    activeDeviceCard.style.setProperty('--light-y',`${(y * 100).toFixed(1)}%`);
    activeDeviceCard.style.setProperty('--device-tilt-x',`${((.5 - y) * 5).toFixed(2)}deg`);
    activeDeviceCard.style.setProperty('--device-tilt-y',`${((x - .5) * 7).toFixed(2)}deg`);
  };

  const revealNodes = [...document.querySelectorAll('[data-reveal]')];
  let revealObserver;
  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },{threshold: .08,rootMargin: '0px 0px -25px 0px'});
    revealNodes.forEach(node => revealObserver.observe(node));
    if (video) {
      new IntersectionObserver(entries => {
        videoVisible = entries[0].isIntersecting;
        syncVideo();
      },{threshold: 0}).observe(video);
    }
    if (deviceGrid) {
      new IntersectionObserver(entries => {
        devicesVisible = entries[0].isIntersecting;
        syncDeviceMotion();
      },{threshold: 0}).observe(deviceGrid);
    }
  } else {
    revealNodes.forEach(node => node.classList.add('is-visible'));
  }
  document.querySelectorAll('.p-device-grid, .p-gallery').forEach(group => {
    [...group.children].forEach((node,index) => node.style.setProperty('--reveal-delay',`${index % 4 * .075}s`));
  });

  const updateMotion = () => {
    const reduced = preference.matches;
    body.classList.toggle('p-motion-reduced',reduced);
    body.classList.toggle('p-motion-backgrounded',document.hidden);
    if (reduced) {
      revealNodes.forEach(node => {
        node.classList.add('is-visible');
        revealObserver?.unobserve(node);
      });
    }
    syncVideo();
    syncBloom();
    syncDeviceMotion();
    scheduleScroll();
  };
  preference.addEventListener('change',updateMotion);
  document.addEventListener('visibilitychange',updateMotion);
  window.addEventListener('scroll',scheduleScroll,{passive:true});
  window.addEventListener('resize',scheduleScroll,{passive:true});
  window.addEventListener('scroll',resetDevicePointer,{passive:true});
  window.addEventListener('resize',resetDevicePointer,{passive:true});
  finePointer.addEventListener('change',resetDevicePointer);
  deviceCards.forEach(card => {
    card.addEventListener('pointermove',event => {
      if (!deviceMotionAllowed() || !finePointer.matches || event.pointerType !== 'mouse') return;
      if (activeDeviceCard !== card) {
        resetDevicePointer();
        activeDeviceCard = card;
        deviceBounds = card.getBoundingClientRect();
      }
      devicePointer = {x:event.clientX,y:event.clientY};
      if (!devicePointerFrame) devicePointerFrame = window.requestAnimationFrame(updateDevicePointer);
    },{passive:true});
    card.addEventListener('pointerleave',resetDevicePointer,{passive:true});
    card.addEventListener('pointercancel',resetDevicePointer,{passive:true});
  });

  const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = navLinks.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const activeSections = new Set();
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) activeSections.add(entry.target);
        else activeSections.delete(entry.target);
      });
      const current = sections.find(section => activeSections.has(section));
      navLinks.forEach(link => {
        if (current && link.getAttribute('href') === `#${current.id}`) link.setAttribute('aria-current','location');
        else link.removeAttribute('aria-current');
      });
    },{rootMargin: '-15% 0px -35% 0px',threshold: 0});
    sections.forEach(section => sectionObserver.observe(section));
  }
  body.classList.add('motion-ready');
  updateMotion();
})();
