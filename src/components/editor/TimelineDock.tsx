import React, { useRef } from 'react';
import {
  Layers,
  Minus,
  Plus,
  Scissors,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ClipProject } from '../../types/clipsycut';
import { getTimelineTotalDuration } from '../../utils/editorLogic';

interface TimelineDockProps {
  project: ClipProject;
  currentTimeSec: number;
  selectedSegmentId: string;
  onSelectSegment: (id: string) => void;
  onSeek: (timeSec: number) => void;
  zoomPercent: number;
  onChangeZoom: (zoom: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onChangeVolume: (vol: number) => void;
  onAddOverlay: () => void;
  onSplitAtPlayhead: () => void;
  onDeleteSelectedSegment: () => void;
}

export const TimelineDock: React.FC<TimelineDockProps> = ({
  project,
  currentTimeSec,
  selectedSegmentId,
  onSelectSegment,
  onSeek,
  zoomPercent,
  onChangeZoom,
  isMuted,
  onToggleMute,
  onChangeVolume,
  onAddOverlay,
  onSplitAtPlayhead,
  onDeleteSelectedSegment,
}) => {
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const totalDuration = Math.max(1, getTimelineTotalDuration(project.segments));

  const ticks: number[] = [];
  const step = zoomPercent >= 160 ? 2 : 5;
  for (let t = 0; t <= Math.ceil(totalDuration); t += step) {
    ticks.push(t);
  }

  const handleScrub = (clientX: number) => {
    const el = trackAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(Number((ratio * totalDuration).toFixed(2)));
  };

  const onPointerDownTrack = (e: React.PointerEvent) => {
    handleScrub(e.clientX);
    const move = (mv: PointerEvent) => handleScrub(mv.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const playheadPercent = Math.max(0, Math.min(100, (currentTimeSec / totalDuration) * 100));

  return (
    <section
      aria-label="Timeline editor"
      className="flex h-[196px] shrink-0 flex-col border-t border-[var(--border-hairline)] bg-[var(--bg-surface)]"
    >
      {/* Top Timeline Controls Row */}
      <div className="flex h-11 items-center justify-between gap-4 border-b border-[var(--border-hairline)] px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-wider text-[var(--ink-primary)]">
            <Layers className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
            <span>TIMELINE</span>
          </div>
          <span className="rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-secondary)] tabular-nums">
            {totalDuration.toFixed(1)}s
          </span>
          <span className="rounded border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent-text)] tabular-nums">
            {zoomPercent}% zoom
          </span>
          <span className="hidden md:inline font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
            Detected {project.fps} FPS
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Volume slider */}
          <div className="hidden sm:flex items-center gap-2 pr-2">
            <button
              type="button"
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              onClick={onToggleMute}
              className="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-rose-500" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(project.masterVolume * 100)}
              aria-label="Master volume"
              onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
              style={{ accentColor: 'var(--accent)' }}
              className="w-20 cursor-pointer"
            />
            <span className="w-9 font-mono text-[11px] text-[var(--ink-secondary)] tabular-nums">
              {Math.round(project.masterVolume * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={onAddOverlay}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add overlay</span>
          </button>

          <button
            type="button"
            onClick={onSplitAtPlayhead}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
          >
            <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Split</span>
          </button>

          <button
            type="button"
            onClick={onDeleteSelectedSegment}
            disabled={project.segments.length <= 1}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-rose-500/60 disabled:opacity-45 whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Delete</span>
          </button>

          <div className="hidden lg:flex items-center gap-1.5 pl-1">
            <button
              type="button"
              aria-label="Zoom out timeline"
              onClick={() => onChangeZoom(Math.max(50, zoomPercent - 25))}
              className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--ink-primary)] hover:border-[var(--accent)] cursor-pointer"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <input
              type="range"
              min={50}
              max={200}
              step={25}
              value={zoomPercent}
              aria-label="Timeline zoom"
              onChange={(e) => onChangeZoom(Number(e.target.value))}
              style={{ accentColor: 'var(--accent)' }}
              className="w-16 cursor-pointer"
            />
            <button
              type="button"
              aria-label="Zoom in timeline"
              onClick={() => onChangeZoom(Math.min(200, zoomPercent + 25))}
              className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--ink-primary)] hover:border-[var(--accent)] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Tracks & Ruler */}
      <div className="flex flex-1 min-h-0 overflow-x-auto">
        {/* Track Labels Column */}
        <div className="flex w-[164px] shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
          <div className="h-7 border-b border-[var(--border-hairline)]" />
          <div className="flex h-16 items-center justify-between border-b border-[var(--border-hairline)] px-3.5">
            <span className="text-xs font-bold text-[var(--ink-primary)]">
              Master clip
            </span>
            <button
              type="button"
              aria-label="Toggle master track audio"
              onClick={onToggleMute}
              className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
          {(project.overlays.length > 0 || project.captions.length > 0 || project.audioTracks.length > 0) && (
            <div className="flex flex-1 items-center px-3.5 font-mono text-[11px] text-[var(--ink-muted)]">
              Overlays &amp; Audio
            </div>
          )}
        </div>

        {/* Scrollable Ruler + Segments */}
        <div
          className="relative flex-1 overflow-x-auto"
          style={{ minWidth: `${zoomPercent}%` }}
        >
          <div
            ref={trackAreaRef}
            onPointerDown={onPointerDownTrack}
            className="relative h-full w-full select-none cursor-pointer"
          >
            {/* Ruler */}
            <div className="relative h-7 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]">
              {ticks.map((t) => {
                const leftPct = (t / totalDuration) * 100;
                return (
                  <div
                    key={t}
                    style={{ left: `${leftPct}%` }}
                    className="absolute bottom-0 flex flex-col items-start font-mono text-[10px] text-[var(--ink-muted)]"
                  >
                    <span className="pl-1.5 leading-none">{t}s</span>
                    <div className="mt-0.5 h-1.5 w-px bg-[var(--border-strong)]" />
                  </div>
                );
              })}

              {/* Viral moment markers on ruler */}
              {project.viralMoments.map((vm) => {
                const pct = Math.min(98, (vm.startSec / totalDuration) * 100);
                return (
                  <button
                    key={vm.id}
                    type="button"
                    title={`${vm.title} (${vm.startSec}s)`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(vm.startSec);
                    }}
                    style={{ left: `${pct}%` }}
                    className="absolute bottom-0.5 h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--accent)]"
                  />
                );
              })}
            </div>

            {/* Master Clip Segments Row */}
            <div className="relative flex h-16 items-center border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-0.5 py-1.5">
              {project.segments.map((seg) => {
                const dur = Math.max(0.2, seg.sourceEndSec - seg.sourceStartSec);
                const widthPct = (dur / totalDuration) * 100;
                const isSelected = seg.id === selectedSegmentId;
                return (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSegment(seg.id);
                    }}
                    style={{ width: `${widthPct}%` }}
                    className={`relative flex h-full items-center overflow-hidden rounded-xs px-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-2 border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent)]'
                    }`}
                  >
                    <span className="truncate font-mono text-[11px] font-semibold text-[var(--ink-primary)]">
                      {seg.label} ({dur.toFixed(1)}s)
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Secondary Overlays / Captions / Audio Track Row */}
            {(project.overlays.length > 0 || project.captions.length > 0 || project.audioTracks.length > 0) && (
              <div className="relative flex h-10 items-center bg-[var(--bg-surface)]">
                {project.overlays.map((ov) => {
                  const leftPct = (ov.startSec / totalDuration) * 100;
                  const widthPct = Math.max(6, ((ov.endSec - ov.startSec) / totalDuration) * 100);
                  return (
                    <div
                      key={ov.id}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      className="absolute flex h-6 items-center truncate rounded border border-[var(--accent)]/60 bg-[var(--accent-soft)] px-2 font-mono text-[10px] text-[var(--accent-text)]"
                    >
                      {ov.text}
                    </div>
                  );
                })}
                {project.audioTracks.map((tr) => {
                  const leftPct = (tr.startSec / totalDuration) * 100;
                  const widthPct = Math.max(6, (tr.durationSec / totalDuration) * 100);
                  return (
                    <div
                      key={tr.id}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      className="absolute flex h-6 items-center truncate rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 font-mono text-[10px] text-[var(--ink-secondary)]"
                    >
                      ♪ {tr.name}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Playhead */}
            <div
              data-testid="timeline-playhead"
              style={{ left: `${playheadPercent}%` }}
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-[var(--accent)]"
            >
              <div
                className={`inline-block rounded-xs bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-[var(--accent-fg)] tabular-nums ${
                  playheadPercent < 4 ? 'translate-x-0' : '-translate-x-1/2'
                }`}
              >
                {currentTimeSec.toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
