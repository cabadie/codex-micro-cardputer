const NAMED_KEYS = new Map([
  [0x28, 'enter'],
  [0x29, 'escape'],
  [0x2a, 'backspace'],
  [0x2b, 'tab'],
  [0x4f, 'right'],
  [0x50, 'left'],
  [0x51, 'down'],
  [0x52, 'up'],
]);

const PRINTABLE_KEYS = new Map([
  [0x2c, ' '], [0x2d, '-'], [0x2e, '='], [0x2f, '['],
  [0x30, ']'], [0x31, '\\'], [0x33, ';'], [0x34, "'"],
  [0x35, '`'], [0x36, ','], [0x37, '.'], [0x38, '/'],
]);

function printableKey(usage) {
  if (usage >= 0x04 && usage <= 0x1d) return String.fromCharCode(97 + usage - 0x04);
  if (usage >= 0x1e && usage <= 0x26) return String(usage - 0x1d);
  if (usage === 0x27) return '0';
  return PRINTABLE_KEYS.get(usage) || null;
}

function decodeHidReport(value) {
  const usage = Array.isArray(value?.keys) ? Number(value.keys.find((key) => Number(key) > 0)) : 0;
  if (!usage) return null;
  const bits = Number(value.modifiers || 0);
  const modifiers = [];
  if (bits & 0x08) modifiers.push('command');
  if (bits & 0x02) modifiers.push('shift');
  if (bits & 0x04) modifiers.push('option');
  if (bits & 0x01) modifiers.push('control');
  const named = NAMED_KEYS.get(usage);
  if (named) return { key: named, modifiers, named: true };
  const key = printableKey(usage);
  return key ? { key, modifiers, named: false } : null;
}

module.exports = { decodeHidReport };
