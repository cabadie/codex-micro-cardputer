const fs = require('node:fs');

const { readTailLines } = require('./codex-events');

function latestCompletedAnswer(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  const lines = readTailLines(filePath);
  for (let index = lines.length - 1; index >= 0; index--) {
    if (!lines[index].trim()) continue;
    try {
      const record = JSON.parse(lines[index]);
      const payload = record.payload || {};
      if (record.type === 'event_msg' && payload.type === 'task_complete') {
        return String(payload.last_agent_message || '').trim();
      }
    } catch {
      // Ignore an incomplete line while Codex is still writing the rollout.
    }
  }
  return '';
}

function cleanForSpeech(value) {
  return String(value || '')
    .replace(/<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_~`|]/g, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeForSpeech(value, maxWords = 24) {
  const cleaned = cleanForSpeech(value);
  if (!cleaned) return '';
  const limit = Math.max(8, Math.min(40, Number(maxWords) || 24));
  const firstSentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  let candidate = firstSentences[0].trim();
  if (candidate.split(/\s+/).length < 8 && firstSentences[1]) {
    candidate = `${candidate} ${firstSentences[1].trim()}`;
  }
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length <= limit) return candidate;
  return `${words.slice(0, limit).join(' ').replace(/[,:;\-–—]+$/, '')}.`;
}

module.exports = { cleanForSpeech, latestCompletedAnswer, summarizeForSpeech };
