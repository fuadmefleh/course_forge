export function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function wordCount(html) {
  const text = stripHtml(html)
  return text ? text.split(' ').length : 0
}
