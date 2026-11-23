import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  CaptionSegment,
  CropRect,
  ExportPreset,
  LayoutMode,
  TextOverlay,
  TimelineSegment,
} from '../../src/types/clipsycut';
import {
  clampCropRect,
  computeLayoutGeometry,
  resolveExportSpec,
} from '../../src/utils/editorLogic';
import { probeVideoFile } from './streamAnalyzer';

const execFileAsync = promisify(execFile);

export interface ExportRequestPayload {
  videoUrl: string;
  layout: LayoutMode;
  gameplayCrop: CropRect;
  facecamCrop: CropRect;
  segments: TimelineSegment[];
  overlays: TextOverlay[];
  captions: CaptionSegment[];
  masterVolume: number;
  exportPreset?: ExportPreset;
  accentHex?: string;
}

/**
 * Resolves a local video URL (`/assets/...` or `/uploads/...`) to a confined filesystem path.
 */
export function resolveLocalVideoPath(rootDir: string, videoUrl: string): string | null {
  if (!videoUrl || typeof videoUrl !== 'string') return null;

  const cleanUrl = videoUrl.split('?')[0];
  if (cleanUrl.startsWith('/assets/')) {
    const baseDir = path.resolve(rootDir, 'public', 'assets');
    const candidate = path.resolve(rootDir, 'public', cleanUrl.replace(/^\/+/, ''));
    if (candidate.startsWith(baseDir + path.sep) && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (cleanUrl.startsWith('/uploads/')) {
    const baseDir = path.resolve(rootDir, 'uploads');
    const candidate = path.resolve(rootDir, cleanUrl.replace(/^\/+/, ''));
    if (candidate.startsWith(baseDir + path.sep) && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isRemoteHttpMedia(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

/**
 * Renders a real 9:16 H.264 MP4 vertical short (1080p60, 720p60, or 720p30) using FFmpeg
 * matching the exact Gameplay crop, Facecam crop, Layout mode, Timeline cuts, and Overlays.
 */
export async function exportVerticalShortMp4(
  rootDir: string,
  payload: ExportRequestPayload
): Promise<{ outputPath: string; fileName: string; width: number; height: number; fps: number; preset: ExportPreset }> {
  const localPath = resolveLocalVideoPath(rootDir, payload.videoUrl);
  const inputPath = localPath || (isRemoteHttpMedia(payload.videoUrl) ? payload.videoUrl : '');
  if (!inputPath) {
    throw new Error('No playable source video loaded. Scan a stream with media access or upload a video file first.');
  }

  const exportsDir = path.resolve(rootDir, 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });

  const spec = resolveExportSpec(payload.exportPreset);
  const probe = await probeVideoFile(inputPath);
  const srcW = probe.width;
  const srcH = probe.height;
  const outW = spec.width;
  const outH = spec.height;
  const outFps = spec.fps;
  const fontScale = outW / 720;

  const gp = clampCropRect(payload.gameplayCrop);
  const fc = clampCropRect(payload.facecamCrop);
  const geom = computeLayoutGeometry(payload.layout, outW, outH);

  const gpCropW = Math.max(16, Math.round(gp.width * srcW));
  const gpCropH = Math.max(16, Math.round(gp.height * srcH));
  const gpCropX = Math.max(0, Math.min(srcW - gpCropW, Math.round(gp.x * srcW)));
  const gpCropY = Math.max(0, Math.min(srcH - gpCropH, Math.round(gp.y * srcH)));

  const sourceDurationSec = Math.max(1, probe.durationSec);

  // Normalize the timeline into real, ordered cuts. Previously only the first
  // segment was exported, so split/delete edits silently disappeared.
  const cuts = (payload.segments || [])
    .map((segment) => {
      const start = Math.max(0, Math.min(sourceDurationSec - 0.2, Number(segment.sourceStartSec) || 0));
      const end = Math.max(
        start + 0.2,
        Math.min(sourceDurationSec, Number(segment.sourceEndSec) || start + 1)
      );
      return { start, end, duration: end - start };
    })
    .filter((cut) => cut.duration >= 0.2);

  if (cuts.length === 0) {
    cuts.push({
      start: 0,
      end: Math.min(sourceDurationSec, 30),
      duration: Math.min(sourceDurationSec, 30),
    });
  }
  const totalDur = cuts.reduce((sum, cut) => sum + cut.duration, 0);

  const filters: string[] = [];

  // Trim each timeline segment separately, then concatenate into one base
  // stream so the exported short matches the editor timeline exactly.
  cuts.forEach((cut, idx) => {
    filters.push(
      `[0:v]trim=start=${cut.start.toFixed(3)}:duration=${cut.duration.toFixed(3)},setpts=PTS-STARTPTS,fps=${outFps}[v${idx}]`
    );
  });

  if (cuts.length > 1) {
    filters.push(
      `${cuts.map((_, idx) => `[v${idx}]`).join('')}concat=n=${cuts.length}:v=1:a=0[basev]`
    );
  } else {
    filters.push(`[v0]null[basev]`);
  }

  if (geom.facecamDest) {
    filters.push(`[basev]split=2[gp_in][fc_in]`);
  } else {
    filters.push(`[basev]copy[gp_in]`);
  }

  // Gameplay branch
  const gpDest = geom.gameplayDest;
  filters.push(
    `[gp_in]crop=${gpCropW}:${gpCropH}:${gpCropX}:${gpCropY},scale=${gpDest.width}:${gpDest.height}:force_original_aspect_ratio=increase,crop=${gpDest.width}:${gpDest.height}[gp_scaled]`
  );

  // Build vertical canvas at target resolution and frame rate
  filters.push(`color=c=black:s=${outW}x${outH}:r=${outFps}:d=${totalDur.toFixed(3)}[bg]`);
  filters.push(`[bg][gp_scaled]overlay=${gpDest.x}:${gpDest.y}:shortest=1[stage1]`);

  let lastVideoLabel = 'stage1';

  if (geom.facecamDest) {
    const fcCropW = Math.max(16, Math.round(fc.width * srcW));
    const fcCropH = Math.max(16, Math.round(fc.height * srcH));
    const fcCropX = Math.max(0, Math.min(srcW - fcCropW, Math.round(fc.x * srcW)));
    const fcCropY = Math.max(0, Math.min(srcH - fcCropH, Math.round(fc.y * srcH)));
    const fd = geom.facecamDest;

    if (geom.facecamShape === 'circle') {
      const r = Math.floor(Math.min(fd.width, fd.height) / 2);
      filters.push(
        `[fc_in]crop=${fcCropW}:${fcCropH}:${fcCropX}:${fcCropY},scale=${fd.width}:${fd.height}:force_original_aspect_ratio=increase,crop=${fd.width}:${fd.height},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(pow(X-${r},2)+pow(Y-${r},2),pow(${r},2)),255,0)'[fc_ready]`
      );
    } else {
      filters.push(
        `[fc_in]crop=${fcCropW}:${fcCropH}:${fcCropX}:${fcCropY},scale=${fd.width}:${fd.height}:force_original_aspect_ratio=increase,crop=${fd.width}:${fd.height}[fc_ready]`
      );
    }

    filters.push(`[${lastVideoLabel}][fc_ready]overlay=${fd.x}:${fd.y}:shortest=1[stage2]`);
    lastVideoLabel = 'stage2';
  }

  const captionColor = /^#[0-9a-fA-F]{6}$/.test(payload.accentHex || '')
    ? payload.accentHex!
    : '#3df07a';

  // Burn in text overlays & active captions cleanly
  const textEntries: Array<{ text: string; yExpr: string; start: number; end: number; color: string; size: number }> = [];
  for (const ov of (payload.overlays ?? []).slice(0, 3)) {
    if (ov.text.trim()) {
      textEntries.push({
        text: ov.text.trim(),
        yExpr: `h*${Math.max(0.1, Math.min(0.88, ov.yPercent / 100)).toFixed(2)}`,
        start: Math.max(0, ov.startSec),
        end: Math.min(totalDur, ov.endSec),
        color: '#ffffff',
        size: Math.round(Math.max(26, Math.min(54, ov.fontSize || 38)) * fontScale),
      });
    }
  }
  for (const cap of (payload.captions ?? []).slice(0, 6)) {
    if (cap.text.trim()) {
      textEntries.push({
        text: cap.text.trim().toUpperCase(),
        yExpr: `h*0.74`,
        start: Math.max(0, cap.startSec),
        end: Math.min(totalDur, cap.endSec),
        color: captionColor,
        size: Math.round(36 * fontScale),
      });
    }
  }

  textEntries.forEach((entry, idx) => {
    const nextLabel = `txt${idx}`;
    const safeTxt = escapeDrawtext(entry.text);
    const borderW = Math.round(10 * fontScale);
    filters.push(
      `[${lastVideoLabel}]drawtext=text='${safeTxt}':x=(w-text_w)/2:y=${entry.yExpr}:fontsize=${entry.size}:fontcolor=${entry.color}:box=1:boxcolor=black@0.65:boxborderw=${borderW}:enable='between(t,${entry.start.toFixed(2)},${entry.end.toFixed(2)})'[${nextLabel}]`
    );
    lastVideoLabel = nextLabel;
  });

  const fileName = `ClipsyCut-short-${spec.preset}-${Date.now().toString(36)}.mp4`;
  const outputPath = path.resolve(exportsDir, fileName);
  if (!outputPath.startsWith(exportsDir + path.sep)) {
    throw new Error('Invalid export destination.');
  }

  const args: string[] = ['-y', '-i', inputPath];

  if (probe.hasAudio) {
    const vol = Math.max(0, Math.min(2, Number(payload.masterVolume ?? 1)));
    cuts.forEach((cut, idx) => {
      filters.push(
        `[0:a]atrim=start=${cut.start.toFixed(3)}:duration=${cut.duration.toFixed(3)},asetpts=PTS-STARTPTS[a${idx}]`
      );
    });
    if (cuts.length > 1) {
      filters.push(
        `${cuts.map((_, idx) => `[a${idx}]`).join('')}concat=n=${cuts.length}:v=0:a=1[basea]`
      );
    } else {
      filters.push(`[a0]anull[basea]`);
    }
    filters.push(`[basea]volume=${vol.toFixed(2)}[outa]`);
    args.push('-filter_complex', filters.join(';'), '-map', `[${lastVideoLabel}]`, '-map', '[outa]');
    args.push('-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-filter_complex', filters.join(';'), '-map', `[${lastVideoLabel}]`, '-an');
  }

  args.push(
    '-r',
    String(outFps),
    '-c:v',
    'libx264',
    '-preset',
    spec.ffmpegPreset,
    '-crf',
    spec.crf,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath
  );

  // Rendering time scales with clip length and preset; 90s was too short for
  // multi-minute 1080p60 cuts and produced truncated/failed exports.
  const exportTimeoutMs = Math.max(
    120000,
    Math.min(45 * 60 * 1000, Math.round(totalDur * 7000))
  );
  await execFileAsync('ffmpeg', args, {
    timeout: exportTimeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });

  return {
    outputPath,
    fileName,
    width: outW,
    height: outH,
    fps: outFps,
    preset: spec.preset,
  };
}
