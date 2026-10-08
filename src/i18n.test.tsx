import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import {
  locale,
  refreshSystemLanguage,
  resolveLanguage,
  setLanguagePreference,
  t,
  translate,
  useLanguage,
} from './i18n';
import { Question } from './ConversationQuestion';
import { Status } from './ui';
import chinese from './locales/zh-CN.json';

vi.mock('@capacitor/device', () => ({ Device: { getLanguageTag: vi.fn() } }));

beforeEach(async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  await setLanguagePreference('en');
});
afterEach(async () => {
  cleanup();
  delete window.kitesDesktop;
  vi.restoreAllMocks();
  await setLanguagePreference('en');
});
describe('language preference', () => {
  it('uses the primary system language, with Chinese variants and an English fallback', () => {
    expect(resolveLanguage('system', ['zh-Hans-CN'])).toBe('zh-CN');
    expect(resolveLanguage('system', ['zh-TW'])).toBe('zh-CN');
    expect(resolveLanguage('system', ['fr-FR', 'zh-CN'])).toBe('en');
    expect(resolveLanguage('system', [])).toBe('en');
    expect(resolveLanguage('en', ['zh-CN'])).toBe('en');
    expect(resolveLanguage('zh-CN', ['en-US'])).toBe('zh-CN');
  });
  it('persists an explicit preference and changes document language', async () => {
    await setLanguagePreference('zh-CN');
    expect(localStorage.getItem('kites.language')).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(t('Settings')).toBe('设置');
    await refreshSystemLanguage();
    expect(locale()).toBe('zh-CN');
  });
  it('follows native mobile language on resume and honors an explicit override', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const native = vi.mocked(Device.getLanguageTag).mockResolvedValue({ value: 'zh-Hans' });
    await setLanguagePreference('system');
    expect(locale()).toBe('zh-CN');
    native.mockResolvedValue({ value: 'en-GB' });
    await act(async () => window.dispatchEvent(new Event('kites:resume')));
    expect(locale()).toBe('en');
    await setLanguagePreference('zh-CN');
    await refreshSystemLanguage();
    expect(locale()).toBe('zh-CN');
  });
  it('uses the desktop persisted preference and native system language', async () => {
    const getLanguage = vi
      .fn()
      .mockResolvedValue({ preference: 'system', systemLanguages: ['zh-CN'] });
    const setLanguage = vi
      .fn()
      .mockImplementation(async (preference) => ({ preference, systemLanguages: ['zh-CN'] }));
    window.kitesDesktop = { getLanguage, setLanguage };
    await refreshSystemLanguage();
    expect(locale()).toBe('zh-CN');
    await setLanguagePreference('en');
    expect(setLanguage).toHaveBeenCalledWith('en');
    expect(locale()).toBe('en');
  });
  it('does not allow a slow native read to overwrite a newer explicit choice', async () => {
    let complete!: (value: { value: string }) => void;
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.mocked(Device.getLanguageTag).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = refreshSystemLanguage();
    await setLanguagePreference('zh-CN');
    complete({ value: 'en-US' });
    await pending;
    expect(locale()).toBe('zh-CN');
  });
  it('retains the current language when saving fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    await expect(setLanguagePreference('zh-CN')).rejects.toThrow('Storage unavailable');
    expect(locale()).toBe('en');
  });
  it('updates from another web tab', async () => {
    localStorage.setItem('kites.language', 'zh-CN');
    window.dispatchEvent(new StorageEvent('storage', { key: 'kites.language' }));
    expect(locale()).toBe('zh-CN');
  });
});
it('preserves placeholders and leaves arbitrary message text intact', () => {
  expect(translate('Message {name}…', 'zh-CN', { name: 'Maya' })).toBe('给Maya发消息…');
  expect(translate('Maya wrote a document.', 'zh-CN')).toBe('Maya wrote a document.');
  for (const [key, value] of Object.entries(chinese)) {
    const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(slots(value), key).toEqual(slots(key));
  }
});
it('updates rendered controls without remounting or erasing drafts', async () => {
  function Draft() {
    const [draft, setDraft] = useState('');
    return (
      <>
        <label>
          {t('Message')}
          <input
            aria-label={t('Message')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <Status value="running" />
      </>
    );
  }
  function Root() {
    useLanguage();
    return <Draft />;
  }
  render(<Root />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
    target: { value: '你好 Maya · unsent draft' },
  });
  await act(() => setLanguagePreference('zh-CN'));
  expect((screen.getByRole('textbox', { name: '消息' }) as HTMLInputElement).value).toBe(
    '你好 Maya · unsent draft',
  );
  expect(screen.getByText('进行中')).toBeTruthy();
  await act(() => setLanguagePreference('en'));
  expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLInputElement).value).toBe(
    '你好 Maya · unsent draft',
  );
});
it('localizes question controls without changing provider questions or answer IDs', async () => {
  await setLanguagePreference('zh-CN');
  const reply = vi.fn().mockResolvedValue(undefined);
  render(
    <Question
      reply={reply}
      entry={{
        id: 'ask-1',
        kind: 'ask',
        text: 'Which topic?',
        pending: true,
        agentId: 'maya',
        payload: {
          type: 'ask',
          requestId: 'r1',
          questions: [
            {
              id: 'topic',
              prompt: 'Choose a topic',
              required: true,
              options: [{ id: 'one', label: 'Original option' }],
            },
          ],
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Original option' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '提交回答' })));
  expect(reply).toHaveBeenCalledWith(
    expect.objectContaining({ answers: { topic: { value: 'one' } } }),
  );
  expect(screen.getByText('Which topic?')).toBeTruthy();
});
