import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Question } from './ConversationQuestion';
import type { Entry } from './events';
afterEach(cleanup);
const question: Entry = {
  id: 'ask',
  agentId: 'maya',
  kind: 'ask',
  text: 'Choose a direction',
  pending: true,
  payload: {
    type: 'ask',
    requestId: 'request',
    questions: [
      {
        id: 'direction',
        prompt: 'Which direction?',
        required: true,
        options: [
          { id: 'daily', label: 'Everyday life' },
          { id: 'product', label: 'Product capabilities' },
        ],
      },
    ],
  },
};
it('requires an explicit selection and sends the provider option ID', async () => {
  const reply = vi.fn().mockResolvedValue(undefined);
  render(<Question entry={question} reply={reply} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send response' }));
  await screen.findByRole('alert');
  expect(reply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: 'Everyday life' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send response' }));
  await waitFor(() =>
    expect(reply).toHaveBeenCalledWith({
      kind: 'ask/reply',
      requestId: 'request',
      to: ['maya'],
      answers: { direction: { value: 'daily' } },
    }),
  );
});
it('keeps a failed reply editable and shows the recorded label after resolution', async () => {
  const reply = vi.fn().mockRejectedValue(new Error('Disconnected'));
  const { rerender } = render(<Question entry={question} reply={reply} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Product capabilities' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send response' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Disconnected');
  expect(
    (screen.getByRole('radio', { name: 'Product capabilities' }) as HTMLInputElement).checked,
  ).toBe(true);
  rerender(
    <Question
      entry={{
        ...question,
        pending: false,
        payload: { ...question.payload, answers: { direction: { value: 'product' } } },
      }}
      reply={reply}
    />,
  );
  expect(screen.getByText('Product capabilities')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Send response' })).toBeNull();
});
it('supports multi-select options and sends their IDs together', async () => {
  const reply = vi.fn().mockResolvedValue(undefined);
  const entry = {
    ...question,
    payload: {
      ...question.payload,
      questions: question.payload.questions!.map((q) => ({ ...q, input: { multiple: true } })),
    },
  };
  render(<Question entry={entry} reply={reply} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Everyday life' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Product capabilities' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send response' }));
  await waitFor(() =>
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ answers: { direction: { value: ['daily', 'product'] } } }),
    ),
  );
});
it('replaces a selected choice with a custom answer when permitted', async () => {
  const reply = vi.fn().mockResolvedValue(undefined);
  const entry = {
    ...question,
    payload: {
      ...question.payload,
      questions: question.payload.questions!.map((q) => ({ ...q, input: { allowCustom: true } })),
    },
  };
  render(<Question entry={entry} reply={reply} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Everyday life' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Custom answer: Which direction?' }), {
    target: { value: 'Help with architecture' },
  });
  expect((screen.getByRole('radio', { name: 'Everyday life' }) as HTMLInputElement).checked).toBe(
    false,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Send response' }));
  await waitFor(() =>
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ answers: { direction: { value: 'Help with architecture' } } }),
    ),
  );
});
