export const pickerShapes: readonly string[];
export const allShapes: readonly string[];
export const colors: readonly { id: string; label: string; value: string }[];
export function bodyName(shape: string): string;
export function colorInk(color: string, theme: 'light' | 'dark'): string;
export type Frame = object;
export type Motion = {
  frame(): Frame;
  advance(seconds: number): void;
  setGaze(point: [number, number] | null): void;
  holdFace(expression: string | null): void;
};
export function motion(options: { body: string; isGazeAlways?: boolean }): Motion;
export function behavior(
  controller: Motion,
  state: string,
  options: { seed: number; firstPhase: number },
): { advance(seconds: number): void };
export function appearance(color: string, eyes?: string): object;
export function fit(body: string): object;
export function scale(fit: object): number;
export function render(
  frame: Frame,
  appearance: object,
  size: number,
  id: string,
  options: { displaySize: number },
): string;
