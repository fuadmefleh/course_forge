import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { sanitizeBody } from '../sanitize.js'
import { reviewImages } from '../textgen.js'
import { stripHtml } from '../lib/html.js'
import { workDir, writeJson } from '../lib/paths.js'
import { servePreview } from '../render/previewServer.js'

// --- Layer A: structural checks (no LLM, no browser) ---
function structuralCheck(lesson) {
  const issues = []
  const sanitized = sanitizeBody(lesson.body)
  if (sanitized !== lesson.body) issues.push('sanitizer stripped disallowed markup from the body')
  if (/<!--FIG:\d+-->/.test(lesson.body)) issues.push('unfilled figure token left in body')
  if (!lesson.heroImage) issues.push('missing hero image')

  for (const m of lesson.body.matchAll(/<img[^>]*alt="([^"]*)"[^>]*>/g)) {
    if (!m[1] || !m[1].trim()) issues.push('image missing alt text')
  }
  for (const m of lesson.body.matchAll(/<figcaption>([^<]*)<\/figcaption>/g)) {
    if (!m[1] || !m[1].trim()) issues.push('figure missing caption text')
  }

  return { lessonSlug: lesson.lessonSlug, pass: issues.length === 0, issues }
}

// --- Layer A2: does each image match its surrounding text, and is the prose sound? ---
function imagePathsForLesson(courseDir, lesson) {
  const paths = []
  if (lesson.heroImage) paths.push(path.join(courseDir, lesson.heroImage))
  for (const m of lesson.body.matchAll(/<img[^>]*src="([^"]*)"/g)) {
    paths.push(path.join(courseDir, m[1]))
  }
  return paths.filter((p) => fs.existsSync(p))
}

async function contentReview(config, courseDir, lesson) {
  const text = stripHtml(lesson.body)
  const images = imagePathsForLesson(courseDir, lesson)
  const prompt = `Lesson title: "${lesson.title}"

Lesson text:
${text}

The attached images are, in order: the hero image first, then any inline figures. For each
image, judge whether it visually matches the surrounding text/topic and looks like a clean,
professional illustration (no garbled shapes, no readable gibberish baked into the image, no
obvious rendering artifacts). Also judge whether the prose itself is coherent, on-topic for its
title, and free of obvious factual red flags. Set pass=false and list concrete issues if anything
falls short; pass=true only if everything is acceptable.`

  const verdict = await reviewImages(config, { system: config.voice, prompt, images })
  return { lessonSlug: lesson.lessonSlug, pass: verdict.pass, issues: verdict.issues }
}

// --- Layer B: load the real rendered page and check nothing is cut off ---
async function domOverflowIssues(page) {
  return page.evaluate(() => {
    const issues = []
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      issues.push('page has unexpected horizontal scroll')
    }
    document.querySelectorAll('img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0) issues.push(`broken image: ${img.currentSrc || img.src}`)
    })
    document.querySelectorAll('*').forEach((el) => {
      const cls = typeof el.className === 'string' ? el.className : ''
      if (cls.includes('line-clamp') || cls.includes('sr-only') || cls.includes('visually-hidden')) return // intentional, not a bug
      const cs = getComputedStyle(el)
      if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') return
      if (cs.overflow !== 'hidden' && cs.overflowX !== 'hidden' && cs.overflowY !== 'hidden') return
      // Deliberately visually-hidden elements (screen-reader-only text, etc.) are shrunk
      // to ~1px on purpose; that's not the same bug as a normal-sized box clipping content.
      if (el.clientWidth <= 1 || el.clientHeight <= 1) return
      const clipsH = el.scrollWidth > el.clientWidth + 2
      const clipsV = el.scrollHeight > el.clientHeight + 2
      if (clipsH || clipsV) {
        issues.push(`possible clipped content on <${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ''}>`)
      }
    })
    return issues
  })
}

async function renderReview({ config, outDir, slug, illustrated, baseUrl }) {
  const shotsDir = path.join(workDir(outDir, slug), 'screenshots')
  fs.mkdirSync(shotsDir, { recursive: true })

  const courseDir = path.join(outDir, slug)
  // Self-contained by default: spin up the built-in static server over the bundle
  // we just wrote. If the caller already hosts the bundle somewhere (e.g. copied
  // it onto their own site), pass --base-url to check that instead.
  const preview = baseUrl ? null : await servePreview(courseDir)
  const base = baseUrl || preview.url

  const targets = [
    { label: 'index', url: `${base}/index.html` },
    ...illustrated.lessons.map((l) => ({ label: l.lessonSlug, url: `${base}/lesson-${l.lessonSlug}.html` })),
  ]

  const browser = await chromium.launch()
  const results = []
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    for (const { label, url } of targets) {
      await page.goto(url, { waitUntil: 'networkidle' })
      const domIssues = await domOverflowIssues(page)

      const screenshotPath = path.join(shotsDir, `${label}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })

      const visionVerdict = await reviewImages(config, {
        prompt:
          'This is a full-page screenshot of a rendered web page. Is any text or image ' +
          'visibly cut off, truncated, overlapping another element, or clipped? Ignore normal ' +
          'content continuing below the fold; only flag things that look visually broken. ' +
          'Set pass=false with concrete issues if something looks wrong.',
        images: [screenshotPath],
      })

      results.push({
        label,
        url,
        pass: domIssues.length === 0 && visionVerdict.pass,
        domIssues,
        visionIssues: visionVerdict.issues,
      })
    }
  } finally {
    await browser.close()
    if (preview) await preview.close()
  }
  return results
}

// Stage 5: aggregate structural, content/vision, and rendered-page checks into one
// report. Nothing here mutates the course; run.js decides what to do with a failure.
export async function runQA({ config, outDir, slug, illustrated, baseUrl }) {
  const courseDir = path.join(outDir, slug)
  const structural = illustrated.lessons.map(structuralCheck)

  const content = []
  for (const lesson of illustrated.lessons) content.push(await contentReview(config, courseDir, lesson))

  let render
  try {
    render = await renderReview({ config, outDir, slug, illustrated, baseUrl })
  } catch (err) {
    render = [{ label: 'render-check', url: baseUrl || '(preview server)', pass: false, domIssues: [], visionIssues: [err.message] }]
  }

  const report = {
    slug,
    generatedAt: new Date().toISOString(),
    structural,
    content,
    render,
    pass: structural.every((r) => r.pass) && content.every((r) => r.pass) && render.every((r) => r.pass),
  }

  writeJson(path.join(workDir(outDir, slug), 'qa-report.json'), report)
  return report
}
