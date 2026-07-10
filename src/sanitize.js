import sanitizeHtml from 'sanitize-html'

// Generic long-form-article allow-list: enough for headings, lists, quotes, links,
// and figures, nothing else. HTML comments (used for the "<!--FIG:N-->" figure
// placeholder tokens) are never in the allow-list, so a leftover token can't leak
// into a published page even if a stage is skipped.
const SANITIZE_OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'blockquote', 'code', 'pre',
    'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption', 'hr',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
}

export function sanitizeBody(html) {
  return sanitizeHtml(html || '', SANITIZE_OPTIONS)
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
