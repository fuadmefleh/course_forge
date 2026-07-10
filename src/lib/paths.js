import fs from 'node:fs'
import path from 'node:path'

// Per-course scratch/cache directory, kept separate from the final bundle
// (<outDir>/<slug>/) so intermediate JSON/drafts/screenshots don't clutter the
// deliverable. Re-running the same course resumes from here (each stage skips
// work whose output file already exists).
export function workDir(outDir, slug) {
  const dir = path.join(outDir, '.work', slug)
  fs.mkdirSync(path.join(dir, 'drafts'), { recursive: true })
  return dir
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

export function exists(filePath) {
  return fs.existsSync(filePath)
}
