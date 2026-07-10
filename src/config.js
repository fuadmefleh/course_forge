import fs from 'node:fs'
import path from 'node:path'

const DEFAULTS = {
  voice: 'Clear, calm, precise, and engaging instructional voice. Plain English, no unnecessary ' +
    'jargon, no filler, no hype, no exclamation points. Prefer concrete examples over abstract claims.',
  imageStyle: 'Clean, professional editorial illustration. Abstract and conceptual, no readable ' +
    'text, no logos. Generous negative space, restrained color palette, high quality, no artifacts.',
  textModel: 'gpt-5',
  imageModel: 'gpt-image-1',
  brandColor: '#2563eb',
}

// Loads course-forge.config.json (if present) merged over sane defaults, plus the
// OpenAI key from the environment. No repo-relative key-file fallback (unlike the
// internal Infineray tool this was extracted from) — that's a private-repo dev
// convenience, not appropriate for a published CLI.
export function loadConfig({ configPath } = {}) {
  const resolvedPath = configPath || (fs.existsSync('course-forge.config.json') ? 'course-forge.config.json' : null)

  let fileConfig = {}
  if (resolvedPath) {
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`)
    }
    fileConfig = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
  }

  const config = { ...DEFAULTS, ...fileConfig }
  config.openaiApiKey = (process.env.OPENAI_API_KEY || '').trim()
  config.textModel = process.env.OPENAI_TEXT_MODEL || config.textModel
  config.imageModel = process.env.OPENAI_IMAGE_MODEL || config.imageModel
  return config
}

export function requireApiKey(config) {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set. Export it in your shell before running course-forge.')
  }
}

export function resolveOutDir(outDir) {
  const dir = path.resolve(outDir || 'output')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
