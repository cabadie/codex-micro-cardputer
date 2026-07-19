function normalizeTileLabel(value) {
  const label = String(value || '').trim();
  if (!label) return null;
  if (label.length > 24) throw new Error('Cardputer tile names can be at most 24 characters');
  return label;
}

function normalizeTileLabels(values) {
  const result = [null, null, null, null, null, null];
  for (let index = 1; index < 6; index++) {
    try {
      result[index] = normalizeTileLabel(Array.isArray(values) ? values[index] : null);
    } catch {
      result[index] = String(values[index] || '').trim().slice(0, 24) || null;
    }
  }
  return result;
}

function normalizeTaskAliases(values) {
  const result = {};
  if (!values || typeof values !== 'object' || Array.isArray(values)) return result;
  for (const [threadId, value] of Object.entries(values)) {
    if (!threadId) continue;
    try {
      const label = normalizeTileLabel(value);
      if (label) result[threadId] = label;
    } catch {
      const label = String(value || '').trim().slice(0, 24);
      if (label) result[threadId] = label;
    }
  }
  return result;
}

function migrateLegacyAliases(aliases, threadIds, tileLabels) {
  const result = normalizeTaskAliases(aliases);
  for (let index = 1; index < 6; index++) {
    const threadId = Array.isArray(threadIds) ? threadIds[index] : null;
    if (!threadId || result[threadId]) continue;
    const label = normalizeTileLabels(tileLabels)[index];
    if (label) result[threadId] = label;
  }
  return result;
}

module.exports = {
  migrateLegacyAliases,
  normalizeTaskAliases,
  normalizeTileLabel,
  normalizeTileLabels,
};
