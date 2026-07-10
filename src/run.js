import path from 'node:path'
import fs from 'node:fs'
import { loadConfig, requireApiKey, resolveOutDir } from './config.js'
import { workDir, writeJson } from './lib/paths.js'
import { runStoryboard } from './stages/storyboard.js'
import { runDraft, draftLesson } from './stages/draft.js'
import { runAuthor, authorLesson } from './stages/author.js'
import { runIllustrate, illustrateLesson, regenerateCourseHero } from './stages/illustrate.js'
import { writeBundle } from './stages/bundle.js'
import { runQA } from './stages/qa.js'
import { exportSqlite } from './sqlite.js'

const MAX_RETRIES = 2

function failingLessonSlugs(report) {
  const slugs = new Set()
  for (const r of report.structural) if (!r.pass) slugs.add(r.lessonSlug)
  for (const r of report.content) if (!r.pass) slugs.add(r.lessonSlug)
  for (const r of report.render) if (!r.pass && r.label !== 'index') slugs.add(r.label)
  return slugs
}

function courseRenderFailed(report) {
  return report.render.some((r) => r.label === 'index' && !r.pass)
}

function printReport(report) {
  console.log(`\nQA report (pass=${report.pass}):`)
  for (const r of report.structural) if (!r.pass) console.log(`  [structural] ${r.lessonSlug}: ${r.issues.join('; ')}`)
  for (const r of report.content) if (!r.pass) console.log(`  [content]    ${r.lessonSlug}: ${r.issues.join('; ')}`)
  for (const r of report.render) {
    if (r.pass) continue
    console.log(`  [render]     ${r.label}: ${[...(r.domIssues || []), ...(r.visionIssues || [])].join('; ')}`)
  }
}

// End-to-end: storyboard -> draft -> author -> illustrate -> bundle -> QA review,
// with up to MAX_RETRIES redraft/reauthor/re-illustrate passes on whatever QA flags.
// Returns { slug, courseDir, report } — report.pass tells you whether it's clean.
export async function runPipeline({
  topic,
  lessonCount = 8,
  courseId,
  outDirPath = 'output',
  configPath,
  forceImages = false,
  baseUrl,
  sqlitePath,
}) {
  const config = loadConfig({ configPath })
  requireApiKey(config)
  const outDir = resolveOutDir(outDirPath)

  console.log(`\n=== 1. Storyboard: ${topic} (${lessonCount} lessons) ===`)
  const { slug, storyboard } = await runStoryboard({ config, outDir, topic, lessonCount, courseId })

  console.log(`\n=== 2. Draft ===`)
  const { drafts } = await runDraft({ config, outDir, slug, storyboard })

  console.log(`\n=== 3. Author ===`)
  let authored = await runAuthor({ config, outDir, slug, storyboard, drafts })

  console.log(`\n=== 4. Illustrate ===`)
  let illustrated = await runIllustrate({ config, outDir, slug, authored, forceImages })

  console.log(`\n=== 5. Bundle ===`)
  let courseDir = writeBundle({ outDir, illustrated, brandColor: config.brandColor })

  console.log(`\n=== 6. QA review ===`)
  let report = await runQA({ config, outDir, slug, illustrated, baseUrl })
  printReport(report)

  let attempt = 0
  while (!report.pass && attempt < MAX_RETRIES) {
    attempt++
    console.log(`\n--- QA failed, retry ${attempt}/${MAX_RETRIES}: regenerating flagged lesson(s) ---`)

    const badSlugs = failingLessonSlugs(report)
    for (const lessonSlug of badSlugs) {
      const i = illustrated.lessons.findIndex((l) => l.lessonSlug === lessonSlug)
      if (i === -1) continue
      const storyLesson = storyboard.lessons[i]
      console.log(`  regenerating: ${lessonSlug}`)

      const draftFile = path.join(workDir(outDir, slug), 'drafts', `${lessonSlug}.md`)
      const markdown = await draftLesson(config, { courseTitle: storyboard.title, lesson: storyLesson })
      fs.writeFileSync(draftFile, markdown)

      const authoredLesson = await authorLesson(config, { storyLesson, lessonSlug, markdown })
      authored.lessons[i] = authoredLesson

      const imagesDir = path.join(outDir, slug, 'images')
      illustrated.lessons[i] = await illustrateLesson({ config, imagesDir, lesson: authoredLesson, forceImages: true })
    }

    if (courseRenderFailed(report)) {
      console.log('  regenerating course hero image')
      const imagesDir = path.join(outDir, slug, 'images')
      illustrated.heroImage = await regenerateCourseHero({ config, imagesDir, heroPrompt: authored.heroPrompt })
    }

    writeJson(path.join(workDir(outDir, slug), 'authored.json'), authored)
    writeJson(path.join(workDir(outDir, slug), 'illustrated.json'), illustrated)
    courseDir = writeBundle({ outDir, illustrated, brandColor: config.brandColor })

    report = await runQA({ config, outDir, slug, illustrated, baseUrl })
    printReport(report)
  }

  if (report.pass && sqlitePath) {
    console.log(`\n=== 7. SQLite export ===`)
    await exportSqlite({ sqlitePath, illustrated })
    console.log(`  written: ${sqlitePath}`)
  }

  return { slug, courseDir, report }
}
