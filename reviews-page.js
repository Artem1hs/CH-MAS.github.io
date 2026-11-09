(() => {
  const section = document.querySelector('[data-reviews-page]');
  const list = section.querySelector('[data-reviews-list]');
  const status = section.querySelector('[data-reviews-status]');
  const template = section.querySelector('[data-review-template]');
  const controls = section.querySelector('[data-reviews-more]');
  const progress = controls.querySelector('[data-reviews-progress]');
  const more = controls.querySelector('button');
  const formatDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeZone: 'UTC' });
  const pageSize = 12;
  let cards = [];
  let shown = 0;

  function renderReview(review) {
    if (typeof review?.author !== 'string' || !review.author.trim() ||
        typeof review.text !== 'string' || !review.text.trim() ||
        !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) return null;

    const card = template.content.cloneNode(true);
    const author = review.author.trim();
    card.querySelector('.reviews-avatar').textContent = Array.from(author)[0].toLocaleUpperCase('ru-RU');
    card.querySelector('.reviews-author').textContent = author;
    card.querySelector('.reviews-stars').textContent = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    card.querySelector('.reviews-rating .p-visually-hidden').textContent = `Оценка ${review.rating} из 5`;
    card.querySelector('.reviews-quote').textContent = review.text.trim();

    if (typeof review.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(review.date)) {
      const date = new Date(`${review.date}T00:00:00Z`);
      if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === review.date) {
        const time = card.querySelector('.reviews-date');
        time.dateTime = review.date;
        time.textContent = formatDate.format(date);
        time.hidden = false;
      }
    }

    return card;
  }

  function showNextPage() {
    const next = cards.slice(shown, shown + pageSize);
    list.append(...next);
    shown += next.length;
    progress.textContent = `Показано ${shown} из ${cards.length}`;
    if (shown === cards.length && document.activeElement === more) progress.focus({ preventScroll: true });
    more.hidden = shown === cards.length;
  }

  async function readCards(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Review feed unavailable');
    const { reviews } = await response.json();
    const result = reviews.map(renderReview).filter(Boolean);
    if (!result.length) throw new Error('Review feed is empty');
    return result;
  }

  async function loadReviews() {
    status.textContent = 'Загружаем отзывы…';
    status.hidden = false;
    for (const path of ['assets/reviews-import/metallurgov-70.json', 'assets/reviews-2gis.json']) {
      try {
        cards = await readCards(path);
        controls.hidden = false;
        showNextPage();
        status.hidden = true;
        return;
      } catch {
        // The short local selection remains usable when the archive is unavailable.
      }
    }
    status.textContent = 'Подборка сейчас недоступна. Все отзывы можно прочитать в 2ГИС.';
  }

  more.addEventListener('click', showNextPage);
  loadReviews();
})();
