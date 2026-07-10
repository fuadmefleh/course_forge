#!/usr/bin/env node
import path from 'node:path'
import { runPipeline } from '../src/run.js'
import { servePreview } from '../src/render/previewServer.js'

function parseFlags(argv) {
  const flags = {}
  const positional = []
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/)
    if (m) flags[m[1]] = m[2]
    else if (arg.startsWith('--')) flags[arg.slice(2)] = true
    else positional.push(arg)
  }
  return { positional, flags }
}

function usage() {
  console.error(`course-forge — turn a topic into a fully drafted, illustrated, QA-checked course.

Usage:
  course-forge run "<topic or brief>" [--lessons=8] [--course-id=slug] [--out=./output]
                                       [--config=./course-forge.config.json] [--force-images]
                                       [--base-url=URL] [--sqlite=./output/course.db]

  course-forge preview <bundle-dir> [--port=N]

Requires OPENAI_API_KEY in the environment.`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)

  if (command === 'run') {
    const { positional, flags } = parseFlags(rest)
    const topic = positional.join(' ')
    if (!topic) return usage(), process.exit(1)

    const { slug, courseDir, report } = await runPipeline({
      topic,
      lessonCount: Number(flags.lessons) || 8,
      courseId: typeof flags['course-id'] === 'string' ? flags['course-id'] : undefined,
      outDirPath: flags.out || 'output',
      configPath: flags.config,
      forceImages: Boolean(flags['force-images']),
      baseUrl: flags['base-url'],
      sqlitePath: flags.sqlite,
    })

    if (!report.pass) {
      console.log(`\nQA still failing after retries. Bundle is at ${courseDir} for you to look at`)
      console.log(`(see .work/${slug}/qa-report.json and .work/${slug}/screenshots/ under your output dir).`)
      process.exit(1)
    }

    console.log(`\nDone. Course "${slug}" passed QA.`)
    console.log(`  Bundle: ${courseDir}`)
    console.log(`  Preview it: course-forge preview ${courseDir}`)
    return
  }

  if (command === 'preview') {
    const { positional, flags } = parseFlags(rest)
    const dir = positional[0]
    if (!dir) return usage(), process.exit(1)

    const preview = await servePreview(dir, Number(flags.port) || 0)
    console.log(`Serving ${path.resolve(dir)}`)
    console.log(`  ${preview.url}/index.html`)
    console.log('Press Ctrl+C to stop.')
    process.on('SIGINT', async () => {
      await preview.close()
      process.exit(0)
    })
    return
  }

  usage()
  process.exit(1)
}

main().catch((err) => {
  console.error('\nFAILED:', err.stack || err.message)
  process.exit(1)
})
