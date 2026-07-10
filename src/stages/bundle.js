import fs from 'node:fs'
import path from 'node:path'
import { courseIndexHtml, lessonHtml } from '../render/template.js'

// Stage: write the finished course as a self-contained folder — manifest.json,
// index.html, one lesson-<slug>.html per lesson, and images/ (already populated by
// illustrate.js). This is the tool's only "output" concept: no DB, no publish/
// unpublish state. Re-run freely; it always reflects the current `illustrated` data.
export function writeBundle({ outDir, illustrated, brandColor }) {
  const courseDir = path.join(outDir, illustrated.id)
  fs.mkdirSync(courseDir, { recursive: true })

  fs.writeFileSync(path.join(courseDir, 'manifest.json'), JSON.stringify(illustrated, null, 2))
  fs.writeFileSync(path.join(courseDir, 'index.html'), courseIndexHtml(illustrated, { accent: brandColor }))

  illustrated.lessons.forEach((lesson, index) => {
    const html = lessonHtml(illustrated, lesson, { index, accent: brandColor })
    fs.writeFileSync(path.join(courseDir, `lesson-${lesson.lessonSlug}.html`), html)
  })

  console.log(`  bundle written: ${courseDir}`)
  return courseDir
}
