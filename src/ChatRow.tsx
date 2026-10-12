import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pin,
  PinOff,
  Settings,
  Trash2,
} from 'lucide-react';
import { t } from './i18n';

export function ChatRow({
  children,
  label,
  compact = false,
  archived,
  pinned,
  onArchive,
  onPin,
  onDelete,
  onDetails,
}: {
  children: ReactNode;
  label: string;
  compact?: boolean;
  archived?: boolean;
  pinned?: boolean;
  onArchive: () => Promise<void>;
  onPin: () => Promise<void>;
  onDelete: () => void;
  onDetails: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    horizontal?: boolean;
    cancelled?: boolean;
    delta: number;
  }>();
  const suppressClick = useRef(false);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMenu(false);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const archiveLabel = t(archived ? 'Restore chat' : 'Archive chat');
  const pinLabel = t(pinned ? 'Unpin chat' : 'Pin chat');
  return (
    <div
      ref={root}
      className={`chat-action-row${compact ? ' compact' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setMenu(false);
          root.current?.querySelector<HTMLButtonElement>('.chat-more')?.focus();
        }
      }}
    >
      <div className={`chat-swipe-hint ${offset < 0 ? 'archive' : 'pin'}`} aria-hidden="true">
        {offset < 0 ? (
          <>
            <Archive size={20} />
            {archiveLabel}
          </>
        ) : (
          <>
            <Pin size={20} />
            {pinLabel}
          </>
        )}
      </div>
      <div
        className="chat-row-surface"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(e) => {
          if (
            compact ||
            busy ||
            menu ||
            e.pointerType !== 'touch' ||
            (e.target as HTMLElement).closest('.chat-more')
          )
            return;
          gesture.current = { x: e.clientX, y: e.clientY, delta: 0 };
          suppressClick.current = false;
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.cancelled) return;
          const dx = e.clientX - g.x,
            dy = e.clientY - g.y;
          if (!g.horizontal && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
            g.cancelled = true;
            return;
          }
          if (!g.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            g.horizontal = true;
            suppressClick.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }
          if (g.horizontal) {
            g.delta = dx;
            setOffset(Math.max(-128, Math.min(128, dx)));
          }
        }}
        onPointerUp={() => {
          const g = gesture.current;
          gesture.current = undefined;
          setOffset(0);
          if (g?.horizontal && Math.abs(g.delta) >= 80) void run(g.delta < 0 ? onArchive : onPin);
        }}
        onPointerCancel={() => {
          gesture.current = undefined;
          setOffset(0);
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {children}
        <button
          className="chat-more"
          aria-label={t('Chat actions for {name}', { name: label })}
          aria-expanded={menu}
          aria-haspopup="menu"
          disabled={busy}
          onClick={() => {
            const box = root.current!.getBoundingClientRect();
            setMenuPosition({
              top: Math.max(8, Math.min(box.bottom - 8, window.innerHeight - 240)),
              right: Math.max(8, window.innerWidth - box.right + 8),
            });
            setMenu(!menu);
          }}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      {menu && (
        <div className="chat-actions-menu" role="menu" style={menuPosition}>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(false);
              onDetails();
            }}
          >
            <Settings size={16} />
            {t('Chat details')}
          </button>
          <button role="menuitem" onClick={() => void run(onPin)}>
            {pinned ? <PinOff size={16} /> : <Pin size={16} />}
            {pinLabel}
          </button>
          <button role="menuitem" onClick={() => void run(onArchive)}>
            {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            {archiveLabel}
          </button>
          <button
            role="menuitem"
            className="danger-link"
            onClick={() => {
              setMenu(false);
              onDelete();
            }}
          >
            <Trash2 size={16} />
            {t('Delete chat')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="chat-action-error">
          {error}
        </p>
      )}
    </div>
  );
}
