import { useEffect, useId, useMemo, useRef, type CSSProperties } from 'react';
import type { IconConfig } from '../AgentIcon';
import { appearance, behavior, bodyName, fit, motion, render, scale } from './grok-renderer';
import { kites } from './kites';
import { SoftFace, SoftPaint } from './SoftAvatar';

export function eyeInk(color: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 95 ? '#f7f8f5' : '#24342b';
}
export function avatarState(state?: string) {
  if (['working', 'running', 'starting', 'active'].includes(state || '')) return 'working';
  if (['ready', 'idle', 'paused', 'closed', undefined].includes(state)) return 'idle';
  if (['needs attention', 'waiting_permission', 'blocked'].includes(state || '')) return 'blocked';
  if (['completed', 'done', 'finished'].includes(state || '')) return 'finished';
  if (['failed', 'error', 'interrupted'].includes(state || '')) return 'failed';
  return state === 'thinking' ? 'thinking' : 'idle';
}

// All visible Grok avatars share a 30 fps clock, with no clock left running after unmount.
const players = new Set<(seconds: number) => void>();
let raf = 0;
let previous = 0;
function tick(now: number) {
  if (!document.hidden && now - previous >= 33) {
    const seconds = previous ? Math.min((now - previous) / 1000, 0.05) : 0.033;
    previous = now;
    players.forEach((advance) => advance(seconds));
  }
  raf = requestAnimationFrame(tick);
}
function subscribe(advance: (seconds: number) => void) {
  players.add(advance);
  if (players.size === 1) {
    previous = 0;
    raf = requestAnimationFrame(tick);
  }
  return () => {
    players.delete(advance);
    if (!players.size) cancelAnimationFrame(raf);
  };
}

export function GrokAvatar({ icon, state = 'idle' }: { icon: IconConfig; state?: string }) {
  const id = 'grok-' + useId().replaceAll(':', '');
  const ref = useRef<SVGGElement>(null);
  const body = bodyName(icon.character.slice(5));
  const extent = 80 * scale(fit(body));
  const offset = (extent - 80) / 2;
  const controller = useMemo(() => motion({ body, isGazeAlways: true }), [body]);
  const ink = useMemo(() => appearance(icon.color, eyeInk(icon.color)), [icon.color]);
  const initial = useMemo(
    () => render(controller.frame(), ink, extent, id, { displaySize: 80 }),
    [controller, ink, extent, id],
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    controller.holdFace(icon.expression === 'happy' ? 'happy' : null);
    const idleState =
      icon.expression === 'curious' ? 'curious' : icon.motion === 'wiggle' ? 'playful' : 'idle';
    const player = behavior(controller, state === 'idle' ? idleState : state, {
      seed: [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0),
      firstPhase: 0.37,
    });
    const draw = () => {
      // Only trusted local geometry, allowlisted shapes, and validated hex colors enter this SVG.
      el.innerHTML = render(controller.frame(), ink, extent, id, { displaySize: 80 });
    };
    draw();
    let visible = true;
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          });
    observer?.observe(el.ownerSVGElement!);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let stop: (() => void) | undefined;
    const update = () => {
      stop?.();
      stop = undefined;
      if (icon.motion !== 'none' && !reduced?.matches)
        stop = subscribe((seconds) => {
          if (!visible) return;
          controller.advance(seconds);
          player.advance(seconds);
          draw();
        });
    };
    update();
    reduced?.addEventListener('change', update);
    return () => {
      stop?.();
      observer?.disconnect();
      reduced?.removeEventListener('change', update);
    };
  }, [controller, icon.expression, icon.motion, state, ink, extent, id]);
  return (
    <svg
      className={`agent-icon grok-avatar motion-${icon.motion}`}
      viewBox={`${offset} ${offset} 80 80`}
      aria-hidden="true"
      focusable="false"
      data-avatar-family="grok"
      data-avatar-state={state}
      onPointerMove={(event) => {
        const r = event.currentTarget.getBoundingClientRect();
        controller.setGaze([
          (event.clientX - r.left - r.width / 2) / r.width,
          -(event.clientY - r.top - r.height / 2) / r.height,
        ]);
      }}
      onPointerLeave={() => controller.setGaze(null)}
    >
      <rect x={offset} y={offset} width="80" height="80" rx="24" fill={icon.background} />
      <g ref={ref} dangerouslySetInnerHTML={{ __html: initial }} />
    </svg>
  );
}

export function KiteAvatar({ icon, state = 'idle' }: { icon: IconConfig; state?: string }) {
  const clip = 'kite-' + useId().replaceAll(':', '');
  const shape = kites.find((k) => 'kite:' + k.id === icon.character) || kites[0];
  const paint = `url(#${clip}-paint)`;
  return (
    <svg
      className={`agent-icon kite-avatar motion-${icon.motion}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={
        {
          '--avatar-delay': `-${([...clip].reduce((n, c) => n + c.charCodeAt(0), 0) % 57) / 10}s`,
        } as CSSProperties
      }
      data-avatar-family="kite"
      data-avatar-state={state}
    >
      <rect width="100" height="100" rx="30" fill={icon.background} />
      <SoftPaint id={`${clip}-paint`} color={icon.color} />
      <ellipse cx="50" cy="92" rx="21" ry="3" fill={paint} opacity=".12" />
      <defs>
        <clipPath id={clip}>
          <path d={shape.path} />
        </clipPath>
      </defs>
      <g className="kite-body">
        <g className="kite-wing left">
          <path d="M38 32C26 25 12 28 5 41Q1 48 9 49L31 51 42 42Z" fill={paint} />
          <path d="M7 44Q22 34 38 37L31 51 9 49Q3 49 7 44Z" fill="#fff" opacity=".2" />
        </g>
        <g className="kite-wing right">
          <path d="M62 32C74 25 88 28 95 41Q99 48 91 49L69 51 58 42Z" fill={paint} />
          <path d="M93 44Q78 34 62 37L69 51 91 49Q97 49 93 44Z" fill="#fff" opacity=".2" />
        </g>
        <g className="kite-tail">
          <path
            d={
              shape.id === 'ribbon'
                ? 'M45 70C33 83 58 81 44 95M54 70C69 83 47 86 61 97'
                : 'M50 73C38 80 63 82 51 89Q45 94 54 97'
            }
            stroke={icon.color}
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
            opacity=".8"
          />
          <path d="M49 84l-5-3v6l5-3 6-3v6ZM53 94l-4-3v6l4-3 5-3v6Z" fill={paint} />
        </g>
        <g transform="translate(50 43) scale(1.13) translate(-50 -43)">
          <path d={shape.path} fill={paint} />
          <path d={shape.split} fill="#fff" opacity=".2" clipPath={`url(#${clip})`} />
          <path
            d="M50 16V69M26 39H74"
            stroke="#fff"
            strokeWidth=".8"
            fill="none"
            opacity=".17"
            clipPath={`url(#${clip})`}
          />
          <SoftFace expression={icon.expression} state={state} small />
        </g>
      </g>
    </svg>
  );
}
