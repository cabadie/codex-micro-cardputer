const fs = require('node:fs');

// Long-running Codex turns can produce several megabytes after task_started.
// Eight MiB keeps the latest turn boundary in view without reading an entire
// historical rollout on every change.
const MAX_TAIL_BYTES = 8 * 1024 * 1024;

function requiresInput(payload) {
  if (!payload || payload.type !== 'function_call') return false;
  if (['request_user_input', 'request_permissions'].includes(payload.name)) return true;
  if (payload.name !== 'exec_command') return false;
  try {
    const args = typeof payload.arguments === 'string'
      ? JSON.parse(payload.arguments)
      : payload.arguments || {};
    return args.sandbox_permissions === 'require_escalated';
  } catch {
    return false;
  }
}

function reduceRolloutLines(lines) {
  let state = 'idle';
  let pendingInputCall = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = record.payload || {};

    if (record.type === 'event_msg') {
      if (payload.type === 'task_started' || payload.type === 'user_message') state = 'thinking';
      else if (payload.type === 'task_complete') state = 'complete';
      else if (payload.type === 'turn_aborted') state = 'error';
    }

    if (record.type === 'response_item') {
      if (requiresInput(payload)) {
        pendingInputCall = payload.call_id || payload.id || 'pending';
        state = 'requires_input';
      } else if (
        payload.type === 'function_call_output' &&
        pendingInputCall &&
        (!payload.call_id || payload.call_id === pendingInputCall)
      ) {
        pendingInputCall = null;
        state = 'thinking';
      }
    }
  }
  return state;
}

function readTailLines(filePath, maxBytes = MAX_TAIL_BYTES) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    let text = buffer.toString('utf8');
    if (start > 0) {
      const firstNewline = text.indexOf('\n');
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : '';
    }
    return text.split('\n');
  } finally {
    fs.closeSync(fd);
  }
}

class CodexEventTracker {
  constructor() {
    this.cache = new Map();
  }

  statusFor(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return 'idle';
    const stat = fs.statSync(filePath);
    const previous = this.cache.get(filePath);
    if (previous && previous.size === stat.size && previous.mtimeMs === stat.mtimeMs) {
      return previous.state;
    }
    const state = reduceRolloutLines(readTailLines(filePath));
    this.cache.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs, state });
    return state;
  }
}

module.exports = {
  CodexEventTracker,
  readTailLines,
  reduceRolloutLines,
  requiresInput,
};
