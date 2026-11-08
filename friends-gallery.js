(() => {
  'use strict';

  // Validate legacy photo paths before URL normalisation can erase traversal.
  // The editor also accepts individual uploads and explicit web image URLs.
  const photoUrl = (raw, managedByCms) => {
    if (typeof raw !== 'string' || /[\s\x00-\x1f\x7f\\]/.test(raw)) return null;
    try {
      if (managedByCms && /^https?:\/\//i.test(raw)) {
        const url = new URL(raw);
        return url.username || url.password ? null : url.href;
      }
      if (managedByCms && /^\/cms-media\/[\da-z][\da-z.-]*$/i.test(raw)) return new URL(raw, window.location.origin).href;
      if (!raw.startsWith('assets/friends/') || /[?#]/.test(raw)) return null;
      const decoded = decodeURIComponent(raw);
      if (!/\.(jpe?g|png|webp|avif)$/i.test(decoded)) return null;
      const segmentCount = raw.split('/').length;
      let checked = decoded;
      // Literal # and % characters in filenames are safe when URL encoded. Check
      // further encodings only for traversal/separators, never as URL delimiters.
      while (true) {
        if (/[\x00-\x1f\x7f\\]/.test(checked)) return null;
        const segments = checked.split('/');
        if (segments.length !== segmentCount || segments.some(part => !part || part === '.' || part === '..')) return null;
        const expanded = checked.replace(/%([\da-f]{2})/gi, (_, byte) => String.fromCharCode(parseInt(byte, 16)));
        if (expanded === checked) break;
        checked = expanded;
      }
      const url = new URL(raw, document.baseURI);
      const directory = new URL('assets/friends/', document.baseURI);
      if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin || !url.pathname.startsWith(directory.pathname)) return null;
      return url.href;
    } catch { return null; }
  };

  const init = root => {
    const stage = root.querySelector('[data-friends-stage]');
    const placeholder = root.querySelector('[data-friends-placeholder]');
    const frames = [...root.querySelectorAll('[data-friends-image]')];
    if (!stage || !placeholder || frames.length !== 2 || root.dataset.friendsReady) return;
    root.dataset.friendsReady = 'true';

    const caption = root.querySelector('[data-friends-caption]');
    const controls = root.querySelector('[data-friends-controls]');
    const prev = root.querySelector('[data-friends-prev]');
    const next = root.querySelector('[data-friends-next]');
    const dots = root.querySelector('[data-friends-dots]');
    const status = root.querySelector('[data-friends-status]');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const interval = Math.max(1000, Number(root.dataset.friendsInterval) || 7000);
    const resume = Math.max(1000, Number(root.dataset.friendsResume) || 15000);
    const failed = new Set();
    let photos = [], dotButtons = [];
    let current = -1, wanted = 0, frame = -1;
    let inView = false, fetched = false, feedReady = false;
    let loader = null, generation = 0, pendingManual = false;
    let autoTimer = 0, fadeTimer = 0;
    let resumeAt = 0, nextAutoAt = 0;
    let pointer = null, suppressClickUntil = 0;

    const displayed = () => inView && !document.hidden;
    const available = () => photos.length - failed.size;
    const clearAuto = () => { window.clearTimeout(autoTimer); autoTimer = 0; };
    const cancelLoad = () => {
      generation++;
      if (loader) { loader.onload = loader.onerror = null; loader.src = ''; loader = null; }
    };
    const settleFade = () => {
      window.clearTimeout(fadeTimer);
      fadeTimer = 0;
      frames.forEach((image, index) => { image.hidden = index !== frame; });
    };

    const updateControls = () => {
      const enough = current >= 0 && available() > 1;
      stage.setAttribute('tabindex', enough ? '0' : '-1');
      if (controls) controls.hidden = !enough;
      if (prev) prev.disabled = !enough;
      if (next) next.disabled = !enough;
      const usable = dotButtons.map((button, index) => index).filter(index => !failed.has(index));
      const start = Math.max(0, Math.min(usable.indexOf(current) - 2, usable.length - 5));
      const visibleDots = new Set(usable.slice(start, start + 5));
      dotButtons.forEach((button, index) => {
        button.hidden = !visibleDots.has(index);
        button.disabled = failed.has(index);
        if (index === current) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
    };

    const nextAvailable = (start, direction = 1) => {
      for (let step = 0; step < photos.length; step++) {
        const index = ((start + step * direction) % photos.length + photos.length) % photos.length;
        if (!failed.has(index)) return index;
      }
      return -1;
    };

    const scheduleAuto = () => {
      clearAuto();
      if (!displayed() || motion.matches || current < 0 || available() < 2 || loader || pointer) return;
      autoTimer = window.setTimeout(() => {
        autoTimer = 0;
        select(current + 1, false, 1);
      }, Math.max(0, Math.max(nextAutoAt, resumeAt) - Date.now()));
    };

    const interact = () => {
      resumeAt = Date.now() + resume;
      nextAutoAt = resumeAt;
      if (loader && current >= 0 && !pendingManual) {
        cancelLoad();
        wanted = current;
      }
      scheduleAuto();
    };

    const present = (index, manual) => {
      window.clearTimeout(fadeTimer);
      const old = frame;
      frame = frame === 0 ? 1 : 0;
      const image = frames[frame];
      image.classList.remove('is-current');
      image.src = photos[index].src;
      image.alt = photos[index].alt;
      image.hidden = false;
      image.setAttribute('aria-hidden', 'false');
      // Commit the transparent incoming frame before CSS fades it in.
      if (old >= 0 && !motion.matches) void image.offsetWidth;
      image.classList.add('is-current');
      frames.forEach((other, number) => {
        if (number === frame) return;
        other.classList.remove('is-current');
        other.setAttribute('aria-hidden', 'true');
      });
      if (old >= 0 && !motion.matches && displayed()) {
        fadeTimer = window.setTimeout(settleFade, 520);
      } else settleFade();
      current = wanted = index;
      pendingManual = false;
      placeholder.hidden = true;
      root.classList.add('has-photos');
      if (caption) {
        caption.textContent = photos[index].caption;
        caption.hidden = !photos[index].caption;
      }
      if (status) {
        status.setAttribute('aria-live', manual ? 'polite' : 'off');
        status.textContent = `Фото ${index + 1} из ${photos.length}${photos[index].caption ? '. ' + photos[index].caption : ''}`;
      }
      updateControls();
      if (!manual) nextAutoAt = Date.now() + interval;
      scheduleAuto();
    };

    function select(index, manual = false, direction = 1) {
      clearAuto();
      cancelLoad();
      wanted = nextAvailable(index, direction);
      pendingManual = manual;
      if (wanted < 0) { updateControls(); return; }
      if (wanted === current) { updateControls(); scheduleAuto(); return; }
      if (!displayed()) return;
      const selected = wanted;
      const token = generation;
      const image = new Image();
      loader = image;
      image.decoding = 'async';
      image.onload = () => {
        if (token !== generation || !displayed()) return;
        loader = null;
        image.onload = image.onerror = null;
        present(selected, manual);
      };
      image.onerror = () => {
        if (token !== generation) return;
        loader = null;
        image.onload = image.onerror = null;
        failed.add(selected);
        updateControls();
        // Each failure is remembered, so even an entirely broken feed terminates.
        select(selected + direction, manual, direction);
      };
      image.src = photos[selected].src;
    }

    const move = direction => {
      if (available() > 1) select(wanted + direction, true, direction);
    };

    const loadFeed = async () => {
      if (fetched || !displayed()) return;
      fetched = true;
      // This is a static, public feed, not an arbitrary URL supplied by JSON.
      if (root.dataset.friendsFeed !== 'assets/friends-gallery.json') return;
      const url = new URL(root.dataset.friendsFeed, document.baseURI);
      if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return;
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch(url.href, {credentials:'same-origin', redirect:'error', cache:'no-cache', ...(controller ? {signal:controller.signal} : {})});
        if (!response.ok) return;
        const data = await response.json();
        if (!data || !Array.isArray(data.photos)) return;
        const seen = new Set();
        photos = data.photos.flatMap(photo => {
          const src = photo && photoUrl(photo.src, data.managedByCms === true);
          if (!src || seen.has(src)) return [];
          seen.add(src);
          return [{src, alt:typeof photo.alt === 'string' ? photo.alt.trim() : '', caption:typeof photo.caption === 'string' ? photo.caption.trim() : ''}];
        });
        if (dots) {
          dotButtons = photos.map((photo, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'p-friends-dot';
            button.setAttribute('data-friends-dot', String(index));
            button.setAttribute('aria-label', `Фото ${index + 1}`);
            return button;
          });
          dots.replaceChildren(...dotButtons);
        }
        feedReady = true;
        updateControls();
        select(0);
      } catch {
        // Keep the illustration and hidden controls if the public feed is absent.
      } finally { window.clearTimeout(timeout); }
    };

    root.addEventListener('click', event => {
      interact();
      if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); return; }
      const button = event.target.closest?.('button');
      if (!button || !root.contains(button) || button.disabled) return;
      if (button === next) move(1);
      else if (button === prev) move(-1);
      else if (button.hasAttribute('data-friends-dot')) {
        const index = Number(button.getAttribute('data-friends-dot'));
        if (Number.isInteger(index) && index >= 0 && index < photos.length && !failed.has(index)) select(index, true);
      }
    });
    root.addEventListener('keydown', event => {
      interact();
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target.closest?.('input') || event.target.closest?.('textarea') || event.target.closest?.('select') || event.target.isContentEditable) return;
      if (available() > 1 && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        move(event.key === 'ArrowRight' ? 1 : -1);
      }
    });

    const pointerStart = event => {
      if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
      pointer = {id:event.pointerId,x:event.clientX,y:event.clientY};
      interact();
    };
    const pointerEnd = event => {
      if (!pointer || (event.pointerId !== undefined && event.pointerId !== pointer.id)) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer = null;
      interact();
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        suppressClickUntil = Date.now() + 500;
        move(dx < 0 ? 1 : -1);
      }
    };
    const pointerCancel = () => { if (pointer) { pointer = null; interact(); } };
    stage.addEventListener('pointerdown', pointerStart, {passive:true});
    stage.addEventListener('pointerup', pointerEnd, {passive:true});
    window.addEventListener('pointerup', pointerEnd, {passive:true});
    stage.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('blur', pointerCancel);
    if (!('PointerEvent' in window)) {
      stage.addEventListener('touchstart', event => {
        const touch = event.touches[0];
        if (touch) pointerStart({pointerId:touch.identifier,clientX:touch.clientX,clientY:touch.clientY});
      }, {passive:true});
      const touchEnd = event => {
        const touch = event.changedTouches[0];
        if (touch) pointerEnd({pointerId:touch.identifier,clientX:touch.clientX,clientY:touch.clientY});
      };
      stage.addEventListener('touchend', touchEnd, {passive:true});
      window.addEventListener('touchend', touchEnd, {passive:true});
      stage.addEventListener('touchcancel', pointerCancel, {passive:true});
      window.addEventListener('touchcancel', pointerCancel, {passive:true});
    }

    const visibilityChanged = () => {
      root.classList.toggle('is-in-view', displayed() && !motion.matches);
      if (!displayed()) {
        clearAuto();
        cancelLoad();
        settleFade();
        pointer = null;
      } else {
        nextAutoAt = Math.max(Date.now() + interval, resumeAt);
        if (!fetched) loadFeed();
        else if (feedReady && current !== wanted) select(wanted, pendingManual);
        else scheduleAuto();
      }
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    if ('IntersectionObserver' in window) {
      new window.IntersectionObserver(entries => {
        const entry = entries.find(value => value.target === stage);
        if (!entry || inView === entry.isIntersecting) return;
        inView = entry.isIntersecting;
        visibilityChanged();
      }, {threshold:0.05}).observe(stage);
    } else {
      const checkViewport = () => {
        const rect = stage.getBoundingClientRect();
        const visible = rect.bottom > 0 && rect.top < window.innerHeight;
        if (inView !== visible) { inView = visible; visibilityChanged(); }
      };
      window.addEventListener('scroll', checkViewport, {passive:true});
      window.addEventListener('resize', checkViewport);
      checkViewport();
    }
    const motionChanged = () => {
      root.classList.toggle('is-in-view', displayed() && !motion.matches);
      if (motion.matches) {
        settleFade();
        if (loader && current >= 0 && !pendingManual) {
          cancelLoad();
          wanted = current;
        }
      }
      nextAutoAt = Math.max(Date.now() + interval, resumeAt);
      scheduleAuto();
    };
    if (motion.addEventListener) motion.addEventListener('change', motionChanged);
    else if (motion.addListener) motion.addListener(motionChanged);
    frames.forEach(image => { image.hidden = true; image.setAttribute('aria-hidden', 'true'); });
    if (caption) caption.hidden = true;
    if (status) status.setAttribute('aria-live', 'off');
    updateControls();
  };

  const start = () => document.querySelectorAll('[data-friends-gallery]').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
