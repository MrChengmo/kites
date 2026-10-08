import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { UserContent } from './ConversationContent';
afterEach(cleanup);
it('renders runtime upload references as file cards while retaining prompt text', () => {
  const { container } = render(
    <UserContent
      text={
        'Read this\n\nAttached files (in your environment):\nbrief.txt: /Volumes/T7/kites/.agentway-uploads/id/brief.txt'
      }
    />,
  );
  expect(screen.getByText('Read this')).toBeTruthy();
  expect(screen.getByText('brief.txt')).toBeTruthy();
  expect(container.querySelector('.message-file-card')?.getAttribute('title')).toBe(
    '/Volumes/T7/kites/.agentway-uploads/id/brief.txt',
  );
  expect(screen.queryByText(/Attached files \(in/)).toBeNull();
});
it('does not hide ordinary user text that resembles an attachment marker', () => {
  render(
    <UserContent
      text={'Notes\n\nAttached files (in your environment):\nThis is only an example.'}
    />,
  );
  expect(screen.getByText(/This is only an example/)).toBeTruthy();
});
