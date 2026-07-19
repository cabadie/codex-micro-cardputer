const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const THREAD_COLUMNS = `
  id,
  title,
  cwd,
  rollout_path AS rolloutPath,
  COALESCE(model, '') AS model,
  COALESCE(reasoning_effort, '') AS reasoning,
  COALESCE(updated_at_ms, updated_at * 1000) AS updatedAt
`;

class CodexStore {
  constructor(databasePath, sessionIndexPath = null) {
    this.databasePath = databasePath;
    this.sessionIndexPath = sessionIndexPath;
    this.database = null;
    this.sessionIndexMtime = -1;
    this.sessionTitles = new Map();
  }

  open() {
    if (this.database) return;
    if (!fs.existsSync(this.databasePath)) {
      throw new Error(`Codex state database not found: ${this.databasePath}`);
    }
    this.database = new DatabaseSync(this.databasePath, { readOnly: true });
  }

  close() {
    if (this.database) this.database.close();
    this.database = null;
  }

  loadSessionTitles() {
    if (!this.sessionIndexPath) return this.sessionTitles;
    let stat;
    try {
      stat = fs.statSync(this.sessionIndexPath);
    } catch (error) {
      if (error.code === 'ENOENT') return this.sessionTitles;
      throw error;
    }
    if (stat.mtimeMs === this.sessionIndexMtime) return this.sessionTitles;

    const titles = new Map();
    for (const line of fs.readFileSync(this.sessionIndexPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.id && entry.thread_name) titles.set(entry.id, entry.thread_name);
      } catch { /* ignore an incomplete final line while Codex is writing */ }
    }
    this.sessionIndexMtime = stat.mtimeMs;
    this.sessionTitles = titles;
    return titles;
  }

  withDisplayTitles(threads) {
    const titles = this.loadSessionTitles();
    return threads.map((thread) => ({
      ...thread,
      title: titles.get(thread.id) || thread.title,
    }));
  }

  listRecent(limit = 6) {
    this.open();
    const threads = this.database.prepare(`
      SELECT ${THREAD_COLUMNS}
      FROM threads
      WHERE archived = 0
        AND preview <> ''
        AND LOWER(COALESCE(thread_source, '')) NOT LIKE 'subagent%'
      ORDER BY COALESCE(updated_at_ms, updated_at * 1000) DESC, id DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(50, limit)));
    return this.withDisplayTitles(threads);
  }

  listByIds(ids) {
    this.open();
    const clean = ids.filter(Boolean);
    if (!clean.length) return [];
    const placeholders = clean.map(() => '?').join(',');
    const threads = this.database.prepare(`
      SELECT ${THREAD_COLUMNS}
      FROM threads
      WHERE id IN (${placeholders})
        AND archived = 0
        AND LOWER(COALESCE(thread_source, '')) NOT LIKE 'subagent%'
    `).all(...clean);
    return this.withDisplayTitles(threads);
  }
}

module.exports = { CodexStore };
