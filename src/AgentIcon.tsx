import { t } from './i18n';
import { createContext, useContext, useState } from 'react';
import type { AgentSpec } from './types';
import { GrokAvatar, KiteAvatar, avatarState } from './avatars/AnimatedAvatar';
import { allShapes, pickerShapes, colors, colorInk } from './avatars/grok-renderer';
import { kites } from './avatars/kites';
import { SoftAvatar } from './avatars/SoftAvatar';

export const iconKey = 'kites.avatar';
export type IconConfig = {
  version: 1;
  character:
    | 'bot'
    | 'cat'
    | 'spark'
    | 'bloom'
    | 'square'
    | 'blob'
    | 'bunny'
    | 'ghost'
    | 'cloud'
    | 'bear'
    | `grok:${string}`
    | `kite:${string}`;
  color: string;
  background: string;
  expression: 'happy' | 'curious' | 'calm';
  motion: 'float' | 'wiggle' | 'blink' | 'none';
};
export const presets: { name: string; icon: IconConfig }[] = [
  {
    name: 'Orbit',
    icon: {
      version: 1,
      character: 'bot',
      color: '#536f61',
      background: '#e8efe7',
      expression: 'happy',
      motion: 'float',
    },
  },
  {
    name: 'Mochi',
    icon: {
      version: 1,
      character: 'cat',
      color: '#b47751',
      background: '#f8ecdf',
      expression: 'curious',
      motion: 'blink',
    },
  },
  {
    name: 'Sunny',
    icon: {
      version: 1,
      character: 'spark',
      color: '#a87b28',
      background: '#faf1d6',
      expression: 'happy',
      motion: 'wiggle',
    },
  },
  {
    name: 'Petal',
    icon: {
      version: 1,
      character: 'bloom',
      color: '#a46b86',
      background: '#f6e8ef',
      expression: 'calm',
      motion: 'float',
    },
  },
  {
    name: 'Pixel',
    icon: {
      version: 1,
      character: 'bot',
      color: '#6874ac',
      background: '#eceefa',
      expression: 'curious',
      motion: 'blink',
    },
  },
  {
    name: 'Clover',
    icon: {
      version: 1,
      character: 'bloom',
      color: '#608779',
      background: '#e6f1ec',
      expression: 'happy',
      motion: 'wiggle',
    },
  },
  {
    name: 'Pebble',
    icon: {
      version: 1,
      character: 'square',
      color: '#666b75',
      background: '#eceef1',
      expression: 'happy',
      motion: 'blink',
    },
  },
  {
    name: 'Jelly',
    icon: {
      version: 1,
      character: 'blob',
      color: '#f38b4e',
      background: '#fff0e5',
      expression: 'happy',
      motion: 'wiggle',
    },
  },
  {
    name: 'Pip',
    icon: {
      version: 1,
      character: 'bunny',
      color: '#be8caa',
      background: '#f7eaf2',
      expression: 'happy',
      motion: 'float',
    },
  },
  {
    name: 'Boo',
    icon: {
      version: 1,
      character: 'ghost',
      color: '#9095ce',
      background: '#eeeefa',
      expression: 'happy',
      motion: 'float',
    },
  },
  {
    name: 'Nimbus',
    icon: {
      version: 1,
      character: 'cloud',
      color: '#7aa5ba',
      background: '#e8f3f8',
      expression: 'happy',
      motion: 'float',
    },
  },
  {
    name: 'Teddy',
    icon: {
      version: 1,
      character: 'bear',
      color: '#b19070',
      background: '#f4eee5',
      expression: 'happy',
      motion: 'blink',
    },
  },
  {
    name: 'Berry',
    icon: {
      version: 1,
      character: 'blob',
      color: '#bf7595',
      background: '#faeaf0',
      expression: 'happy',
      motion: 'float',
    },
  },
  {
    name: 'Matcha',
    icon: {
      version: 1,
      character: 'square',
      color: '#849b69',
      background: '#edf3e5',
      expression: 'happy',
      motion: 'wiggle',
    },
  },
];
const grokHues = [
  'red',
  'magenta',
  'yellow',
  'violet',
  'green',
  'orange',
  'blue',
  'cyan',
  'brown',
  'red',
  'violet',
  'yellow',
  'magenta',
];
export const grokPresets: { name: string; icon: IconConfig }[] = pickerShapes.map((shape, i) => ({
  name: shape[0].toUpperCase() + shape.slice(1),
  icon: {
    version: 1,
    character: `grok:${shape}`,
    color: colorInk(grokHues[i % grokHues.length], 'light'),
    background: '#f5f6f3',
    expression: 'calm',
    motion: 'float',
  },
}));
export const kitePresets: { name: string; icon: IconConfig }[] = kites.map((shape) => ({
  name: shape.name,
  icon: {
    version: 1,
    character: `kite:${shape.id}`,
    color: shape.color,
    background: '#f5f6f3',
    expression: 'calm',
    motion: 'float',
  },
}));
const legacyCharacters = [
  'bot',
  'cat',
  'spark',
  'bloom',
  'square',
  'blob',
  'bunny',
  'ghost',
  'cloud',
  'bear',
] as const;
const characters: readonly string[] = [
  ...legacyCharacters,
  ...allShapes.map((shape) => `grok:${shape}`),
  ...kites.map((shape) => `kite:${shape.id}`),
];
function familyOf(icon: IconConfig | null) {
  return !icon || icon.character.startsWith('kite:')
    ? 'kite'
    : icon.character.startsWith('grok:')
      ? 'grok'
      : 'cute';
}
export function readIcon(raw?: string): IconConfig | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    if (
      c.version !== 1 ||
      !characters.includes(c.character) ||
      !['happy', 'curious', 'calm'].includes(c.expression) ||
      !['float', 'wiggle', 'blink', 'none'].includes(c.motion) ||
      !/^#[\da-f]{6}$/i.test(c.color) ||
      !/^#[\da-f]{6}$/i.test(c.background)
    )
      return null;
    return {
      version: 1,
      character: c.character,
      expression: c.expression,
      motion: c.motion,
      color: c.color,
      background: c.background,
    };
  } catch {
    return null;
  }
}
// Resolve session clones to the current profile so an icon edit updates existing chats too.
export const AgentIconProfiles = createContext<Record<string, AgentSpec>>({});
export function useAgentIcon(spec?: AgentSpec) {
  const profiles = useContext(AgentIconProfiles);
  const id = spec?.Metadata?.['kites.profile'];
  return readIcon((id && profiles[id] ? profiles[id] : spec)?.Metadata?.[iconKey]);
}
export function AgentIcon({ icon, state }: { icon: IconConfig; state?: string }) {
  if (icon.character.startsWith('grok:'))
    return <GrokAvatar icon={icon} state={avatarState(state)} />;
  if (icon.character.startsWith('kite:'))
    return <KiteAvatar icon={icon} state={avatarState(state)} />;
  return <SoftAvatar icon={icon} state={avatarState(state)} />;
}
export function IconPicker({
  value,
  onChange,
}: {
  value: IconConfig | null;
  onChange: (icon: IconConfig | null) => void;
}) {
  const [tab, setTab] = useState<'choose' | 'build'>('choose');
  const [family, setFamily] = useState<'kite' | 'grok' | 'cute'>(() => familyOf(value));
  const [previewState, setPreviewState] = useState('idle');
  const current = value || kitePresets[0].icon;
  const collection = family === 'kite' ? kitePresets : family === 'grok' ? grokPresets : presets;
  const shapes =
    family === 'kite'
      ? kites.map((shape) => `kite:${shape.id}`)
      : family === 'grok'
        ? allShapes.map((shape) => `grok:${shape}`)
        : legacyCharacters;
  const change = (patch: Partial<IconConfig>) => onChange({ ...current, ...patch });
  return (
    <section className="icon-picker" aria-label={t('Bot icon')}>
      <div className="icon-picker-heading">
        <AgentIcon icon={current} state={previewState} />
        <div>
          <strong>{t('Make it yours')}</strong>
          <p>{t('Pick a little personality, or build your own.')}</p>
        </div>
      </div>
      <div className="icon-family-tabs" role="group" aria-label={t('Avatar collection')}>
        {(
          [
            ['kite', 'Little kites'],
            ['grok', 'Grok Bot'],
            ['cute', 'Cute friends'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={family === id} onClick={() => setFamily(id)}>
            {t(label)}
          </button>
        ))}
      </div>
      <div className="icon-tabs" role="group" aria-label={t('Icon editor mode')}>
        <button type="button" aria-pressed={tab === 'choose'} onClick={() => setTab('choose')}>
          {t('Choose an icon')}
        </button>
        <button
          type="button"
          aria-pressed={tab === 'build'}
          onClick={() => {
            setTab('build');
            if (!value) onChange(current);
          }}
        >
          {t('Build your own')}
        </button>
      </div>
      {tab === 'choose' ? (
        <div className="icon-presets">
          {collection.map((p) => (
            <button
              type="button"
              key={t(p.name)}
              aria-pressed={Object.entries(p.icon).every(
                ([key, item]) => value?.[key as keyof IconConfig] === item,
              )}
              onClick={() => onChange({ ...p.icon })}
            >
              <AgentIcon icon={p.icon} />
              <span>{t(p.name)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="icon-controls">
          <fieldset>
            <legend>{t('Character')}</legend>
            <div className="icon-shapes">
              {shapes.map((shape) => {
                const character = shape as IconConfig['character'];
                return (
                  <button
                    type="button"
                    key={character}
                    aria-label={t(
                      character.startsWith('kite:')
                        ? kitePresets.find((p) => p.icon.character === character)!.name
                        : character.startsWith('grok:')
                          ? character[5].toUpperCase() + character.slice(6)
                          : character,
                    )}
                    aria-pressed={current.character === character}
                    onClick={() => change({ character })}
                  >
                    <AgentIcon icon={{ ...current, character }} />
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="icon-color-row">
            <label>
              {t('Character color')}
              <input
                type="color"
                value={current.color}
                onChange={(e) => change({ color: e.target.value })}
              />
            </label>
            <label>
              {t('Background')}
              <input
                type="color"
                value={current.background}
                onChange={(e) => change({ background: e.target.value })}
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="icon-select">
              {t('Expression')}
              <select
                value={current.expression}
                onChange={(e) => change({ expression: e.target.value as IconConfig['expression'] })}
              >
                <option value="happy">{t('Happy')}</option>
                <option value="curious">{t('Curious')}</option>
                <option value="calm">{t('Calm')}</option>
              </select>
            </label>
            <label className="icon-select">
              {t('Motion')}
              <select
                value={current.motion}
                onChange={(e) => change({ motion: e.target.value as IconConfig['motion'] })}
              >
                <option value="float">{t('Float')}</option>
                <option value="wiggle">{t('Wiggle')}</option>
                <option value="blink">{t('Blink')}</option>
                <option value="none">{t('Still')}</option>
              </select>
            </label>
          </div>
        </div>
      )}
      <div className="icon-swatches" role="group" aria-label={t('Avatar colors')}>
        {colors.map((color) => (
          <button
            type="button"
            key={color.id}
            title={t(color.label)}
            aria-label={t(color.label)}
            aria-pressed={current.color.toLowerCase() === colorInk(color.id, 'light').toLowerCase()}
            style={{ backgroundColor: colorInk(color.id, 'light') }}
            onClick={() => change({ color: colorInk(color.id, 'light') })}
          />
        ))}
      </div>
      <div className="icon-preview-states" role="group" aria-label={t('Preview animation')}>
        {(
          [
            ['idle', 'Idle'],
            ['working', 'Working'],
            ['thinking', 'Thinking'],
            ['finished', 'Done'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={previewState === id}
            onClick={() => setPreviewState(id)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div className="icon-picker-footer">
        <span>{t('Your own colors, character, and motion.')}</span>
        <button type="button" onClick={() => onChange(null)} disabled={!value}>
          {t('Use initials')}
        </button>
      </div>
    </section>
  );
}
