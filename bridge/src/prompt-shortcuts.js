const AVAILABLE_KEY_ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
];

const AVAILABLE_KEYS = AVAILABLE_KEY_ROWS.flat();
const AVAILABLE_KEY_SET = new Set(AVAILABLE_KEYS);
const DELIVERY_MODES = new Set(['queue', 'steer', 'draft']);

function normalizeKey(value) {
  const key = String(value || '').toLowerCase();
  if (!AVAILABLE_KEY_SET.has(key)) throw new Error('Choose an available Cardputer key');
  return key;
}

function normalizePromptShortcut(value) {
  const key = normalizeKey(value && value.key);
  const label = String(value && value.label || '').trim();
  const prompt = String(value && value.prompt || '').trim();
  const delivery = String(value && value.delivery || 'queue').toLowerCase();
  if (!label) throw new Error('Give the shortcut a short name');
  if (label.length > 12) throw new Error('Shortcut names can be at most 12 characters');
  if (!prompt) throw new Error('Add the prompt that this shortcut should type');
  if (prompt.length > 4000) throw new Error('Shortcut prompts can be at most 4000 characters');
  if (!DELIVERY_MODES.has(delivery)) throw new Error('Delivery must be queue, steer, or draft');
  return { key, label, prompt, delivery };
}

function normalizePromptShortcuts(values) {
  const byKey = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    try {
      const shortcut = normalizePromptShortcut(value);
      byKey.set(shortcut.key, shortcut);
    } catch {
      // Ignore stale or hand-edited entries that are no longer valid.
    }
  }
  return AVAILABLE_KEYS.filter((key) => byKey.has(key)).map((key) => byKey.get(key));
}

function upsertPromptShortcut(values, value) {
  const shortcut = normalizePromptShortcut(value);
  const next = normalizePromptShortcuts(values).filter((item) => item.key !== shortcut.key);
  next.push(shortcut);
  return normalizePromptShortcuts(next);
}

module.exports = {
  AVAILABLE_KEYS,
  AVAILABLE_KEY_ROWS,
  normalizeKey,
  normalizePromptShortcut,
  normalizePromptShortcuts,
  upsertPromptShortcut,
};
