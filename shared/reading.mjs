// Only committed, visible conversation content contributes to unread state.
export function readingItems(events) {
  const requests = new Set();
  return events.filter((event) => {
    const p = event.payload || {};
    if (!Number.isSafeInteger(event.seq) || event.seq < 1 || p.partial) return false;
    if (p.type === 'ask') {
      const key = `${event.agent_id}:${p.requestId}`;
      if (!p.awaitingReply || requests.has(key)) return false;
      requests.add(key);
      return true;
    }
    return ['text', 'image', 'error', 'user/message'].includes(p.type);
  });
}
export function previewText(event) {
  const p = event?.payload || {};
  const contentText = (value) =>
    typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value
            .map((item) => contentText(item.text ?? item.content))
            .filter(Boolean)
            .join(' ')
        : '';
  return (
    (p.type === 'image'
      ? 'Image'
      : p.type === 'ask'
        ? p.title || 'Your input is needed'
        : p.type === 'error'
          ? p.message
          : p.prompt ||
            contentText(p.content) ||
            (p.messages || []).map((message) => contentText(message.content)).join(' ')
    )
      ?.replace(/(^|\n)#{1,6}\s+/g, '$1')
      .replace(/\*\*|__|`/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 180) || ''
  );
}
export function readingSummary(events, readSeq = 0) {
  const items = readingItems(events);
  const unread = items.filter(
    (event) => event.payload.type !== 'user/message' && event.seq > readSeq,
  );
  const last = items.at(-1);
  return {
    readSeq,
    unread: unread.length,
    firstUnreadSeq: unread[0]?.seq,
    latestSeq: last?.seq || 0,
    preview: previewText(last),
    updatedAt: last?.created_at,
  };
}
