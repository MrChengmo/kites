import { afterEach, expect, it, vi } from 'vitest';
import { mentionedRecipients, prepareAttachments, readAttachments } from './attachments';
import type { Session } from './types';
const session: Session = {
  id: 's',
  status: 'idle',
  spec: { EnvironmentID: 'env' },
  members: [],
  agents: [
    { id: 'a', status: 'idle', spec: { Kind: 'codex', Metadata: { 'kites.name': 'Maya' } } },
    { id: 'b', status: 'idle', spec: { Kind: 'codex', Metadata: { 'kites.name': 'Theo Lin' } } },
  ],
};
afterEach(() => vi.unstubAllGlobals());
it('routes exact mentions including names with spaces and ignores email addresses', () => {
  expect(mentionedRecipients('@Maya and @Theo Lin, review this.', session.agents)).toEqual([
    'a',
    'b',
  ]);
  expect(mentionedRecipients('mail@Maya @Mayakovsky', session.agents)).toEqual([]);
});
it('reads files and images, and rejects oversized attachments', async () => {
  const result = await readAttachments(
    [new File(['hello'], 'brief.txt', { type: 'text/plain' })],
    [],
  );
  expect(result[0]).toEqual({ name: 'brief.txt', mimeType: 'text/plain', data: 'aGVsbG8=' });
  await expect(
    readAttachments([new File([new Uint8Array(1500001)], 'large.pdf')], []),
  ).rejects.toThrow('1.5 MB');
});
it('uploads documents to the real environment while retaining inline images', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ path: '/work/.kites-uploads/id/brief.txt' }));
  vi.stubGlobal('fetch', fetcher);
  const image = { name: 'photo.png', data: 'eA==', mimeType: 'image/png' };
  const prepared = await prepareAttachments(
    session,
    [{ name: 'brief.txt', data: 'aGVsbG8=', mimeType: 'text/plain' }, image],
    ['a'],
  );
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/environments/env/files');
  expect(prepared.references).toContain('/work/.kites-uploads/id/brief.txt');
  expect(prepared.images).toEqual([image]);
});
it('does not upload group documents to the wrong environment', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const other = {
    ...session,
    agents: [
      session.agents[0],
      { ...session.agents[1], spec: { ...session.agents[1].spec, EnvironmentID: 'other' } },
    ],
  };
  await expect(
    prepareAttachments(other, [{ name: 'x', data: 'eA==', mimeType: 'text/plain' }], ['a', 'b']),
  ).rejects.toThrow('one environment');
  expect(fetcher).not.toHaveBeenCalled();
});
