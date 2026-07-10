function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Shared, unbranded page shell. Self-contained (no external fonts/scripts/assets)
// so the bundle is fully portable and previewable offline. `accent` is the one
// configurable color (config.brandColor); everything else is deliberately plain.
function pageShell({ title, description, accent, backHref, backLabel, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: #fff;
      color: #24292f;
      line-height: 1.6;
    }
    a { color: ${accent}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .wrap { max-width: 760px; margin: 0 auto; padding: 48px 24px 96px; }
    .back { display: inline-block; font-size: 0.85rem; color: #57606a; margin-bottom: 24px; }
    .hero-img { width: 100%; border-radius: 12px; margin-bottom: 32px; display: block; }
    h1 { font-size: 2rem; line-height: 1.25; margin-bottom: 12px; }
    .subtitle { font-size: 1.1rem; color: #57606a; margin-bottom: 32px; }
    .meta { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: ${accent}; margin-bottom: 8px; }
    article h2 { font-size: 1.4rem; margin: 2em 0 0.6em; }
    article h3 { font-size: 1.15rem; margin: 1.6em 0 0.5em; }
    article p, article ul, article ol { margin-bottom: 1em; }
    article ul, article ol { padding-left: 1.4em; }
    article blockquote {
      border-left: 3px solid ${accent};
      padding: 0.2em 1.2em;
      margin: 1.5em 0;
      color: #444;
      font-style: italic;
    }
    article figure { margin: 2em 0; }
    article figure img { width: 100%; border-radius: 10px; display: block; }
    article figcaption { font-size: 0.85rem; color: #57606a; margin-top: 8px; }
    article pre { background: #f6f8fa; padding: 1em; border-radius: 8px; overflow-x: auto; }
    .lesson-list { list-style: none; margin-top: 24px; }
    .lesson-card {
      display: block;
      border: 1px solid #e2e2e2;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 12px;
    }
    .lesson-card:hover { border-color: ${accent}; text-decoration: none; }
    .lesson-card .num { font-size: 0.75rem; color: ${accent}; margin-bottom: 4px; display: block; }
    .lesson-card .excerpt {
      color: #57606a;
      font-size: 0.9rem;
      margin-top: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .pagenav { display: flex; justify-content: space-between; gap: 16px; margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e2e2; }
    .pagenav a { display: block; border: 1px solid #e2e2e2; border-radius: 10px; padding: 12px 16px; font-size: 0.9rem; max-width: 48%; }
    .pagenav a:hover { border-color: ${accent}; text-decoration: none; }
    .pagenav .dir { font-size: 0.7rem; text-transform: uppercase; color: #57606a; display: block; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="wrap">
    ${backHref ? `<a class="back" href="${esc(backHref)}">&larr; ${esc(backLabel)}</a>` : ''}
    ${body}
  </div>
</body>
</html>`
}

// Bundle layout is deliberately flat (index.html, lesson-<slug>.html, and images/
// all live in the same directory) so every page can reference "images/foo.png"
// directly, with no "../" path juggling between a page's depth and its images.
export function courseIndexHtml(course, { accent }) {
  const total = course.lessons.length
  const lessons = course.lessons
    .map(
      (l, i) => `
      <a class="lesson-card" href="lesson-${esc(l.lessonSlug)}.html">
        <span class="num">Part ${i + 1} of ${total} &middot; ${esc(l.readTime)}</span>
        <strong>${esc(l.title)}</strong>
        <div class="excerpt">${esc(l.excerpt)}</div>
      </a>`
    )
    .join('')

  const body = `
    ${course.heroImage ? `<img class="hero-img" src="${esc(course.heroImage)}" alt="${esc(course.title)}" />` : ''}
    <h1>${esc(course.title)}</h1>
    <p class="subtitle">${esc(course.subtitle)}</p>
    <div class="lesson-list">${lessons}</div>`

  return pageShell({
    title: course.title,
    description: course.subtitle,
    accent,
    body,
  })
}

export function lessonHtml(course, lesson, { index, accent }) {
  const total = course.lessons.length
  const prev = index > 0 ? course.lessons[index - 1] : null
  const next = index < total - 1 ? course.lessons[index + 1] : null

  const nav = `
    <div class="pagenav">
      ${prev ? `<a href="lesson-${esc(prev.lessonSlug)}.html"><span class="dir">&larr; Previous</span>${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a href="lesson-${esc(next.lessonSlug)}.html"><span class="dir">Next &rarr;</span>${esc(next.title)}</a>` : '<span></span>'}
    </div>`

  const body = `
    <span class="meta">Part ${index + 1} of ${total} &middot; ${esc(lesson.readTime)}</span>
    ${lesson.heroImage ? `<img class="hero-img" src="${esc(lesson.heroImage)}" alt="${esc(lesson.title)}" />` : ''}
    <h1>${esc(lesson.title)}</h1>
    <article>${lesson.body}</article>
    ${nav}`

  return pageShell({
    title: `${lesson.title} - ${course.title}`,
    description: lesson.excerpt || lesson.title,
    accent,
    backHref: 'index.html',
    backLabel: course.title,
    body,
  })
}
