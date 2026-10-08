import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatRow } from './ChatRow';
afterEach(cleanup);
function setup(archived = false) {
  const actions = {
    onArchive: vi.fn(async () => {}),
    onPin: vi.fn(async () => {}),
    onDelete: vi.fn(),
    onDetails: vi.fn(),
  };
  const open = vi.fn();
  const view = render(
    <ChatRow label="Bob" archived={archived} {...actions}>
      <button onClick={open}>Bob</button>
    </ChatRow>,
  );
  return { ...view, ...actions, open };
}
it('exposes delete, archive and restore without opening a conversation', async () => {
  const actions = setup();
  fireEvent.click(screen.getByLabelText('Chat actions for Bob'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete conversation' }));
  expect(actions.onDelete).toHaveBeenCalledOnce();
  expect(actions.open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('Chat actions for Bob'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Archive chat' }));
  await waitFor(() => expect(actions.onArchive).toHaveBeenCalledOnce());
  cleanup();
  setup(true);
  fireEvent.click(screen.getByLabelText('Chat actions for Bob'));
  expect(screen.getByRole('menuitem', { name: 'Restore chat' })).toBeTruthy();
});
it('handles touch swipes, suppresses accidental opening, and preserves vertical scrolling', async () => {
  class TouchPointer extends MouseEvent {
    pointerType = 'touch';
    pointerId = 1;
  }
  vi.stubGlobal('PointerEvent', TouchPointer);
  const actions = setup();
  const row = actions.container.querySelector('.chat-row-surface')!;
  fireEvent.pointerDown(row, { clientX: 200, clientY: 100 });
  fireEvent.pointerMove(row, { clientX: 90, clientY: 102 });
  fireEvent.pointerUp(row);
  fireEvent.click(screen.getByText('Bob'));
  await waitFor(() => expect(actions.onArchive).toHaveBeenCalledOnce());
  expect(actions.open).not.toHaveBeenCalled();
  fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(row, { clientX: 205, clientY: 102 });
  fireEvent.pointerUp(row);
  await waitFor(() => expect(actions.onPin).toHaveBeenCalledOnce());
  fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(row, { clientX: 104, clientY: 180 });
  fireEvent.pointerMove(row, { clientX: 220, clientY: 190 });
  fireEvent.pointerUp(row);
  expect(actions.onPin).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
it('reports failures and keeps actions available for retry', async () => {
  render(
    <ChatRow
      label="Bob"
      onArchive={async () => {
        throw new Error('Offline');
      }}
      onPin={async () => {}}
      onDelete={vi.fn()}
      onDetails={vi.fn()}
    >
      <button>Bob</button>
    </ChatRow>,
  );
  fireEvent.click(screen.getByLabelText('Chat actions for Bob'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Archive chat' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Offline'));
  expect(screen.getByLabelText('Chat actions for Bob').hasAttribute('disabled')).toBe(false);
});
