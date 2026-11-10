(() => {
  'use strict';

  const editorMode = document.querySelector('#cms-inline-edit, #cms-inline-view');
  if (editorMode) {
    const syncEditorSection = () => {
      const url = new URL(editorMode.href);
      url.hash = window.location.hash;
      editorMode.href = url.href;
    };
    syncEditorSection();
    window.addEventListener('hashchange', syncEditorSection);
  }

  const menuButton = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (menuButton && navLinks) {
    document.documentElement.classList.add('js');
    const closeMenu = () => {
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Открыть меню');
      navLinks.classList.remove('is-open');
    };
    menuButton.addEventListener('click', () => {
      const expanded = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(expanded));
      menuButton.setAttribute('aria-label', expanded ? 'Закрыть меню' : 'Открыть меню');
      navLinks.classList.toggle('is-open', expanded);
    });
    navLinks.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        closeMenu();
        menuButton.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.site-nav')) closeMenu();
    });
    window.matchMedia('(max-width: 760px)').addEventListener('change', closeMenu);
  }

  const dialog = document.querySelector('.photo-dialog');
  const photos = [...document.querySelectorAll('[data-gallery]')];
  if (!dialog || typeof dialog.showModal !== 'function' || !photos.length) return;

  const image = dialog.querySelector('.dialog-image');
  const caption = dialog.querySelector('.dialog-caption');
  const counter = dialog.querySelector('.photo-counter');
  const closeButton = dialog.querySelector('.dialog-close');
  let activePhotos = photos;
  let current = 0;
  let openedFrom = null;

  const showPhoto = (index) => {
    current = (index + activePhotos.length) % activePhotos.length;
    const photo = activePhotos[current];
    image.src = photo.href;
    image.alt = photo.querySelector('img').alt;
    caption.textContent = photo.dataset.caption;
    counter.textContent = `${current + 1} / ${activePhotos.length}`;
  };

  photos.forEach((photo) => {
    photo.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openedFrom = photo;
      const group = photo.dataset.galleryGroup;
      activePhotos = photos.filter((item) => item.dataset.galleryGroup === group);
      showPhoto(activePhotos.indexOf(photo));
      dialog.showModal();
      document.documentElement.classList.add('dialog-open');
      closeButton.focus();
    });
  });

  closeButton.addEventListener('click', () => dialog.close());
  dialog.querySelector('.photo-prev').addEventListener('click', () => showPhoto(current - 1));
  dialog.querySelector('.photo-next').addEventListener('click', () => showPhoto(current + 1));
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      showPhoto(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('dialog-open');
    openedFrom?.focus({ preventScroll: true });
  });
})();
