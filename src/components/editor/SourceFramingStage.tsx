import React, { useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import type { CropRect, LayoutMode } from '../../types/clipfast';
import { clampCropRect } from '../../utils/editorLogic';

interface SourceFramingStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  layout: LayoutMode;
  gameplayCrop: CropRect;
  facecamCrop: CropRect;
  onChangeGameplayCrop: (rect: CropRect) => void;
  onChangeFacecamCrop: (rect: CropRect) => void;
  onVideoLoadedMetadata: () => void;
  onVideoTimeUpdate: () => void;
  onVideoEnded: () => void;
  masterVolume: number;
  isMuted: boolean;
}

type DragTarget = 'gameplay' | 'facecam';
type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export const SourceFramingStage: React.FC<SourceFramingStageProps> = ({
  videoRef,
  videoUrl,
  sourceWidth,
  sourceHeight,
  isPlaying,
  onTogglePlay,
  layout,
  gameplayCrop,
  facecamCrop,
  onChangeGameplayCrop,
  onChangeFacecamCrop,
  onVideoLoadedMetadata,
  onVideoTimeUpdate,
  onVideoEnded,
  masterVolume,
  isMuted,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = (
    e: React.PointerEvent,
    target: DragTarget,
    handle: DragHandle
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initial = target === 'gameplay' ? { ...gameplayCrop } : { ...facecamCrop };
    const setter = target === 'gameplay' ? onChangeGameplayCrop : onChangeFacecamCrop;

    const onPointerMove = (moveEvt: PointerEvent) => {
      const dx = (moveEvt.clientX - startX) / bounds.width;
      const dy = (moveEvt.clientY - startY) / bounds.height;

      const next = { ...initial };
      if (handle === 'move') {
        next.x = initial.x + dx;
        next.y = initial.y + dy;
      } else if (handle === 'se') {
        next.width = initial.width + dx;
        next.height = initial.height + dy;
      } else if (handle === 'sw') {
        next.x = initial.x + dx;
        next.width = initial.width - dx;
        next.height = initial.height + dy;
      } else if (handle === 'ne') {
        next.y = initial.y + dy;
        next.width = initial.width + dx;
        next.height = initial.height - dy;
      } else if (handle === 'nw') {
        next.x = initial.x + dx;
        next.y = initial.y + dy;
        next.width = initial.width - dx;
        next.height = initial.height - dy;
      }

      setter(clampCropRect(next));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const renderHandles = (target: DragTarget) => {
    const corners: Array<{ handle: DragHandle; pos: string; cursor: string }> = [
      { handle: 'nw', pos: '-top-1.5 -left-1.5', cursor: 'cursor-nwse-resize' },
      { handle: 'ne', pos: '-top-1.5 -right-1.5', cursor: 'cursor-nesw-resize' },
      { handle: 'sw', pos: '-bottom-1.5 -left-1.5', cursor: 'cursor-nesw-resize' },
      { handle: 'se', pos: '-bottom-1.5 -right-1.5', cursor: 'cursor-nwse-resize' },
    ];
    return corners.map((c) => (
      <div
        key={c.handle}
        onPointerDown={(e) => startDrag(e, target, c.handle)}
        className={`absolute ${c.pos} h-2.5 w-2.5 bg-[var(--accent)] border border-[var(--accent-fg)] ${c.cursor}`}
      />
    ));
  };

  const showFacecamBox = layout !== 'fullscreen';

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs font-bold tracking-wider text-[var(--ink-primary)]">
          SOURCE FRAMING
        </span>
        <span className="rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--ink-secondary)] tabular-nums">
          {sourceWidth} × {sourceHeight}
        </span>
      </div>

      <div className="relative flex flex-1 min-h-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-stage)] p-2">
        <div
          ref={containerRef}
          className="relative aspect-video w-full max-h-full select-none overflow-hidden bg-[#0a0d0b]"
        >
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            muted={isMuted}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.volume = Math.max(0, Math.min(1, masterVolume));
              }
              onVideoLoadedMetadata();
            }}
            onTimeUpdate={onVideoTimeUpdate}
            onEnded={onVideoEnded}
            className="h-full w-full object-contain"
          />

          {/* Gameplay Crop Box */}
          <div
            data-testid="gameplay-crop-box"
            onPointerDown={(e) => startDrag(e, 'gameplay', 'move')}
            style={{
              left: `${gameplayCrop.x * 100}%`,
              top: `${gameplayCrop.y * 100}%`,
              width: `${gameplayCrop.width * 100}%`,
              height: `${gameplayCrop.height * 100}%`,
              backgroundColor: 'var(--accent-soft)',
            }}
            className="absolute border-2 border-[var(--accent)] cursor-move"
          >
            <div className="absolute -top-3 left-0 h-2.5 w-16 bg-[var(--accent)]" />
            {renderHandles('gameplay')}
          </div>

          {/* Facecam Crop Box */}
          {showFacecamBox && (
            <div
              data-testid="facecam-crop-box"
              onPointerDown={(e) => startDrag(e, 'facecam', 'move')}
              style={{
                left: `${facecamCrop.x * 100}%`,
                top: `${facecamCrop.y * 100}%`,
                width: `${facecamCrop.width * 100}%`,
                height: `${facecamCrop.height * 100}%`,
              }}
              className="absolute border-2 border-slate-300/80 bg-white/10 cursor-move"
            >
              <span className="absolute -top-6 left-0 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-slate-950">
                FACECAM
              </span>
              {renderHandles('facecam')}
            </div>
          )}

          {/* Center Play/Pause Overlay Button */}
          <button
            type="button"
            aria-label={isPlaying ? 'Pause source video' : 'Play source video'}
            onClick={onTogglePlay}
            className="absolute top-1/2 left-1/2 z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-white/25 bg-black/80 text-white transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5 fill-current translate-x-0.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
