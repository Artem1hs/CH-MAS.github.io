(() => {
  'use strict';

  // Match the homepage's photo policy. Decode before URL normalisation so a
  // traversal cannot disappear; encoded spaces, Cyrillic, # and % stay valid.
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
    const grid = root.querySelector('[data-partners-grid]');
    const more = root.querySelector('[data-partners-more]');
    const progress = root.querySelector('[data-partners-progress]');
    const empty = root.querySelector('[data-partners-empty]');
    const collection = root.querySelector('[data-partners-collection]');
    const heading = root.querySelector('[data-partners-heading]');
    const title = root.querySelector('[data-partners-title]');
    const dialog = root.querySelector('[data-partners-dialog]');
    if (!grid || !more || !progress || !empty || !collection || !dialog || root.dataset.partnersReady) return;
    root.dataset.partnersReady = 'true';

    const image = dialog.querySelector('[data-partners-image]');
    const caption = dialog.querySelector('[data-partners-caption]');
    const counter = dialog.querySelector('[data-partners-counter]');
    const error = dialog.querySelector('[data-partners-error]');
    const close = dialog.querySelector('[data-partners-close]');
    const prev = dialog.querySelector('[data-partners-prev]');
    const next = dialog.querySelector('[data-partners-next]');
    const canOpen = typeof dialog.showModal === 'function' && image && caption && counter && error && close && prev && next;
    let photos = [], current = 0, openedFrom = null, generation = 0;
    let shown = 0;
    const broken = new Set();

    const showPhoto = index => {
      current = ((index % photos.length) + photos.length) % photos.length;
      const photo = photos[current];
      const token = ++generation;
      image.hidden = true;
      error.hidden = true;
      caption.textContent = photo.caption;
      caption.hidden = !photo.caption;
      counter.textContent = `${current + 1} / ${photos.length}`;
      image.alt = photo.alt;
      dialog.setAttribute('aria-label', `Фотография ${current + 1} из ${photos.length}. ${photo.alt}`);
      const single = photos.length < 2;
      prev.hidden = next.hidden = single;
      prev.disabled = next.disabled = single;
      dialog.setAttribute('aria-busy', 'true');
      image.onload = () => {
        if (token !== generation) return;
        image.hidden = false;
        dialog.setAttribute('aria-busy', 'false');
      };
      image.onerror = () => {
        if (token !== generation) return;
        image.hidden = true;
        error.textContent = photos.length > 1 ? 'Фотографию не удалось открыть. Попробуйте посмотреть другую.' : 'Фотографию не удалось открыть. Закройте просмотр и попробуйте позже.';
        error.hidden = false;
        dialog.setAttribute('aria-busy', 'false');
      };
      image.src = photo.src;
    };

    if (canOpen) {
      close.addEventListener('click', () => dialog.close());
      prev.addEventListener('click', () => { if (photos.length > 1) showPhoto(current - 1); });
      next.addEventListener('click', () => { if (photos.length > 1) showPhoto(current + 1); });
      dialog.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || photos.length < 2) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          showPhoto(current + (event.key === 'ArrowRight' ? 1 : -1));
        }
      });
      dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      });
      dialog.addEventListener('close', () => {
        generation++;
        image.onload = image.onerror = null;
        image.removeAttribute('src');
        dialog.setAttribute('aria-busy', 'false');
        document.documentElement.classList.remove('partners-dialog-open');
        if (openedFrom?.isConnected && !openedFrom.disabled) openedFrom.focus({preventScroll:true});
        else (collection.hidden ? title : heading)?.focus({preventScroll:true});
      });
    }

    const render = count => {
      if (shown >= photos.length) return;
      const cards = photos.slice(shown, shown + count).map((photo, offset) => {
        const index = shown + offset;
        const figure = document.createElement('figure');
        figure.className = 'partners-photo-card';
        const trigger = document.createElement(canOpen ? 'button' : 'a');
        trigger.className = 'partners-photo';
        trigger.setAttribute('data-partners-photo', String(index));
        trigger.setAttribute('aria-label', `Открыть фотографию: ${photo.alt}`);
        if (canOpen) { trigger.type = 'button'; trigger.setAttribute('aria-haspopup', 'dialog'); }
        else trigger.href = photo.src;
        const thumb = document.createElement('img');
        thumb.loading = 'lazy';
        thumb.decoding = 'async';
        thumb.width = photo.width;
        thumb.height = photo.height;
        thumb.alt = photo.alt;
        const fallback = document.createElement('span');
        fallback.className = 'partners-photo-error';
        fallback.textContent = 'Фотография пока недоступна';
        fallback.hidden = true;
        thumb.addEventListener('error', () => {
          if (broken.has(index)) return;
          broken.add(index);
          thumb.hidden = true;
          fallback.hidden = false;
          trigger.disabled = true;
          trigger.removeAttribute('href');
          trigger.setAttribute('aria-disabled', 'true');
          trigger.setAttribute('aria-label', 'Фотография пока недоступна');
          if (broken.size === photos.length) { collection.hidden = true; empty.hidden = false; }
        });
        thumb.src = photo.src;
        const hint = document.createElement('span');
        hint.className = 'partners-photo-hint';
        hint.textContent = 'Смотреть фото ↗';
        hint.setAttribute('aria-hidden', 'true');
        trigger.append(thumb, fallback, hint);
        figure.append(trigger);
        if (photo.caption) {
          const text = document.createElement('figcaption');
          text.textContent = photo.caption;
          figure.append(text);
        }
        if (canOpen) trigger.addEventListener('click', () => {
          if (trigger.disabled) return;
          openedFrom = trigger;
          showPhoto(index);
          dialog.showModal();
          document.documentElement.classList.add('partners-dialog-open');
          close.focus();
        });
        return figure;
      });
      grid.append(...cards);
      shown += cards.length;
      progress.textContent = `Показано ${shown} из ${photos.length}`;
      more.hidden = shown >= photos.length;
      empty.hidden = true;
      collection.hidden = false;
      return cards[0].querySelector('[data-partners-photo]');
    };

    more.addEventListener('click', () => render(10)?.focus());

    const loadFeed = async () => {
      if (root.dataset.partnersFeed !== 'assets/friends-gallery.json') return;
      const url = new URL(root.dataset.partnersFeed, document.baseURI);
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
          const caption = typeof photo.caption === 'string' ? photo.caption.trim() : '';
          const alt = typeof photo.alt === 'string' ? photo.alt.trim() : '';
          const sized = [photo.width, photo.height].every(value => Number.isInteger(value) && value >= 1 && value <= 20000);
          return [{src, caption, alt:alt || caption || 'Автомобиль друга Честной мастерской', width:sized ? photo.width : 1200, height:sized ? photo.height : 900}];
        });
        render(4);
      } catch {
        // The finished invitation stays available if the public manifest fails.
      } finally { window.clearTimeout(timeout); }
    };
    loadFeed();
  };

  const start = () => document.querySelectorAll('[data-partners-gallery]').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
