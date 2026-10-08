import { useId, type CSSProperties } from 'react';
import type { IconConfig } from '../AgentIcon';
import './soft-avatars.css';

// Tint the user's chosen color, so old profiles and custom palettes keep their identity.
export function tint(hex: string, amount: number) {
  const target = amount < 0 ? 0 : 255;
  return (
    '#' +
    [1, 3, 5]
      .map((offset) => {
        const channel = parseInt(hex.slice(offset, offset + 2), 16);
        return Math.round(channel + (target - channel) * Math.abs(amount))
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

export function SoftPaint({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <radialGradient id={id} cx="30%" cy="18%" r="85%">
        <stop stopColor={tint(color, 0.48)} />
        <stop offset=".46" stopColor={color} />
        <stop offset="1" stopColor={tint(color, -0.24)} />
      </radialGradient>
      <radialGradient id={`${id}-shine`} cx="35%" cy="15%" r="80%">
        <stop stopColor="white" stopOpacity=".65" />
        <stop offset=".5" stopColor="white" stopOpacity="0" />
        <stop offset="1" stopColor={tint(color, -0.4)} stopOpacity=".14" />
      </radialGradient>
    </defs>
  );
}

export function SoftFace({
  expression,
  state,
  small = false,
}: {
  expression: IconConfig['expression'];
  state: string;
  small?: boolean;
}) {
  const happy = state === 'finished';
  const worried = state === 'failed' || state === 'blocked';
  return (
    <g className="soft-face" transform={small ? 'translate(8 -5) scale(.84)' : undefined}>
      <ellipse cx="31" cy="60" rx="6" ry="3.5" fill="#f79597" opacity=".42" />
      <ellipse cx="69" cy="60" rx="6" ry="3.5" fill="#f79597" opacity=".42" />
      <g className="soft-eyes">
        {[39, 61].map((x, i) => (
          <g key={x}>
            <ellipse
              cx={x}
              cy="49"
              rx="8.7"
              ry={expression === 'curious' && i === 1 ? '11' : '10'}
              fill="#fffdf4"
            />
            {happy ? (
              <path
                d={`M${x - 4} 51q4-7 8 0`}
                fill="none"
                stroke="#282a32"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            ) : (
              <g className="soft-pupils">
                <ellipse
                  cx={x + 1}
                  cy="50"
                  rx="4.5"
                  ry={expression === 'calm' ? '5.6' : '6.4'}
                  fill="#282a32"
                />
                <ellipse cx={x - 0.5} cy="47.5" rx="1.7" ry="2.1" fill="white" />
                <circle cx={x + 3} cy="53" r=".8" fill="white" opacity=".65" />
              </g>
            )}
          </g>
        ))}
      </g>
      {worried ? (
        <path
          d="M45 65q5-5 10 0"
          fill="none"
          stroke="#493437"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      ) : expression === 'happy' || happy ? (
        <g>
          <path d="M43 62Q50 66 57 62Q56 72 50 72Q44 72 43 62Z" fill="#493437" />
          <path d="M46 69Q50 66 54 69Q50 73 46 69" fill="#f69b9c" />
        </g>
      ) : (
        <path
          d="M46 63q4 5 8 0"
          fill="none"
          stroke="#493437"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

const bodies: Record<string, string> = {
  bot: 'M24 30Q24 23 33 23H67Q76 23 76 34V66Q76 79 63 80H37Q24 80 24 66Z',
  cat: 'M23 37Q20 22 21 17Q22 12 28 16L40 27Q50 23 61 27L73 16Q80 12 79 20L77 40Q87 78 54 82Q18 86 19 58Q19 45 23 37Z',
  spark:
    'M43 20Q49 7 56 20L62 32L77 33Q90 35 81 47L73 57L77 72Q80 86 66 81L51 75L36 82Q23 87 25 72L27 58L17 47Q8 36 23 33L37 31Z',
  bloom:
    'M36 22Q50 10 63 23Q82 19 83 38Q99 49 84 63Q83 84 64 83Q50 96 36 82Q16 87 16 65Q1 51 16 39Q16 19 36 22Z',
  square: 'M25 24Q49 17 73 24Q83 27 82 41L81 66Q80 82 64 82H36Q20 82 19 66L18 42Q17 28 25 24Z',
  blob: 'M22 39Q24 21 39 24Q53 11 65 26Q83 24 82 43Q96 59 80 70Q79 86 63 82Q48 93 36 81Q16 85 17 68Q3 51 22 39Z',
  bunny: 'M24 40Q36 31 50 32Q66 30 76 42Q85 52 80 68Q76 83 51 84Q24 84 20 68Q16 51 24 40Z',
  ghost:
    'M20 73V45Q20 20 48 19Q79 18 81 47L84 76Q83 85 73 79L66 75Q59 85 51 77Q42 87 34 78Q21 87 20 73Z',
  cloud:
    'M22 77Q8 74 10 61Q9 46 23 43Q22 25 39 26Q51 13 64 27Q81 24 82 43Q96 47 90 65Q86 79 71 79Z',
  bear: 'M24 39Q33 28 50 29Q69 28 78 43Q88 68 72 79Q50 91 28 79Q12 68 24 39Z',
};

export function SoftAvatar({ icon, state = 'idle' }: { icon: IconConfig; state?: string }) {
  const id = 'soft-' + useId().replaceAll(':', '');
  const color = icon.color;
  const paint = `url(#${id})`;
  const animal = ['cat', 'bunny', 'bear'].includes(icon.character);
  return (
    <svg
      className={`agent-icon soft-avatar motion-${icon.motion} character-${icon.character}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={
        {
          '--avatar-delay': `-${([...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 57) / 10}s`,
        } as CSSProperties
      }
      data-avatar-family="cute"
      data-avatar-state={state}
    >
      <SoftPaint id={id} color={color} />
      <rect width="100" height="100" rx="30" fill={icon.background} />
      <ellipse
        className="soft-shadow"
        cx="50"
        cy="89"
        rx="25"
        ry="4"
        fill={tint(color, -0.4)}
        opacity=".13"
      />
      <g className="soft-body">
        {icon.character === 'bot' && (
          <g className="soft-antenna">
            <path d="M50 27V16" stroke={tint(color, -0.15)} strokeWidth="4" />
            <circle cx="50" cy="13" r="6" fill={paint} />
            <circle cx="48" cy="11" r="2" fill="#fff" opacity=".7" />
          </g>
        )}
        {icon.character === 'bunny' && (
          <g fill={paint}>
            <g className="soft-ear left">
              <path d="M28 44Q12 6 28 6Q40 7 42 39Z" />
              <path d="M29 31Q22 11 28 12Q34 12 35 32Z" fill="#ffe5e8" opacity=".8" />
            </g>
            <g className="soft-ear right">
              <path d="M58 39Q63 4 75 8Q89 14 72 45Z" />
              <path d="M66 32Q69 13 74 14Q79 16 72 34Z" fill="#ffe5e8" opacity=".8" />
            </g>
          </g>
        )}
        {icon.character === 'bear' && (
          <g fill={paint}>
            <g className="soft-ear left">
              <circle cx="26" cy="30" r="14" />
              <circle cx="26" cy="30" r="7" fill="#ffe3cc" opacity=".7" />
            </g>
            <g className="soft-ear right">
              <circle cx="74" cy="30" r="14" />
              <circle cx="74" cy="30" r="7" fill="#ffe3cc" opacity=".7" />
            </g>
          </g>
        )}
        {!['cloud', 'ghost', 'spark', 'bloom'].includes(icon.character) && (
          <g fill={paint}>
            <ellipse className="soft-foot left" cx="36" cy="82" rx="11" ry="6" />
            <ellipse className="soft-foot right" cx="65" cy="82" rx="11" ry="6" />
          </g>
        )}
        <g fill={paint}>
          <ellipse
            className="soft-hand left"
            cx="21"
            cy="62"
            rx="7"
            ry="11"
            transform="rotate(22 21 62)"
          />
          <ellipse
            className="soft-hand right"
            cx="79"
            cy="59"
            rx="7"
            ry="11"
            transform="rotate(-26 79 59)"
          />
        </g>
        <path d={bodies[icon.character] || bodies.blob} fill={paint} />
        <path
          d={bodies[icon.character] || bodies.blob}
          fill={`url(#${id}-shine)`}
          stroke={tint(color, 0.55)}
          strokeWidth=".6"
        />
        {icon.character === 'cat' && (
          <g fill="#ffdfd3" opacity=".8">
            <path d="M25 20L36 29L26 33Z" />
            <path d="M75 20L64 29L75 33Z" />
          </g>
        )}
        {icon.character === 'bloom' && <ellipse cx="50" cy="54" rx="26" ry="27" fill="#fff2bf" />}
        {animal && <ellipse cx="50" cy="62" rx="17" ry="16" fill="#fff4e5" opacity=".62" />}
        {icon.character === 'bot' && (
          <rect x="29" y="33" width="42" height="41" rx="18" fill="#ecf7ee" opacity=".58" />
        )}
        <SoftFace expression={icon.expression} state={state} />
        {icon.character === 'cat' && (
          <path
            d="M24 58l6 1m-6 5 6-1m40-4 6-1m-6 5 6 1"
            stroke={tint(color, -0.35)}
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity=".6"
          />
        )}
        {icon.character === 'square' && (
          <g stroke="#393340" fill="none" strokeWidth="1.8">
            <circle cx="39" cy="49" r="12" />
            <circle cx="61" cy="49" r="12" />
            <path d="M49 47q2-2 4 0" />
          </g>
        )}
        {icon.character === 'cloud' && (
          <path
            d="M25 33Q29 27 35 29"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".6"
          />
        )}
      </g>
    </svg>
  );
}
