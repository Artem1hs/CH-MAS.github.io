(() => {
  'use strict';

  const safe2gis = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
        (url.hostname === '2gis.ru' || url.hostname.endsWith('.2gis.ru')) ? url.href : null;
    } catch { return null; }
  };

  const init = root => {
    const viewport = root.querySelector('[data-review-window]');
    const track = root.querySelector('[data-review-track]');
    if (!viewport || !track || root.dataset.reviewReady) return;
    root.dataset.reviewReady = 'true';

    const prev = root.querySelector('[data-review-prev]');
    const next = root.querySelector('[data-review-next]');
    const toggle = root.querySelector('[data-review-toggle]');
    const status = root.querySelector('[data-review-status]');
    const empty = root.querySelector('[data-review-empty]');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const interval = Math.max(1000, Number(root.dataset.reviewAutoplay) || 6000);
    const resume = Math.max(1000, Number(root.dataset.reviewResume) || 15000);
    const duration = 460;
    const refreshInterval = 5 * 60 * 1000;
    let items = [...track.querySelectorAll('[data-review-card]')];
    let visible = 1;
    let inView = !('IntersectionObserver' in window);
    let paused = false;
    let resumeAt = 0;
    let nextAutoAt = Date.now() + interval;
    let autoTimer = 0;
    let transitionTimer = 0;
    let moving = null;
    let queue = [];
    let pointer = null;
    let suppressClickUntil = 0;
    let pendingFeed = null;
    let feedSignature = '';
    let nextFetchAt = 0;
    let fetchTimer = 0;
    let fetching = false;

    const displayed = () => inView && !document.hidden;
    const focusedCard = () => items.some(card => card.contains(document.activeElement));
    const firstIndex = () => Math.max(0, items.indexOf(track.firstElementChild));

    const updateAccessibleCards = () => {
      [...track.children].forEach((card, index) => {
        // Preserve a user's existing focus even if that card rotates past an edge.
        const hidden = index >= visible && !card.contains(document.activeElement);
        card.inert = hidden;
        card.setAttribute('aria-hidden', String(hidden));
      });
    };

    const updateControls = () => {
      const enough = items.length > visible;
      if (prev) prev.disabled = !enough;
      if (next) next.disabled = !enough;
      if (toggle) {
        toggle.disabled = !enough || motion.matches;
        toggle.setAttribute('aria-pressed', String(paused));
        toggle.setAttribute('aria-label', motion.matches ? 'Автопрокрутка отключена в настройках движения' : paused ? 'Включить автопрокрутку отзывов' : 'Приостановить автопрокрутку отзывов');
        toggle.textContent = paused ? 'Продолжить' : 'Пауза';
      }
      if (empty) empty.hidden = items.length > 0;
      updateAccessibleCards();
    };

    const announce = manual => {
      if (!status) return;
      status.setAttribute('aria-live', manual ? 'polite' : 'off');
      status.textContent = items.length ? `Отзыв ${firstIndex() + 1} из ${items.length}` : 'Пока нет опубликованных отзывов.';
    };

    const prepareCards = () => {
      items.forEach((card, index) => {
        card.setAttribute('aria-roledescription', 'отзыв');
        card.setAttribute('aria-label', `Отзыв ${index + 1} из ${items.length}`);
        const button = card.querySelector('[data-review-expand]');
        if (button) button.setAttribute('aria-expanded', String(card.classList.contains('is-expanded')));
      });
      updateControls();
      announce(false);
    };

    const clearAuto = () => { window.clearTimeout(autoTimer); autoTimer = 0; };
    const scheduleAuto = () => {
      clearAuto();
      if (!displayed() || paused || motion.matches || items.length <= visible || pointer) return;
      autoTimer = window.setTimeout(() => {
        autoTimer = 0;
        if (moving) { nextAutoAt = Date.now() + interval; scheduleAuto(); return; }
        nextAutoAt = Date.now() + interval;
        move(1, false);
        scheduleAuto();
      }, Math.max(0, Math.max(nextAutoAt, resumeAt) - Date.now()));
    };

    const interact = () => {
      resumeAt = Date.now() + resume;
      nextAutoAt = resumeAt;
      scheduleAuto();
    };

    // Move existing nodes rather than cloning cards: IDs, expanded text and focus survive.
    const relocate = (card, before) => {
      const active = document.activeElement;
      const keepFocus = active && card.contains(active);
      if (typeof track.moveBefore === 'function') track.moveBefore(card, before);
      else {
        track.insertBefore(card, before);
        if (keepFocus && document.activeElement !== active) active.focus({preventScroll: true});
      }
    };

    const finish = () => {
      if (!moving) return;
      window.clearTimeout(transitionTimer);
      const completed = moving;
      moving = null;
      track.style.transition = 'none';
      if (completed.direction === 1) relocate(track.firstElementChild, null);
      track.style.transform = '';
      root.classList.remove('is-animating');
      updateAccessibleCards();
      announce(completed.manual);
      if (queue.length) {
        const direction = queue.shift();
        move(direction, true);
      } else {
        applyPendingFeed();
        scheduleAuto();
      }
    };

    const move = (direction, manual) => {
      if (items.length <= visible) return;
      if (moving) {
        if (manual && queue.length < 8) queue.push(direction);
        return;
      }
      const gap = parseFloat(window.getComputedStyle(root).getPropertyValue('--reviews-gap')) || 0;
      const step = track.firstElementChild.getBoundingClientRect().width + gap;
      if (!step) return;
      if (status) status.setAttribute('aria-live', manual ? 'polite' : 'off');
      moving = {direction, manual, startedAt:Date.now()};
      root.classList.add('is-animating');
      track.style.transition = 'none';
      if (direction === -1) {
        relocate(track.lastElementChild, track.firstElementChild);
        track.style.transform = `translate3d(${-step}px, 0, 0)`;
      } else track.style.transform = 'translate3d(0, 0, 0)';
      // Commit the starting position before applying the single-card transition.
      void track.offsetWidth;
      if (motion.matches) { finish(); return; }
      track.style.transition = `transform ${duration}ms cubic-bezier(.22,.61,.36,1)`;
      track.style.transform = direction === 1 ? `translate3d(${-step}px, 0, 0)` : 'translate3d(0, 0, 0)';
      transitionTimer = window.setTimeout(finish, duration + 100);
    };

    const measure = () => {
      // Resize must finish, rather than abandon, a step already shown to the user.
      const waiting = queue;
      queue = [];
      finish();
      visible = Math.max(1, parseInt(window.getComputedStyle(root).getPropertyValue('--reviews-visible'), 10) || 1);
      updateControls();
      queue = waiting;
      if (queue.length && !moving) move(queue.shift(), true);
      scheduleAuto();
    };

    const normalizeFeed = data => {
      if (!data || data.sourceName !== '2ГИС' || !safe2gis(data.sourceUrl) || !Array.isArray(data.reviews)) return null;
      const seen = new Set();
      const reviews = data.reviews.filter(review => {
        if (!review || review.rating !== 5 || typeof review.text !== 'string' || !review.text.trim() || !safe2gis(review.url)) return false;
        if ((typeof review.id !== 'string' && typeof review.id !== 'number') || !String(review.id).trim() || seen.has(String(review.id))) return false;
        seen.add(String(review.id));
        return true;
      }).map(review => ({
        id: String(review.id),
        author: typeof review.author === 'string' ? review.author.trim() : '',
        date: typeof review.date === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(review.date) && Number.isFinite(Date.parse(review.date)) ? review.date : '',
        rating: 5, text: review.text.trim(), url: safe2gis(review.url)
      }));
      return {sourceUrl: safe2gis(data.sourceUrl), updatedAt: typeof data.updatedAt === 'string' && Number.isFinite(Date.parse(data.updatedAt)) ? data.updatedAt : '', reviews};
    };

    const createCard = review => {
      const card = document.createElement('article');
      card.className = 'p-review-card';
      card.setAttribute('data-review-card', '');
      card.dataset.reviewId = review.id;
      const heading = document.createElement('div');
      heading.className = 'p-review-heading';
      if (review.author) {
        const author = document.createElement('strong');
        author.className = 'p-review-author';
        author.textContent = review.author;
        heading.appendChild(author);
      }
      if (review.date) {
        const date = document.createElement('time');
        date.className = 'p-review-date';
        date.setAttribute('datetime', review.date);
        date.textContent = new Date(review.date).toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'});
        heading.appendChild(date);
      }
      card.appendChild(heading);
      const rating = document.createElement('span');
      rating.className = 'p-review-stars';
      rating.setAttribute('aria-label', 'Оценка 5 из 5');
      rating.textContent = '★★★★★';
      card.appendChild(rating);
      const text = document.createElement('p');
      text.className = 'p-review-text';
      text.setAttribute('data-review-text', '');
      text.textContent = review.text;
      card.appendChild(text);
      if (review.text.length > 260) {
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'p-review-expand';
        expand.setAttribute('data-review-expand', '');
        expand.setAttribute('aria-expanded', 'false');
        expand.textContent = 'Показать полностью';
        card.appendChild(expand);
      }
      const link = document.createElement('a');
      link.className = 'p-review-source';
      link.href = review.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Отзыв на 2ГИС';
      card.appendChild(link);
      return card;
    };

    const applyPendingFeed = () => {
      if (!pendingFeed || moving || pointer || focusedCard()) return;
      // Never replace populated cards while somebody may be reading them.
      // Initial empty content can fill immediately; refreshes wait until out of view.
      if (items.length && displayed()) return;
      const data = pendingFeed;
      pendingFeed = null;
      track.replaceChildren(...data.reviews.map(createCard));
      items = [...track.querySelectorAll('[data-review-card]')];
      root.dataset.reviewFeedState = 'ready';
      const source = root.querySelector('[data-review-source]');
      if (source) source.href = data.sourceUrl;
      const updated = root.querySelector('[data-review-updated]');
      if (updated && data.updatedAt) {
        updated.setAttribute('datetime', data.updatedAt);
        updated.textContent = new Date(data.updatedAt).toLocaleDateString('ru-RU');
      }
      prepareCards();
      nextAutoAt = Date.now() + interval;
      measure();
    };

    const scheduleFetch = () => {
      window.clearTimeout(fetchTimer);
      if (!root.dataset.reviewFeed || !displayed() || fetching) return;
      fetchTimer = window.setTimeout(refreshFeed, Math.max(0, nextFetchAt - Date.now()));
    };

    const refreshFeed = async () => {
      if (!displayed() || fetching) return;
      fetching = true;
      nextFetchAt = Date.now() + refreshInterval;
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = window.setTimeout(() => controller?.abort(), 12000);
      try {
        const feedUrl = new URL(root.dataset.reviewFeed, document.baseURI);
        if (feedUrl.origin !== new URL(document.baseURI).origin || !/^https?:$/.test(feedUrl.protocol)) throw new Error('Invalid reviews feed');
        const response = await fetch(feedUrl.href, {credentials:'same-origin', cache:'no-cache', ...(controller ? {signal:controller.signal} : {})});
        if (!response.ok) throw new Error('Reviews unavailable');
        const normalized = normalizeFeed(await response.json());
        if (!normalized) throw new Error('Invalid reviews feed');
        const signature = JSON.stringify(normalized);
        if (signature !== feedSignature) {
          feedSignature = signature;
          pendingFeed = normalized;
          applyPendingFeed();
        }
        root.dataset.reviewFeedState = pendingFeed ? 'pending' : 'ready';
      } catch {
        // Keep the last verified content; a network failure must not invent reviews.
        root.dataset.reviewFeedState = 'unavailable';
      } finally {
        window.clearTimeout(timeout);
        fetching = false;
        scheduleFetch();
      }
    };

    track.addEventListener('transitionend', event => {
      // A delayed event from a fallback-settled transition must not end its successor.
      if (event.target === track && event.propertyName === 'transform' && moving && Date.now() - moving.startedAt >= duration - 30) finish();
    });
    root.addEventListener('click', event => {
      interact();
      if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); return; }
      const target = event.target.closest?.('button');
      if (!target || !root.contains(target) || target.disabled) return;
      if (target.hasAttribute('data-review-next')) move(1, true);
      else if (target.hasAttribute('data-review-prev')) move(-1, true);
      else if (target.hasAttribute('data-review-toggle')) {
        paused = !paused;
        updateControls();
        scheduleAuto();
      } else if (target.hasAttribute('data-review-expand')) {
        const card = target.closest('[data-review-card]');
        const expanded = !card.classList.contains('is-expanded');
        card.classList.toggle('is-expanded', expanded);
        target.setAttribute('aria-expanded', String(expanded));
        target.textContent = expanded ? 'Свернуть' : 'Показать полностью';
      }
    });
    root.addEventListener('keydown', event => {
      interact();
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target.closest?.('input') || event.target.closest?.('textarea') || event.target.isContentEditable) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        move(event.key === 'ArrowRight' ? 1 : -1, true);
      }
    });

    const pointerStart = event => {
      if (event.pointerType === 'mouse' || (event.button !== undefined && event.button !== 0)) return;
      pointer = {id:event.pointerId, x:event.clientX, y:event.clientY};
      interact();
    };
    const pointerEnd = event => {
      if (!pointer || (event.pointerId !== undefined && pointer.id !== event.pointerId)) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer = null;
      interact();
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        suppressClickUntil = Date.now() + 500;
        move(dx < 0 ? 1 : -1, true);
      }
    };
    viewport.addEventListener('pointerdown', pointerStart, {passive:true});
    viewport.addEventListener('pointerup', pointerEnd, {passive:true});
    window.addEventListener('pointerup', pointerEnd, {passive:true});
    const pointerCancel = () => { if (pointer) { pointer = null; interact(); } };
    viewport.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('pointercancel', pointerCancel);
    if (!('PointerEvent' in window)) {
      viewport.addEventListener('touchstart', event => {
        const touch = event.touches[0];
        if (touch) pointerStart({pointerId:touch.identifier, clientX:touch.clientX, clientY:touch.clientY});
      }, {passive:true});
      const touchEnd = event => {
        const touch = event.changedTouches[0];
        if (touch) pointerEnd({pointerId:touch.identifier, clientX:touch.clientX, clientY:touch.clientY});
      };
      viewport.addEventListener('touchend', touchEnd, {passive:true});
      window.addEventListener('touchend', touchEnd, {passive:true});
      viewport.addEventListener('touchcancel', pointerCancel, {passive:true});
      window.addEventListener('touchcancel', pointerCancel, {passive:true});
    }
    root.addEventListener('focusout', () => window.setTimeout(() => {updateAccessibleCards(); applyPendingFeed();}, 0));

    const visibilityChanged = () => {
      if (!displayed()) {
        clearAuto();
        window.clearTimeout(fetchTimer);
        pointer = null;
        queue = [];
        finish();
        applyPendingFeed();
      } else {
        nextAutoAt = Math.max(Date.now() + interval, resumeAt);
        scheduleAuto();
        scheduleFetch();
      }
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    if ('IntersectionObserver' in window) {
      new window.IntersectionObserver(entries => {
        const entry = entries.find(value => value.target === root);
        if (!entry || inView === entry.isIntersecting) return;
        inView = entry.isIntersecting;
        visibilityChanged();
      }, {threshold:0.05}).observe(root);
    } else {
      const checkViewport = () => {
        const rect = root.getBoundingClientRect();
        const shown = rect.bottom > 0 && rect.top < window.innerHeight;
        if (inView !== shown) { inView = shown; visibilityChanged(); }
      };
      window.addEventListener('scroll', checkViewport, {passive:true});
      window.addEventListener('resize', checkViewport);
      checkViewport();
    }
    motion.addEventListener('change', () => {
      if (motion.matches) finish();
      nextAutoAt = Math.max(Date.now() + interval, resumeAt);
      updateControls();
      scheduleAuto();
    });
    window.addEventListener('resize', measure, {passive:true});
    if ('ResizeObserver' in window) new window.ResizeObserver(measure).observe(viewport);
    root.classList.add('is-enhanced');
    prepareCards();
    measure();
    scheduleFetch();
  };

  const start = () => document.querySelectorAll('[data-review-carousel]').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
