import fs from 'node:fs'
import path from 'node:path'

// Optional generic SQLite export (--sqlite=<path>). Uses better-sqlite3, which is an
// optionalDependency — dynamically imported so a plain file-bundle run never needs
// native compilation. Schema is deliberately generic (not tied to any particular
// CMS); image columns hold the same bundle-relative paths ("images/foo.png") as the
// HTML output, so whatever serves the bundle's images/ folder can serve these too.
export async function exportSqlite({ sqlitePath, illustrated }) {
  let Database
  try {
    ;({ default: Database } = await import('better-sqlite3'))
  } catch {
    throw new Error(
      "better-sqlite3 isn't installed. Run `npm install better-sqlite3` to use --sqlite."
    )
  }

  fs.mkdirSync(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = new Database(sqlitePath)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS courses (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        subtitle   TEXT NOT NULL DEFAULT '',
        hero_image TEXT,
        published  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id          TEXT NOT NULL,
        course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        read_time   TEXT NOT NULL DEFAULT '',
        excerpt     TEXT NOT NULL DEFAULT '',
        body_html   TEXT NOT NULL DEFAULT '',
        hero_image  TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (course_id, id)
      );
    `)

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM courses WHERE id = ?').run(illustrated.id)
      db.prepare(
        `INSERT INTO courses (id, title, subtitle, hero_image, published)
         VALUES (@id, @title, @subtitle, @hero_image, 1)`
      ).run({
        id: illustrated.id,
        title: illustrated.title,
        subtitle: illustrated.subtitle,
        hero_image: illustrated.heroImage,
      })

      const insertLesson = db.prepare(
        `INSERT INTO lessons (id, course_id, title, read_time, excerpt, body_html, hero_image, order_index)
         VALUES (@id, @course_id, @title, @read_time, @excerpt, @body_html, @hero_image, @order_index)`
      )
      illustrated.lessons.forEach((l, i) => {
        insertLesson.run({
          id: l.lessonSlug,
          course_id: illustrated.id,
          title: l.title,
          read_time: l.readTime,
          excerpt: l.excerpt,
          body_html: l.body,
          hero_image: l.heroImage,
          order_index: i,
        })
      })
    })
    tx()
  } finally {
    db.close()
  }
}
