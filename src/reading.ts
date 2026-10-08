import { locale, t } from './i18n';
export function dayLabel(value?: string, now = new Date()) {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  const date = new Date(value);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= start) return t('Today');
  const yesterday = new Date(start);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date >= yesterday) return t('Yesterday');
  return date.toLocaleDateString(locale(), {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
export function messageTime(value?: string) {
  return value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    : '';
}
export function activityTime(value?: string) {
  return dayLabel(value) === t('Today') ? messageTime(value) : dayLabel(value);
}
