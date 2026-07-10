import fs from 'node:fs'
import path from 'node:path'
import { generateImageFile } from '../imagegen.js'
import { figureHtml } from '../lib/figure.js'
import { exists, readJson, writeJson, workDir } from '../lib/paths.js'

async function ensureImage(config, imagesDir, filename, prompt, size, force) {
  const full = path.join(imagesDir, filename)
  if (fs.existsSync(full) && !force) {
    console.log(`    image exists, skipping: ${filename}`)
    return `images/${filename}`
  }
  process.stdout.write(`    generating ${filename} ... `)
  await generateImageFile(config, { prompt, size, outDir: imagesDir, filename })
  console.log('done')
  return `images/${filename}`
}

// Regenerate just the course-level hero image (used by run.js's retry when QA flags
// the course overview page rather than a specific lesson).
export async function regenerateCourseHero({ config, imagesDir, heroPrompt }) {
  return ensureImage(config, imagesDir, 'hero.png', heroPrompt, '1536x1024', true)
}

// Illustrate a single lesson (hero + inline figures), returning it with heroImage
// and body (tokens spliced for real <figure> markup) set, using paths relative to
// the bundle root (e.g. "images/foo.png") so the output HTML is portable. Used by
// the initial pass and by run.js's per-lesson retry when QA flags one lesson.
export async function illustrateLesson({ config, imagesDir, lesson, forceImages = false }) {
  const hero = await ensureImage(config, imagesDir, `${lesson.lessonSlug}-hero.png`, lesson.heroPrompt, '1536x1024', forceImages)

  let body = lesson.body
  for (let j = 0; j < lesson.inlineImages.length; j++) {
    const fig = lesson.inlineImages[j]
    const filename = `${lesson.lessonSlug}-fig${j + 1}.png`
    const url = await ensureImage(config, imagesDir, filename, fig.prompt, '1024x1024', forceImages)
    body = body.split(fig.token).join(figureHtml(url, fig.alt, fig.caption))
  }

  return { ...lesson, heroImage: hero, body }
}

// Stage 4: generate the course hero, every lesson hero, and every inline figure,
// then splice the resulting <figure> markup into each lesson's body in place of
// its "<!--FIG:N-->" token. Stable filenames make this idempotent-skip on re-runs.
export async function runIllustrate({ config, outDir, slug, authored, forceImages = false }) {
  const dir = workDir(outDir, slug)
  const outFile = path.join(dir, 'illustrated.json')
  const imagesDir = path.join(outDir, slug, 'images')

  if (exists(outFile) && !forceImages) {
    console.log(`  illustrated.json exists, skipping: ${outFile}`)
    return readJson(outFile)
  }

  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set; cannot generate images.')
  }

  const courseHero = await ensureImage(config, imagesDir, 'hero.png', authored.heroPrompt, '1536x1024', forceImages)

  const lessons = []
  for (const lesson of authored.lessons) {
    lessons.push(await illustrateLesson({ config, imagesDir, lesson, forceImages }))
  }

  const illustrated = { ...authored, heroImage: courseHero, lessons }
  writeJson(outFile, illustrated)
  console.log(`  illustrated: course hero + ${lessons.length} lesson heroes + figures`)
  return illustrated
}
