import { t, locale } from './i18n';
import { AgentIcon, useAgentIcon, type IconConfig } from './AgentIcon';
import type { AgentSpec } from './types';
import { isNative } from './api';
import { shareFile } from './native';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, LoaderCircle, Search, X } from 'lucide-react';
export function Avatar({
  name,
  color,
  size = '',
  spec,
  icon,
  state,
}: {
  name: string;
  color?: string;
  size?: string;
  spec?: AgentSpec;
  icon?: IconConfig | null;
  state?: string;
}) {
  const saved = useAgentIcon(spec);
  const chosen = icon === undefined ? saved : icon;
  const index = [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 5;
  return (
    <span className={`avatar tone-${color || index} ${size}`}>
      {chosen ? (
        <AgentIcon icon={chosen} state={state} />
      ) : (
        name.trim().slice(0, 1).toUpperCase() || 'K'
      )}
    </span>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <Search size={16} />
      <input
        aria-label={t(placeholder)}
        placeholder={t(placeholder)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label={t('Clear search')} onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </label>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet ${wide ? 'wide' : ''}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label={t('Close panel')} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </dialog>
  );
}
export function Form({
  children,
  submit,
  label = 'Save',
  secondary,
}: {
  children: ReactNode;
  submit: () => Promise<void>;
  label?: string;
  secondary?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await submit();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      {children}
      {error && (
        <p className="inline-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="form-actions">
        {secondary}
        <button className="primary" disabled={busy} type="submit">
          {busy ? <LoaderCircle size={16} className="spin" /> : null}
          {busy ? t('Saving…') : t(label)}
        </button>
      </div>
    </form>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`status ${['running', 'active', 'starting'].includes(value) ? 'live' : value === 'needs attention' || value === 'waiting_permission' ? 'attention' : ['failed', 'interrupted', 'error'].includes(value) ? 'bad' : ''}`}
    >
      <i />
      {t(value.replaceAll('_', ' '))}
    </span>
  );
}
export function DateLabel({ time }: { time: number | string | undefined }) {
  return (
    <span>
      {time
        ? new Intl.DateTimeFormat(locale(), {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(time))
        : '—'}
    </span>
  );
}
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
export async function download(name: string, content: string) {
  if (isNative) return shareFile(name, content);
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
