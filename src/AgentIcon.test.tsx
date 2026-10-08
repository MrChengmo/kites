import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AgentIcon,
  AgentIconProfiles,
  IconPicker,
  iconKey,
  presets,
  grokPresets,
  kitePresets,
  readIcon,
} from './AgentIcon';
import { AgentForm } from './AgentForms';
import { Avatar } from './ui';
import { createAgent, updateAgent } from './api';
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it('round-trips both new collections and rejects unknown shapes', () => {
  for (const { icon } of [...grokPresets, ...kitePresets])
    expect(readIcon(JSON.stringify(icon))).toEqual(icon);
  for (const character of ['grok:script', 'kite:missing', 'grok:<svg>'])
    expect(readIcon(JSON.stringify({ ...grokPresets[0].icon, character }))).toBeNull();
});
it('persists a Grok avatar through the real bot form', async () => {
  const onSaved = vi.fn();
  render(<AgentForm environments={[]} onSaved={onSaved} />);
  fireEvent.change(screen.getByPlaceholderText('e.g. Maya'), { target: { value: 'Cloud' } });
  fireEvent.click(screen.getByRole('button', { name: 'Grok Bot' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cloud' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create bot' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(readIcon(vi.mocked(createAgent).mock.calls[0][0].Metadata?.[iconKey])).toEqual(
    grokPresets.find((p) => p.name === 'Cloud')!.icon,
  );
});
it('customizes a kite without losing its shape, then previews work without saving the preview state', () => {
  const onChange = vi.fn();
  render(<IconPicker value={kitePresets[0].icon} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
  expect(onChange.mock.calls[0][0].character).toBe('kite:kite');
  expect(onChange.mock.calls[0][0].color).not.toBe(kitePresets[0].icon.color);
  onChange.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Working' }));
  expect(
    document.querySelector('.icon-picker-heading svg')?.getAttribute('data-avatar-state'),
  ).toBe('working');
  expect(onChange).not.toHaveBeenCalled();
});
it('animates Grok geometry, stops its clock on unmount, and honors still and reduced motion', () => {
  const frames: FrameRequestCallback[] = [];
  const request = vi.fn((frame: FrameRequestCallback) => {
    frames.push(frame);
    return frames.length;
  });
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const preference = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => preference),
  );
  const { container, unmount } = render(<AgentIcon icon={grokPresets[1].icon} state="running" />);
  const before = container.querySelector('svg > g')!.innerHTML;
  frames[0](40);
  frames[1](80);
  expect(container.querySelector('svg > g')!.innerHTML).not.toBe(before);
  unmount();
  expect(cancel).toHaveBeenCalled();
  expect(preference.removeEventListener).toHaveBeenCalled();
  request.mockClear();
  const still = render(<AgentIcon icon={{ ...grokPresets[0].icon, motion: 'none' }} />);
  expect(request).not.toHaveBeenCalled();
  still.unmount();
  preference.matches = true;
  render(<AgentIcon icon={grokPresets[0].icon} />);
  expect(request).not.toHaveBeenCalled();
});
it('gives repeated avatars unique SVG mask and clip identifiers', () => {
  const { container } = render(
    <>
      {[...presets, ...grokPresets, ...kitePresets]
        .flatMap((p) => [p, p])
        .map((p, i) => (
          <AgentIcon key={i} icon={{ ...p.icon, motion: 'none' }} />
        ))}
    </>,
  );
  const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(container.querySelectorAll('.kite-wing').length).toBe(32);
});
it('rejects malformed or unsupported saved icons', () => {
  for (const raw of [
    'null',
    '{}',
    '<svg/>',
    JSON.stringify({ ...presets[0].icon, color: 'url(https://example.com)' }),
    JSON.stringify({ ...presets[0].icon, motion: 'script' }),
  ])
    expect(readIcon(raw)).toBeNull();
  expect(readIcon(JSON.stringify(presets[0].icon))).toEqual(presets[0].icon);
});
it('creates an agent with a selected icon', async () => {
  const onSaved = vi.fn();
  render(<AgentForm environments={[]} onSaved={onSaved} />);
  fireEvent.change(screen.getByPlaceholderText('e.g. Maya'), { target: { value: 'Maya' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cute friends' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mochi' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create bot' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(readIcon(vi.mocked(createAgent).mock.calls[0][0].Metadata?.[iconKey])).toEqual(
    presets[1].icon,
  );
});
it('edits custom icons without losing agent settings, and can restore initials', async () => {
  const agent = {
    ID: 'a',
    Key: 'a',
    Revision: 3,
    Spec: {
      Kind: 'codex',
      Metadata: { 'kites.name': 'Maya', extra: 'keep', [iconKey]: JSON.stringify(presets[1].icon) },
    },
  };
  render(<AgentForm agent={agent} environments={[]} onSaved={async () => {}} />);
  expect(screen.getByRole('button', { name: 'Mochi' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Build your own' }));
  fireEvent.click(screen.getByRole('button', { name: 'bloom' }));
  fireEvent.change(screen.getByLabelText('Motion'), { target: { value: 'none' } });
  fireEvent.change(screen.getByLabelText('Character color'), { target: { value: '#123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(updateAgent).toHaveBeenCalledTimes(1));
  const saved = vi.mocked(updateAgent).mock.calls[0][1];
  expect(saved.Metadata?.extra).toBe('keep');
  expect(readIcon(saved.Metadata?.[iconKey])).toMatchObject({
    character: 'bloom',
    motion: 'none',
    color: '#123456',
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use initials' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(updateAgent).toHaveBeenCalledTimes(2));
  expect(vi.mocked(updateAgent).mock.calls[1][1].Metadata?.[iconKey]).toBe('');
});
it('uses the latest profile icon in existing conversations, including reset to initials', () => {
  const clone = {
    Kind: 'codex',
    Metadata: { 'kites.profile': 'a', [iconKey]: JSON.stringify(presets[0].icon) },
  };
  const { container, rerender } = render(
    <AgentIconProfiles.Provider
      value={{ a: { Kind: 'codex', Metadata: { [iconKey]: JSON.stringify(presets[1].icon) } } }}
    >
      <Avatar name="Maya" spec={clone} />
    </AgentIconProfiles.Provider>,
  );
  expect(container.querySelector('svg')?.classList.contains('motion-blink')).toBe(true);
  rerender(
    <AgentIconProfiles.Provider value={{ a: { Kind: 'codex' } }}>
      <Avatar name="Maya" spec={clone} />
    </AgentIconProfiles.Provider>,
  );
  expect(container.querySelector('svg')).toBeNull();
  expect(container.textContent).toBe('M');
});

it('previews cute character activity without changing the saved design', () => {
  const onChange = vi.fn();
  const { container } = render(<IconPicker value={presets[8].icon} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Thinking' }));
  expect(
    container.querySelector('.icon-picker-heading svg')?.getAttribute('data-avatar-state'),
  ).toBe('thinking');
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(
    container.querySelector('.icon-picker-heading svg')?.getAttribute('data-avatar-state'),
  ).toBe('finished');
  expect(onChange).not.toHaveBeenCalled();
});
