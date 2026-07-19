function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleScore(line, title) {
  if (!line || !title) return 0;
  if (line === title) return 3000 + title.length;
  const shared = Math.min(line.length, title.length);
  if (shared >= 10 && (line.startsWith(title) || title.startsWith(line))) return 2000 + shared;
  if (title.length >= 10 && line.includes(title)) return 1000 + title.length;
  return 0;
}

function pinVoiceTarget(store, recognizedLines) {
  const lines = (recognizedLines || []).slice(0, 8).map(normalizeTitle).filter(Boolean);
  const matches = store.listRecent(50).map((thread) => {
    const title = normalizeTitle(thread.title);
    const score = Math.max(0, ...lines.map((line) => titleScore(line, title)));
    return { thread, score };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);

  if (!matches.length) return null;
  if (matches[1] && matches[1].score === matches[0].score && matches[1].thread.id !== matches[0].thread.id) {
    return null;
  }
  return Object.freeze({
    id: matches[0].thread.id,
    title: matches[0].thread.title || 'Untitled task',
  });
}

module.exports = { normalizeTitle, pinVoiceTarget };
