import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useConversation } from './useConversation';
import { send } from './api';
vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    history: vi.fn().mockResolvedValue([]),
    send: vi.fn(),
    request: vi.fn(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    ),
  };
});
afterEach(cleanup);
it('rejects unpersisted provider launch errors so the composer can restore its draft', async () => {
  vi.mocked(send).mockImplementation(async (_id, _input, options) => {
    options.onEvent({
      payload: { type: 'error', code: 'send', message: 'Authentication required' },
    });
  });
  const { result } = renderHook(() => useConversation('live-check'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await expect(result.current.submit({ text: 'Hello' })).rejects.toThrow(
      'Authentication required',
    );
  });
  expect(result.current.error).toBe('Authentication required');
  expect(result.current.sending).toBe(false);
});
