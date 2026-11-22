import React, { useEffect, useRef } from 'react';
import type {
  CaptionSegment,
  CaptionStylePreset,
  CropRect,
  ExportPreset,
  LayoutMode,
  TextOverlay,
  VideoEffect,
} from '../../types/clipfast';
import { computeLayoutGeometry, resolveExportSpec } from '../../utils/editorLogic';

interface FinalShortStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  layout: LayoutMode;
  gameplayCrop: CropRect;
  facecamCrop: CropRect;
  currentTimeSec: number;
  overlays: TextOverlay[];
  captions: CaptionSegment[];
  captionStyle: CaptionStylePreset;
  effects: VideoEffect[];
  exportPreset: ExportPreset;
  accentHex: string;
  showSafeArea?: boolean;
}

const CANVAS_W = 360;
const CANVAS_H = 640;

export const FinalShortStage: React.FC<FinalShortStageProps> = ({
  videoRef,
  layout,
  gameplayCrop,
  facecamCrop,
  currentTimeSec,
  overlays,
  captions,
  captionStyle,
  effects,
  exportPreset,
  accentHex,
  showSafeArea = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exportSpec = resolveExportSpec(exportPreset);

  useEffect(() => {
    let rafId = 0;

    const renderFrame = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#060807';
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

          // Check active effects at currentTimeSec
          const activeEffects = effects.filter(
            (fx) => currentTimeSec >= fx.startSec && currentTimeSec <= fx.endSec
          );
          const hasZoom = activeEffects.some((fx) => fx.type === 'punch-zoom');
          const hasShake = activeEffects.some((fx) => fx.type === 'screen-shake');
          const hasFlash = activeEffects.some((fx) => fx.type === 'impact-flash');
          const hasVignette = activeEffects.some((fx) => fx.type === 'vignette');

          const shakeX = hasShake ? Math.sin(currentTimeSec * 42) * 5 : 0;
          const shakeY = hasShake ? Math.cos(currentTimeSec * 37) * 5 : 0;
          const zoomScale = hasZoom ? 1.12 : 1;

          const geom = computeLayoutGeometry(layout, CANVAS_W, CANVAS_H);

          if (video && video.readyState >= 2 && video.videoWidth > 0) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;

            ctx.save();
            if (hasZoom || hasShake) {
              ctx.translate(CANVAS_W / 2 + shakeX, CANVAS_H / 2 + shakeY);
              ctx.scale(zoomScale, zoomScale);
              ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);
            }

            const drawCoveredCrop = (
              crop: CropRect,
              dest: { x: number; y: number; width: number; height: number }
            ) => {
              const sx = crop.x * vw;
              const sy = crop.y * vh;
              const sw = Math.max(8, crop.width * vw);
              const sh = Math.max(8, crop.height * vh);
              const srcAspect = sw / sh;
              const dstAspect = dest.width / dest.height;

              let finalSx = sx;
              let finalSy = sy;
              let finalSw = sw;
              let finalSh = sh;
              if (srcAspect > dstAspect) {
                finalSw = sh * dstAspect;
                finalSx = sx + (sw - finalSw) / 2;
              } else {
                finalSh = sw / dstAspect;
                finalSy = sy + (sh - finalSh) / 2;
              }
              ctx.drawImage(
                video,
                finalSx,
                finalSy,
                finalSw,
                finalSh,
                dest.x,
                dest.y,
                dest.width,
                dest.height
              );
            };

            // Draw Gameplay region
            drawCoveredCrop(gameplayCrop, geom.gameplayDest);

            // Draw Facecam region
            if (geom.facecamDest) {
              const fd = geom.facecamDest;
              ctx.save();
              if (geom.facecamShape === 'circle') {
                const cx = fd.x + fd.width / 2;
                const cy = fd.y + fd.height / 2;
                const r = Math.min(fd.width, fd.height) / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
              } else if (geom.facecamShape === 'rounded') {
                ctx.beginPath();
                ctx.roundRect(fd.x, fd.y, fd.width, fd.height, 10);
                ctx.closePath();
                ctx.clip();
              }

              drawCoveredCrop(facecamCrop, fd);
              ctx.restore();

              if (geom.facecamShape === 'circle') {
                const cx = fd.x + fd.width / 2;
                const cy = fd.y + fd.height / 2;
                const r = Math.min(fd.width, fd.height) / 2;
                ctx.strokeStyle = accentHex;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
              } else if (geom.facecamShape === 'rounded') {
                ctx.strokeStyle = accentHex;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(fd.x, fd.y, fd.width, fd.height, 10);
                ctx.stroke();
              }
            }
            ctx.restore();
          }

          if (hasVignette) {
            const grad = ctx.createRadialGradient(
              CANVAS_W / 2,
              CANVAS_H / 2,
              CANVAS_W * 0.25,
              CANVAS_W / 2,
              CANVAS_H / 2,
              CANVAS_H * 0.65
            );
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.62)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          }

          if (hasFlash) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          }

          // Render active text overlays
          for (const ov of overlays) {
            if (currentTimeSec >= ov.startSec && currentTimeSec <= ov.endSec && ov.text.trim()) {
              const x = (ov.xPercent / 100) * CANVAS_W;
              const y = (ov.yPercent / 100) * CANVAS_H;
              const fontSize = Math.round((ov.fontSize || 34) * 0.56);
              ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const metrics = ctx.measureText(ov.text);
              const padX = 12;
              const padY = 6;
              if (ov.bgColor !== 'transparent') {
                ctx.fillStyle = ov.bgColor || 'rgba(5,7,6,0.75)';
                ctx.fillRect(
                  x - metrics.width / 2 - padX,
                  y - fontSize / 2 - padY,
                  metrics.width + padX * 2,
                  fontSize + padY * 2
                );
              }
              ctx.fillStyle = ov.color || '#ffffff';
              ctx.fillText(ov.text, x, y);
            }
          }

          // Render active captions
          const activeCap = captions.find(
            (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec
          );
          if (activeCap && activeCap.text.trim()) {
            const words = activeCap.text.toUpperCase().split(/\s+/);
            const cy = CANVAS_H * 0.72;
            ctx.font = '800 21px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (captionStyle === 'clean-box') {
              const full = words.join(' ');
              const m = ctx.measureText(full);
              ctx.fillStyle = 'rgba(6, 8, 7, 0.85)';
              ctx.fillRect(CANVAS_W / 2 - m.width / 2 - 14, cy - 18, m.width + 28, 36);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(full, CANVAS_W / 2, cy);
            } else {
              const line = words.join(' ');
              ctx.lineWidth = 4;
              ctx.strokeStyle = '#040605';
              ctx.strokeText(line, CANVAS_W / 2, cy);
              ctx.fillStyle = activeCap.highlightWord ? accentHex : '#ffffff';
              ctx.fillText(line, CANVAS_W / 2, cy);
            }
          }
        }
      }
      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    videoRef,
    layout,
    gameplayCrop,
    facecamCrop,
    currentTimeSec,
    overlays,
    captions,
    captionStyle,
    effects,
    accentHex,
  ]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs font-bold tracking-wider text-[var(--ink-primary)]">
          FINAL SHORT
        </span>
        <span className="rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--ink-secondary)] tabular-nums">
          9:16 · {exportSpec.width} × {exportSpec.height} · {exportSpec.fps}fps
        </span>
      </div>

      <div className="relative flex flex-1 min-h-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-stage)] p-2">
        <div className="relative aspect-[9/16] h-full max-h-full overflow-hidden border border-white/15 bg-black">
          <canvas
            ref={canvasRef}
            data-testid="final-short-canvas"
            width={CANVAS_W}
            height={CANVAS_H}
            className="h-full w-full block"
          />

          {showSafeArea && (
            <div className="pointer-events-none absolute inset-4 border border-dashed border-white/30">
              <div className="absolute bottom-3 left-2.5 bg-black/85 px-2.5 py-1.5 font-mono text-[9px] leading-tight tracking-wider text-white">
                SAFE AREA · NOT EXPORTED
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
