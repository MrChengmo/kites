import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import chinese from './locales/zh-CN.json';

export type LanguagePreference = 'system' | 'en' | 'zh-CN';
type NativeLanguage = { preference: LanguagePreference; systemLanguages: string[] };
declare global {
  interface Window {
    kitesDesktop?: {
      getLanguage: () => Promise<NativeLanguage>;
      setLanguage: (preference: LanguagePreference) => Promise<NativeLanguage>;
    };
  }
}
export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'en' || value === 'zh-CN';
}
export function resolveLanguage(preference: LanguagePreference, languages: readonly string[]) {
  if (preference !== 'system') return preference;
  return /^zh(?:-|$)/i.test(languages[0] || '') ? 'zh-CN' : 'en';
}
function readPreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem('kites.language');
    return isLanguagePreference(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}
let preference = readPreference();
let systemLanguages = [...navigator.languages];
let snapshot = { preference, language: resolveLanguage(preference, systemLanguages) };
const listeners = new Set<() => void>();
let revision = 0;
function publish() {
  const language = resolveLanguage(preference, systemLanguages);
  document.documentElement.lang = language;
  if (snapshot.preference === preference && snapshot.language === language) return;
  snapshot = { preference, language };
  listeners.forEach((listener) => listener());
}
export function locale() {
  return snapshot.language;
}
export function translate(key: string, language: string, values?: Record<string, string | number>) {
  const message = language === 'zh-CN' ? (chinese as Record<string, string>)[key] || key : key;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    values?.[name] === undefined ? match : String(values[name]),
  );
}
export function t(key: string, values?: Record<string, string | number>) {
  return translate(key, locale(), values);
}
export async function refreshSystemLanguage() {
  const request = revision;
  let languages = [...navigator.languages];
  let nativePreference: LanguagePreference | undefined;
  try {
    if (window.kitesDesktop) {
      const native = await window.kitesDesktop.getLanguage();
      languages = native.systemLanguages;
      nativePreference = native.preference;
    } else if (Capacitor.isNativePlatform()) {
      languages = [(await Device.getLanguageTag()).value];
    }
  } catch {
    // Browser language remains a usable fallback when the native bridge is unavailable.
  }
  if (request !== revision) return;
  systemLanguages = languages;
  if (isLanguagePreference(nativePreference)) preference = nativePreference;
  publish();
}
export async function setLanguagePreference(next: LanguagePreference) {
  if (!isLanguagePreference(next)) throw new Error('Unsupported language');
  revision++;
  // Persist first: the interface must not claim a preference was saved if storage fails.
  if (window.kitesDesktop) {
    const native = await window.kitesDesktop.setLanguage(next);
    systemLanguages = native.systemLanguages;
  } else {
    localStorage.setItem('kites.language', next);
  }
  revision++;
  preference = next;
  publish();
  if (next === 'system') await refreshSystemLanguage();
}
export function useLanguage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}
document.documentElement.lang = snapshot.language;
for (const event of ['languagechange', 'focus', 'kites:resume']) {
  window.addEventListener(event, () => void refreshSystemLanguage());
}
window.addEventListener('storage', (event) => {
  if (event.key !== 'kites.language' || window.kitesDesktop) return;
  revision++;
  preference = readPreference();
  publish();
});
void refreshSystemLanguage();
