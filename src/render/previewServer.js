import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
}

// A tiny static file server for one bundle directory, used both by the QA stage
// (to give Playwright a real page to load) and by `course-forge preview` (for a
// human to eyeball the result in a browser). No dependency beyond node:http.
export function servePreview(rootDir, port = 0) {
  const root = path.resolve(rootDir)

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0])
    let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath)

    if (!filePath.startsWith(root)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
        return
      }
      const ext = path.extname(filePath).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(data)
    })
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      })
    })
  })
}
