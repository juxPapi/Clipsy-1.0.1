import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Scissors } from 'lucide-react';
import type { ViralMoment } from '../../types/clipfast';
import {
  clampMomentRange,
  formatPreciseTimecode,
  shiftMomentWindow,
} from '../../utils/editorLogic';

interface MomentRangeSliderProps {
  totalDurationSec: number;
  viralMoments: ViralMoment[];
  selectedMomentId?: string;
  startSec: number;
  endSec: number;
  currentSourceSec: number;
  onSelectMoment: (momentId: string) => void;
  onChangeRange: (startSec: number, endSec: number, previewSec?: number) => void;
  onResetToFullSource: () => void;
  isFullSource: boolean;
}

type DragTarget = 'start' | 'end' | 'window';

export const MomentRangeSlider: React.FC<MomentRangeSliderProps> = ({
  totalDurationSec,
  viralMoments,
  selectedMomentId,
  startSec,
  endSec,
  currentSourceSec,
  onSelectMoment,
  onChangeRange,
  onResetToFullSource,
  isFullSource,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const safeTotal = Math.max(1, totalDurationSec);
  const clamped = clampMomentRange(startSec, endSec, safeTotal, 'start', 1.0);
  const clipStart = clamped.startSec;
  const clipEnd = clamped.endSec;
  const clipDuration = Math.max(0.1, Number((clipEnd - clipStart).toFixed(1)));

  const startPct = Math.max(0, Math.min(100, (clipStart / safeTotal) * 100));
  const endPct = Math.max(startPct, Math.min(100, (clipEnd / safeTotal) * 100));
  const playheadPct = Math.max(0, Math.min(100, (currentSourceSec / safeTotal) * 100));

  const startDrag = (e: React.PointerEvent, target: DragTarget) => {
    e.stopPropagation();
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;

    const bounds = track.getBoundingClientRect();
    const anchorX = e.clientX;
    const initStart = clipStart;
    const initEnd = clipEnd;

    const handleMove = (mv: PointerEvent) => {
      const ratioDelta = (mv.clientX - anchorX) / Math.max(1, bounds.width);
      const secDelta = ratioDelta * safeTotal;

      if (target === 'start') {
        const next = clampMomentRange(initStart + secDelta, initEnd, safeTotal, 'start', 1.0);
        onChangeRange(next.startSec, next.endSec, next.startSec);
      } else if (target === 'end') {
        const next = clampMomentRange(initStart, initEnd + secDelta, safeTotal, 'end', 1.0);
        onChangeRange(next.startSec, next.endSec, next.endSec);
      } else {
        const next = shiftMomentWindow(initStart, initEnd, secDelta, safeTotal);
        onChangeRange(next.startSec, next.endSec, next.startSec);
      }
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleTrackClick = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - bounds.left) / Math.max(1, bounds.width)));
    const clickedSec = Number((ratio * safeTotal).toFixed(1));
    const distToStart = Math.abs(clickedSec - clipStart);
    const distToEnd = Math.abs(clickedSec - clipEnd);

    if (distToStart <= distToEnd) {
      const next = clampMomentRange(clickedSec, clipEnd, safeTotal, 'start', 1.0);
      onChangeRange(next.startSec, next.endSec, next.startSec);
    } else {
      const next = clampMomentRange(clipStart, clickedSec, safeTotal, 'end', 1.0);
      onChangeRange(next.startSec, next.endSec, next.endSec);
    }
  };

  const nudgeEdge = (edge: 'start' | 'end', deltaSec: number) => {
    if (edge === 'start') {
      const next = clampMomentRange(clipStart + deltaSec, clipEnd, safeTotal, 'start', 1.0);
      onChangeRange(next.startSec, next.endSec, next.startSec);
    } else {
      const next = clampMomentRange(clipStart, clipEnd + deltaSec, safeTotal, 'end', 1.0);
      onChangeRange(next.startSec, next.endSec, next.endSec);
    }
  };

  const onKeyDownHandle = (e: React.KeyboardEvent, edge: 'start' | 'end') => {
    const step = e.shiftKey ? 1.0 : 0.1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      nudgeEdge(edge, -step);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      nudgeEdge(edge, step);
    }
  };

  return (
    <section
      aria-label="Viral moment trim slider"
      data-testid="moment-range-slider"
      className="mt-2.5 shrink-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2.5"
    >
      {/* Header Row: Moment selector + Precision In/Out Nudges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-[var(--accent-text)] whitespace-nowrap">
            <Scissors className="h-3 w-3" aria-hidden="true" />
            <span>CLIP WINDOW</span>
          </div>

          {viralMoments.length > 0 ? (
            <select
              aria-label="Select viral moment"
              value={selectedMomentId || viralMoments[0]?.id || ''}
              onChange={(e) => onSelectMoment(e.target.value)}
              className="max-w-[260px] truncate rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-1 text-xs font-semibold text-[var(--ink-primary)] focus:border-[var(--accent)] focus:outline-none cursor-pointer"
            >
              {viralMoments.map((vm) => (
                <option key={vm.id} value={vm.id}>
                  {vm.title} ({formatPreciseTimecode(vm.startSec)} – {formatPreciseTimecode(vm.endSec)})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-medium text-[var(--ink-secondary)]">
              Trim source range
            </span>
          )}
        </div>

        {/* Precision Timestamp Controls */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          {/* Start (IN) control */}
          <div className="inline-flex items-center rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)]">
            <button
              type="button"
              aria-label="Nudge start earlier"
              title="Start -0.5s"
              onClick={() => nudgeEdge('start', -0.5)}
              className="px-1.5 py-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onChangeRange(clipStart, clipEnd, clipStart)}
              title="Preview clip start frame"
              className="px-1.5 py-0.5 text-[var(--ink-primary)] tabular-nums hover:text-[var(--accent-text)] cursor-pointer"
              data-testid="moment-start-readout"
            >
              <span className="mr-1 text-[10px] text-[var(--ink-muted)]">IN</span>
              {formatPreciseTimecode(clipStart)}
            </button>
            <button
              type="button"
              aria-label="Nudge start later"
              title="Start +0.5s"
              onClick={() => nudgeEdge('start', 0.5)}
              className="px-1.5 py-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <span
            data-testid="moment-duration-readout"
            className="rounded border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 font-bold text-[var(--accent-text)] tabular-nums"
          >
            {clipDuration.toFixed(1)}s
          </span>

          {/* End (OUT) control */}
          <div className="inline-flex items-center rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)]">
            <button
              type="button"
              aria-label="Nudge end earlier"
              title="End -0.5s"
              onClick={() => nudgeEdge('end', -0.5)}
              className="px-1.5 py-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onChangeRange(clipStart, clipEnd, clipEnd)}
              title="Preview clip end frame"
              className="px-1.5 py-0.5 text-[var(--ink-primary)] tabular-nums hover:text-[var(--accent-text)] cursor-pointer"
              data-testid="moment-end-readout"
            >
              <span className="mr-1 text-[10px] text-[var(--ink-muted)]">OUT</span>
              {formatPreciseTimecode(clipEnd)}
            </button>
            <button
              type="button"
              aria-label="Nudge end later"
              title="End +0.5s"
              onClick={() => nudgeEdge('end', 0.5)}
              className="px-1.5 py-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {!isFullSource && (
            <button
              type="button"
              onClick={onResetToFullSource}
              className="inline-flex items-center gap-1 rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] font-semibold text-[var(--ink-secondary)] hover:border-[var(--accent)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Full ({safeTotal.toFixed(0)}s)</span>
            </button>
          )}
        </div>
      </div>

      {/* Dual-Handle Range Track */}
      <div className="mt-2 px-1">
        <div
          ref={trackRef}
          onPointerDown={handleTrackClick}
          className="relative flex h-6 w-full select-none items-center cursor-pointer"
        >
          {/* Base full-duration rail */}
          <div className="relative h-2 w-full rounded bg-[var(--bg-elevated)] border border-[var(--border-hairline)] overflow-hidden">
            {/* Background markers for all detected viral moments */}
            {viralMoments.map((vm) => {
              const left = Math.max(0, Math.min(100, (vm.startSec / safeTotal) * 100));
              const width = Math.max(1.5, Math.min(100 - left, ((vm.endSec - vm.startSec) / safeTotal) * 100));
              const isSelected = vm.id === selectedMomentId;
              return (
                <div
                  key={vm.id}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  className={`absolute top-0 bottom-0 ${
                    isSelected ? 'opacity-0' : 'bg-[var(--ink-muted)]/25'
                  }`}
                />
              );
            })}
          </div>

          {/* Selected Clip Window Bar (Draggable to slide whole window) */}
          <div
            data-testid="moment-range-window"
            onPointerDown={(e) => startDrag(e, 'window')}
            style={{
              left: `${startPct}%`,
              width: `${Math.max(1, endPct - startPct)}%`,
            }}
            title="Drag to shift clip window"
            className="absolute h-3.5 rounded-xs border-y-2 border-[var(--accent)] bg-[var(--accent-soft)] cursor-grab active:cursor-grabbing"
          />

          {/* Current Source Playhead */}
          <div
            style={{ left: `${playheadPct}%` }}
            className="pointer-events-none absolute top-0.5 bottom-0.5 w-0.5 bg-[var(--ink-primary)]/80"
          />

          {/* Start Handle (IN) */}
          <div
            role="slider"
            tabIndex={0}
            data-testid="moment-start-handle"
            aria-label="Clip start time"
            aria-valuemin={0}
            aria-valuemax={Number(Math.max(0, clipEnd - 1).toFixed(1))}
            aria-valuenow={clipStart}
            aria-valuetext={formatPreciseTimecode(clipStart)}
            onPointerDown={(e) => startDrag(e, 'start')}
            onKeyDown={(e) => onKeyDownHandle(e, 'start')}
            style={{ left: `${startPct}%` }}
            className="absolute z-10 flex h-5 w-3 -translate-x-1/2 items-center justify-center rounded-xs border border-[var(--accent-fg)] bg-[var(--accent)] shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-primary)] cursor-ew-resize"
          >
            <span className="h-2.5 w-0.5 bg-[var(--accent-fg)]/80" />
          </div>

          {/* End Handle (OUT) */}
          <div
            role="slider"
            tabIndex={0}
            data-testid="moment-end-handle"
            aria-label="Clip end time"
            aria-valuemin={Number(Math.min(safeTotal, clipStart + 1).toFixed(1))}
            aria-valuemax={Number(safeTotal.toFixed(1))}
            aria-valuenow={clipEnd}
            aria-valuetext={formatPreciseTimecode(clipEnd)}
            onPointerDown={(e) => startDrag(e, 'end')}
            onKeyDown={(e) => onKeyDownHandle(e, 'end')}
            style={{ left: `${endPct}%` }}
            className="absolute z-10 flex h-5 w-3 -translate-x-1/2 items-center justify-center rounded-xs border border-[var(--accent-fg)] bg-[var(--accent)] shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-primary)] cursor-ew-resize"
          >
            <span className="h-2.5 w-0.5 bg-[var(--accent-fg)]/80" />
          </div>
        </div>
      </div>
    </section>
  );
};
