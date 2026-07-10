// Render a generated image + its alt/caption into <figure> markup matching
// src/sanitize.js's allow-list.
export function figureHtml(url, alt, caption) {
  const safeAlt = alt.replace(/"/g, '&quot;')
  return `<figure><img src="${url}" alt="${safeAlt}" /><figcaption>${caption}</figcaption></figure>`
}
