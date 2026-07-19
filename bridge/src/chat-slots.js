function trimTitle(title, fallback = 'Codex') {
  const normalized = String(title || fallback).replace(/\s+/g, ' ').trim();
  return normalized.length > 24 ? `${normalized.slice(0, 23)}…` : normalized;
}

function buildRecentSlots(threads) {
  return Array.from({ length: 6 }, (_, index) => {
    const thread = threads[index];
    if (!thread) return {
      slot: index + 1,
      threadId: null,
      title: '',
      rolloutPath: null,
      model: '',
      reasoning: '',
    };
    return {
      slot: index + 1,
      threadId: thread.id,
      title: trimTitle(thread.title),
      rolloutPath: thread.rolloutPath,
      model: String(thread.model || ''),
      reasoning: String(thread.reasoning || ''),
      updatedAt: Number(thread.updatedAt || 0),
    };
  });
}

function buildCustomSlots(threadIds, threads) {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  return Array.from({ length: 6 }, (_, index) => {
    const threadId = threadIds[index] || null;
    const thread = byId.get(threadId);
    return {
      slot: index + 1,
      threadId,
      title: threadId ? trimTitle(thread && thread.title, 'Unavailable chat') : '',
      rolloutPath: thread ? thread.rolloutPath : null,
      model: thread ? String(thread.model || '') : '',
      reasoning: thread ? String(thread.reasoning || '') : '',
      updatedAt: thread ? Number(thread.updatedAt || 0) : 0,
      unavailable: Boolean(threadId && !thread),
    };
  });
}

function seedStableThreadIds(threadIds, recentThreads) {
  const seeded = [...threadIds, null, null, null, null, null, null].slice(0, 6);
  seeded[0] = null;
  const used = new Set(seeded.filter(Boolean));
  const candidates = recentThreads.filter((thread) => thread && thread.id && !used.has(thread.id));
  let candidateIndex = 0;
  for (let index = 1; index < 6; index++) {
    if (!seeded[index] && candidates[candidateIndex]) {
      seeded[index] = candidates[candidateIndex++].id;
    }
  }
  return seeded;
}

function buildStableSlots(threadIds, threads) {
  const pinned = buildCustomSlots(threadIds, threads);
  pinned[0] = {
    slot: 1,
    threadId: null,
    title: 'ACTIVE WINDOW',
    rolloutPath: null,
    model: '',
    reasoning: '',
    activeRoute: true,
  };
  return pinned;
}

function buildRollingSlots(threads) {
  const slots = buildRecentSlots(threads.slice(0, 5));
  for (let index = 5; index >= 1; index--) {
    slots[index] = { ...slots[index - 1], slot: index + 1 };
  }
  slots[0] = {
    slot: 1,
    threadId: null,
    title: 'ACTIVE WINDOW',
    rolloutPath: null,
    model: '',
    reasoning: '',
    activeRoute: true,
  };
  return slots;
}

function loadSlots(store, config, deckState) {
  if (config.agentSource === 'rolling') {
    return buildRollingSlots(store.listRecent(5));
  }
  if (config.agentSource === 'custom') {
    const threads = store.listByIds(deckState.customThreads);
    return buildCustomSlots(deckState.customThreads, threads);
  }
  return buildRecentSlots(store.listRecent(6));
}

module.exports = {
  buildCustomSlots,
  buildRecentSlots,
  buildRollingSlots,
  buildStableSlots,
  loadSlots,
  seedStableThreadIds,
  trimTitle,
};
