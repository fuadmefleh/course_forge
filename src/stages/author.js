import path from 'node:path'
import { marked } from 'marked'
import { generateText } from '../textgen.js'
import { sanitizeBody } from '../sanitize.js'
import { workDir, exists, readJson, writeJson } from '../lib/paths.js'
import { wordCount } from '../lib/html.js'

// Tags the author stage is allowed to use. Deliberately excludes img/figure/figcaption
// (illustrate.js adds those once images exist) and h1 (the title is rendered separately).
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'blockquote', 'code', 'pre', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'hr']

function authorSchema(figureCount) {
  return {
    type: 'object',
    properties: {
      bodyHtml: { type: 'string' },
      excerpt: { type: 'string' },
      figures: {
        type: 'array',
        minItems: figureCount,
        maxItems: figureCount,
        items: {
          type: 'object',
          properties: {
            alt: { type: 'string' },
            caption: { type: 'string' },
          },
          required: ['alt', 'caption'],
          additionalProperties: false,
        },
      },
    },
    required: ['bodyHtml', 'excerpt', 'figures'],
    additionalProperties: false,
  }
}

// Replace a standalone "[[FIGURE:N]]" paragraph (as marked renders it, wrapped in <p>)
// with a literal HTML comment token. Comments are outside the sanitizer's tag allow-list
// on purpose, so a marker can never leak into a published page if a later stage is skipped.
function markersToTokens(html) {
  return html.replace(/<p>\s*\[\[FIGURE:(\d+)\]\]\s*<\/p>/g, '<!--FIG:$1-->')
}

function readTimeLabel(words) {
  const minutes = Math.max(1, Math.round(words / 200))
  return `${minutes} min read`
}

// Author a single lesson (used both by the initial pass and by run.js's per-lesson
// retry when QA flags one specific lesson).
export async function authorLesson(config, { storyLesson, lessonSlug, markdown }) {
  const figureCount = (storyLesson.inlineFigures || []).length
  const baseHtml = markersToTokens(marked.parse(markdown))

  const prompt = `Here is a draft lesson body as HTML (converted from markdown):

---
${baseHtml}
---

Rewrite it into clean final HTML using ONLY these tags: ${ALLOWED_TAGS.join(', ')}.
Rules:
- Keep every "<!--FIG:N-->" comment exactly as-is, in the same relative position, in the same
  order. Do not add, remove, or renumber them.
- Do not introduce any other HTML comments, <img>, <figure>, or <h1> tags.
- Tighten transitions and structure but do not cut content or change the meaning.
- Also write a one-sentence meta excerpt (max 200 characters) for the lesson.
- Also write, for each of the ${figureCount} figure(s) referenced by "<!--FIG:N-->" (in order,
  N=1..${figureCount}), a plain descriptive alt text (max 120 characters, no "image of") and a
  one-sentence caption in the same voice as the body.`

  const result = await generateText(config, {
    system: config.voice,
    prompt,
    jsonSchema: authorSchema(figureCount),
    schemaName: 'authored_lesson',
  })

  let body = result.bodyHtml
  const sanitized = sanitizeBody(body)
  if (sanitized !== body) {
    console.warn(`  WARNING: sanitizer stripped content from "${storyLesson.title}" body`)
    body = sanitized
  }

  const inlineImages = (storyLesson.inlineFigures || []).map((fig, j) => ({
    token: `<!--FIG:${j + 1}-->`,
    prompt: fig.prompt,
    alt: result.figures[j]?.alt || storyLesson.title,
    caption: result.figures[j]?.caption || '',
  }))

  const words = wordCount(body)
  return {
    lessonSlug,
    title: storyLesson.title,
    readTime: readTimeLabel(words),
    excerpt: result.excerpt,
    heroPrompt: storyLesson.heroPrompt,
    inlineImages,
    body,
  }
}

// Stage 3: turn each markdown draft into a course/lesson JSON shape ready for
// illustration: title, readTime, excerpt, heroPrompt, inlineImages[], body, with
// body restricted to the sanitizer's allow-list and figure placeholders left as
// <!--FIG:N-->.
export async function runAuthor({ config, outDir, slug, storyboard, drafts }) {
  const dir = workDir(outDir, slug)
  const outFile = path.join(dir, 'authored.json')

  if (exists(outFile)) {
    console.log(`  authored.json exists, skipping: ${outFile}`)
    return readJson(outFile)
  }

  const lessons = []
  for (let i = 0; i < storyboard.lessons.length; i++) {
    const storyLesson = storyboard.lessons[i]
    const { lessonSlug, markdown } = drafts[i]
    const lesson = await authorLesson(config, { storyLesson, lessonSlug, markdown })
    lessons.push(lesson)
    console.log(`  authored: ${lessonSlug} (${wordCount(lesson.body)} words, ${lesson.inlineImages.length} figures)`)
  }

  const authored = {
    id: slug,
    title: storyboard.title,
    subtitle: storyboard.subtitle,
    heroPrompt: storyboard.heroPrompt,
    lessons,
  }

  writeJson(outFile, authored)
  return authored
}
