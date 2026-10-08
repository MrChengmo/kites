export async function readEvents(response, onEvent) {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Agentway returned ${response.status}`);
  }
  if (!response.body) throw new Error('Agentway returned no event stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 8 * 1024 * 1024) throw new Error('An event exceeds the 8 MB limit.');
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (line) onEvent(JSON.parse(line));
      }
      if (done) {
        if (buffer.trim()) onEvent(JSON.parse(buffer));
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
