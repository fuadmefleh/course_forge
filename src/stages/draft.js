import fs from 'node:fs'
import path from 'node:path'
import { generateText } from '../textgen.js'
import { slugify } from '../sanitize.js'
import { workDir } from '../lib/paths.js'

// Slugify each lesson title, appending -2/-3/... on collision within this course.
export function lessonSlugs(lessons) {
  const seen = new Map()
  return lessons.map((lesson) => {
    const base = slugify(lesson.title) || 'lesson'
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  })
}

// Draft a single lesson. Used both by the initial pass and by run.js's per-lesson
// retry when QA flags one specific lesson.
export async function draftLesson(config, { courseTitle, lesson }) {
  const figureNotes = (lesson.inlineFigures || [])
    .map((fig, j) => `  ${j + 1}. Placement: ${fig.placement}`)
    .join('\n')

  const prompt = `Write the full lesson body for "${lesson.title}", part of the course "${courseTitle}".

Learning objective: ${lesson.objective}

Key points to cover (in a sensible order, expanded with real explanation and examples, not just
restated as a list):
${lesson.keyPoints.map((p) => `- ${p}`).join('\n')}

Target length: about ${lesson.readTimeMinutes * 200} words (${lesson.readTimeMinutes} minutes at
200 wpm).

Format as markdown: an h2 (##) for each major section, no h1 (the title is rendered separately),
short paragraphs, and a blockquote (>) for one memorable pull-quote somewhere in the piece.

This lesson has ${(lesson.inlineFigures || []).length} inline figure(s). Insert each one on its
own line, alone, as an exact marker "[[FIGURE:N]]" (N starting at 1) at the point described below:
${figureNotes || '  (none)'}

Do not add a summary of "what we covered", just end when the content naturally concludes.`

  return generateText(config, { system: config.voice, prompt })
}

// Stage 2: expand each storyboard lesson into a full long-form markdown draft,
// with a [[FIGURE:N]] marker (1-based, matching storyboard.lessons[i].inlineFigures)
// placed where the storyboard's placement note says it belongs.
export async function runDraft({ config, outDir, slug, storyboard }) {
  const dir = workDir(outDir, slug)
  const draftsDir = path.join(dir, 'drafts')
  const slugs = lessonSlugs(storyboard.lessons)

  const drafts = []
  for (let i = 0; i < storyboard.lessons.length; i++) {
    const lesson = storyboard.lessons[i]
    const lessonSlug = slugs[i]
    const outFile = path.join(draftsDir, `${lessonSlug}.md`)

    if (fs.existsSync(outFile)) {
      console.log(`  draft exists, skipping: ${lessonSlug}`)
      drafts.push({ lessonSlug, file: outFile, markdown: fs.readFileSync(outFile, 'utf8') })
      continue
    }

    const markdown = await draftLesson(config, { courseTitle: storyboard.title, lesson })
    fs.mkdirSync(draftsDir, { recursive: true })
    fs.writeFileSync(outFile, markdown)
    console.log(`  draft written: ${lessonSlug} (${markdown.split(/\s+/).length} words)`)
    drafts.push({ lessonSlug, file: outFile, markdown })
  }

  return { slugs, drafts }
}
