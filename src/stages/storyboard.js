import path from 'node:path'
import { generateText } from '../textgen.js'
import { slugify } from '../sanitize.js'
import { workDir, writeJson, readJson, exists } from '../lib/paths.js'

const STORYBOARD_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    heroPrompt: { type: 'string' },
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          objective: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          readTimeMinutes: { type: 'integer' },
          heroPrompt: { type: 'string' },
          inlineFigures: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                prompt: { type: 'string' },
                placement: { type: 'string' },
              },
              required: ['prompt', 'placement'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'objective', 'keyPoints', 'readTimeMinutes', 'heroPrompt', 'inlineFigures'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'subtitle', 'heroPrompt', 'lessons'],
  additionalProperties: false,
}

// Stage 1: turn a topic/brief into a structured storyboard (course + per-lesson
// outline, hero/figure concepts) as a single JSON-schema-constrained LLM call.
export async function runStoryboard({ config, outDir, topic, lessonCount = 8, courseId }) {
  const slug = courseId || slugify(topic)
  const dir = workDir(outDir, slug)
  const outFile = path.join(dir, 'storyboard.json')

  if (exists(outFile)) {
    console.log(`  storyboard exists, skipping: ${outFile}`)
    return { slug, storyboard: readJson(outFile) }
  }

  const prompt = `Design a course storyboard on this topic/brief:

"${topic}"

Also give the course itself a one-to-two sentence hero image concept (heroPrompt), a course-wide
abstract editorial visual metaphor, no text/logos in the image.

Produce exactly ${lessonCount} lessons that build on each other in a sensible order, going from
foundational to practical. For each lesson give a working title, a one-sentence learning
objective, 3 to 6 key points the lesson must cover, a realistic read time in minutes (10-16),
a one-to-two sentence hero image concept (an abstract, editorial visual metaphor, no text/logos
in the image), and 1 to 2 inline figure concepts (each with its own visual prompt and a short
note on where in the lesson it belongs, e.g. "after introducing X").`

  const storyboard = await generateText(config, {
    system: config.voice,
    prompt,
    jsonSchema: STORYBOARD_SCHEMA,
    schemaName: 'course_storyboard',
  })

  writeJson(outFile, storyboard)
  console.log(`  storyboard written: ${outFile} (${storyboard.lessons.length} lessons)`)
  return { slug, storyboard }
}
