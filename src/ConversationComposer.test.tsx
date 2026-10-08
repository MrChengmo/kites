import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Conversation } from './Conversation';
const submit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('./useConversation', () => ({
  useConversation: () => ({
    events: [],
    loading: false,
    sending: false,
    error: '',
    submit,
    interrupt: vi.fn(),
    retry: vi.fn(),
  }),
}));
vi.mock('./useReading', () => ({ useReading: () => ({ ready: true, unread: 0, failure: '' }) }));
const session = {
  id: 'composer-test',
  status: 'idle',
  spec: { EnvironmentID: 'env' },
  members: [],
  agents: [
    { id: 'a', status: 'idle', spec: { Kind: 'codex', Metadata: { 'kites.name': 'Pip' } } },
    { id: 'b', status: 'idle', spec: { Kind: 'codex', Metadata: { 'kites.name': 'Jelly' } } },
  ],
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
function mount() {
  Element.prototype.scrollTo = vi.fn();
  return render(
    <Conversation
      session={session}
      title="Test"
      onBack={() => {}}
      onDetails={() => {}}
      onSaved={async () => {}}
    />,
  );
}
it('chooses a mention with the keyboard and sends only to that bot', async () => {
  mount();
  const input = screen.getByRole('combobox', { name: 'Message' });
  fireEvent.change(input, { target: { value: '@J', selectionStart: 2 } });
  expect(within(screen.getByRole('listbox')).getByRole('option', { name: /Jelly/ })).toBeTruthy();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect((input as HTMLTextAreaElement).value).toBe('@Jelly ');
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ to: ['b'] })));
});
it('accepts dropped files, uploads them, and passes their real path to the bot', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ path: '/work/.kites-uploads/id/brief.txt' })),
  );
  const { container } = mount();
  fireEvent.drop(container.querySelector('.composer')!, {
    dataTransfer: { files: [new File(['hello'], 'brief.txt', { type: 'text/plain' })] },
  });
  await screen.findByText('brief.txt');
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('/work/.kites-uploads/id/brief.txt'),
      }),
    ),
  );
});
it('keeps a dropped file and draft when upload fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ error: 'Upload denied' }, { status: 403 })),
  );
  const { container } = mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Message' }), {
    target: { value: 'Read this' },
  });
  fireEvent.drop(container.querySelector('.composer')!, {
    dataTransfer: { files: [new File(['hello'], 'brief.txt')] },
  });
  await screen.findByText('brief.txt');
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByText('Upload denied');
  expect((screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe(
    'Read this',
  );
  expect(screen.getByText('brief.txt')).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});
it('pastes an image and submits its image payload without treating it as text', async () => {
  mount();
  const image = new File(['pixels'], 'clipboard.png', { type: 'image/png' });
  fireEvent.paste(screen.getByRole('combobox', { name: 'Message' }), {
    clipboardData: { files: [image] },
  });
  await screen.findByRole('button', { name: 'Preview clipboard.png' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ name: 'clipboard.png', mimeType: 'image/png', data: 'cGl4ZWxz' }],
      }),
    ),
  );
});
it('keeps ordinary text paste native and does not send Chinese IME confirmation', () => {
  mount();
  const input = screen.getByRole('combobox', { name: 'Message' });
  expect(fireEvent.paste(input, { clipboardData: { files: [] } })).toBe(true);
  fireEvent.change(input, { target: { value: '你好' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(submit).not.toHaveBeenCalled();
});
it('retains both attachments when reads overlap', async () => {
  const { container } = mount();
  const composer = container.querySelector('.composer')!;
  fireEvent.drop(composer, { dataTransfer: { files: [new File(['a'], 'first.txt')] } });
  fireEvent.drop(composer, { dataTransfer: { files: [new File(['b'], 'second.txt')] } });
  await screen.findByRole('button', { name: 'Remove first.txt' });
  await screen.findByRole('button', { name: 'Remove second.txt' });
});
