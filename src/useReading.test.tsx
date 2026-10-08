import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useReading } from './useReading';
const api = vi.hoisted(() => ({ getReading: vi.fn(), markReading: vi.fn() }));
vi.mock('./api', () => api);
function Harness() {
  const scroll = useRef<HTMLDivElement>(null);
  const reading = useReading(
    'chat',
    [{ seq: 2, payload: { type: 'text', content: 'Reply' } }],
    false,
    scroll,
  );
  return (
    <div ref={scroll} data-testid="scroll">
      <span data-read-seq="2">Reply</span>
      <output data-testid="position" data-boundary={reading.boundary}>
        {reading.ready ? 'ready' : 'loading'} · {reading.unread}
      </output>
    </div>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function setup(bottom: number, focus: boolean) {
  api.getReading.mockResolvedValue({ chat: { readSeq: 0, firstUnreadSeq: 2 } });
  api.markReading.mockResolvedValue({ readSeq: 2 });
  vi.spyOn(document, 'hasFocus').mockReturnValue(focus);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return {
      top: 0,
      bottom: this.hasAttribute('data-read-seq') ? bottom : 300,
      left: 0,
      right: 390,
      width: 390,
      height: bottom,
      x: 0,
      y: 0,
      toJSON() {},
    };
  });
  render(<Harness />);
}
it('only saves a response after its end is visible in the foreground', async () => {
  setup(200, true);
  await waitFor(() => expect(api.markReading).toHaveBeenCalledWith('chat', 2), { timeout: 1800 });
  expect(screen.getByText('ready · 0')).toBeTruthy();
});
it('does not mark a long response that extends beneath the viewport', async () => {
  setup(500, true);
  await screen.findByText('ready · 1');
  fireEvent.scroll(screen.getByTestId('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 750));
  expect(api.markReading).not.toHaveBeenCalled();
});
it('does not clear unread messages in a background window', async () => {
  setup(200, false);
  await screen.findByText('ready · 1');
  fireEvent.scroll(screen.getByTestId('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 750));
  expect(api.markReading).not.toHaveBeenCalled();
});

it('recovers the unread boundary after an initial connection failure', async () => {
  setup(500, true);
  await screen.findByText('ready · 1');
  api.getReading.mockRejectedValueOnce(new Error('Offline'));
  cleanup();
  render(<Harness />);
  await waitFor(() => expect(api.getReading).toHaveBeenCalledTimes(2));
  await screen.findByText('ready · 1');
  api.getReading.mockResolvedValue({ chat: { readSeq: 0, firstUnreadSeq: 2 } });
  fireEvent(window, new Event('focus'));
  await waitFor(() =>
    expect(screen.getByTestId('position').getAttribute('data-boundary')).toBe('2'),
  );
  expect(api.markReading).not.toHaveBeenCalled();
});
