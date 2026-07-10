import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// gpt-image-1 supports 1024x1024, 1024x1536, 1536x1024, auto.
const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto'])

// Generate an image via OpenAI, save it under outDir, and return its filename.
// Pass a stable `filename` to make image generation idempotent (skip-if-exists is
// the caller's job, e.g. stages/illustrate.js). config.imageStyle is appended to
// every prompt unless `plain: true`.
export async function generateImageFile(config, { prompt, size = '1536x1024', plain = false, outDir, filename }) {
  if (!prompt || !prompt.trim()) {
    const e = new Error('A prompt is required')
    e.status = 400
    throw e
  }

  const finalSize = ALLOWED_SIZES.has(size) ? size : '1536x1024'
  const finalPrompt = plain || !config.imageStyle ? prompt.trim() : `${prompt.trim()}\n\n${config.imageStyle}`

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({ model: config.imageModel, prompt: finalPrompt, size: finalSize, n: 1 }),
  })

  const data = await resp.json()
  if (!resp.ok) {
    const e = new Error(data?.error?.message || `OpenAI error (${resp.status})`)
    e.status = 502
    throw e
  }

  const b64 = data?.data?.[0]?.b64_json
  if (!b64) {
    const e = new Error('No image returned by OpenAI')
    e.status = 502
    throw e
  }

  const name = filename || `${crypto.randomUUID()}.png`
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'))
  return name
}
