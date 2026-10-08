import type { RuntimeEvent, ReadingSummary } from '../src/types';
export function readingItems(events: RuntimeEvent[]): RuntimeEvent[];
export function previewText(event?: RuntimeEvent): string;
export function readingSummary(events: RuntimeEvent[], readSeq?: number): ReadingSummary;
