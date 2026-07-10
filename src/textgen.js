import fs from 'node:fs'
import path from 'node:path'

async function chatCompletion(config, body) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({ model: config.textModel, ...body }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const e = new Error(data?.error?.message || `OpenAI error (${resp.status})`)
    e.status = 502
    throw e
  }
  const choice = data?.choices?.[0]
  const content = choice?.message?.content
  if (!content) {
    const e = new Error('No content returned by OpenAI')
    e.status = 502
    throw e
  }
  return content
}

// Plain long-form text generation (storyboard prose, drafts, authoring passes).
// Pass { schemaName, jsonSchema } to force a structured JSON response; otherwise
// returns the raw string content.
export async function generateText(config, { system, prompt, jsonSchema, schemaName = 'result' }) {
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt })

  const body = { messages }
  if (jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: schemaName, strict: true, schema: jsonSchema },
    }
  }

  const content = await chatCompletion(config, body)
  return jsonSchema ? JSON.parse(content) : content
}

function imageToDataUrl(filePathOrBuffer) {
  if (Buffer.isBuffer(filePathOrBuffer)) {
    return `data:image/png;base64,${filePathOrBuffer.toString('base64')}`
  }
  const ext = path.extname(filePathOrBuffer).slice(1).toLowerCase() || 'png'
  const mime = ext === 'jpg' ? 'jpeg' : ext
  const buf = fs.readFileSync(filePathOrBuffer)
  return `data:image/${mime};base64,${buf.toString('base64')}`
}

// Multimodal review: send a text rubric plus one or more images (file paths or
// Buffers) to a vision-capable model. Used by the QA stage to check that generated
// images match their surrounding copy and that a full-page screenshot has nothing
// cut off, overlapping, or clipped. Always returns structured JSON.
export async function reviewImages(config, { system, prompt, images, jsonSchema, schemaName = 'review' }) {
  const content = [{ type: 'text', text: prompt }]
  for (const img of images || []) {
    content.push({ type: 'image_url', image_url: { url: imageToDataUrl(img) } })
  }

  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content })

  const schema = jsonSchema || {
    type: 'object',
    properties: {
      pass: { type: 'boolean' },
      issues: { type: 'array', items: { type: 'string' } },
    },
    required: ['pass', 'issues'],
    additionalProperties: false,
  }

  const raw = await chatCompletion(config, {
    messages,
    response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
  })
  return JSON.parse(raw)
}
