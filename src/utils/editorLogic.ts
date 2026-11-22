import type {
  AccentPaletteId,
  ClipProject,
  CropRect,
  ExportPreset,
  LayoutMode,
  Platform,
  TimelineSegment,
  ViralMoment,
} from '../types/clipfast';

export interface ParsedStreamUrl {
  valid: boolean;
  platform: Platform | null;
  contentKind: 'live' | 'vod' | 'clip' | 'video' | null;
  identifier: string | null;
  canonicalUrl: string | null;
  error?: string;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'music.youtube.com',
]);

const KICK_HOSTS = new Set(['kick.com', 'www.kick.com']);

const TWITCH_HOSTS = new Set([
  'twitch.tv',
  'www.twitch.tv',
  'm.twitch.tv',
  'clips.twitch.tv',
]);

/**
 * Strictly validates and parses user-supplied stream/VOD/clip URLs for YouTube, Kick, and Twitch.
 * Rejects non-HTTP(S) protocols, IP literals, localhost, and unsupported domains to prevent SSRF.
 */
export function parseStreamUrl(rawUrl: string): ParsedStreamUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      valid: false,
      platform: null,
      contentKind: null,
      identifier: null,
      canonicalUrl: null,
      error: 'Please paste a YouTube, Kick, or Twitch link.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return {
      valid: false,
      platform: null,
      contentKind: null,
      identifier: null,
      canonicalUrl: null,
      error: 'Enter a valid URL starting with https://',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      platform: null,
      contentKind: null,
      identifier: null,
      canonicalUrl: null,
      error: 'Only HTTP and HTTPS stream links are supported.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(hostname)) {
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (hostname === 'youtu.be' && pathParts[0]) {
      return {
        valid: true,
        platform: 'youtube',
        contentKind: 'video',
        identifier: pathParts[0],
        canonicalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(pathParts[0])}`,
      };
    }
    const vParam = parsed.searchParams.get('v');
    if (vParam) {
      return {
        valid: true,
        platform: 'youtube',
        contentKind: 'video',
        identifier: vParam,
        canonicalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(vParam)}`,
      };
    }
    if (pathParts[0] === 'live' && pathParts[1]) {
      return {
        valid: true,
        platform: 'youtube',
        contentKind: 'live',
        identifier: pathParts[1],
        canonicalUrl: `https://www.youtube.com/live/${encodeURIComponent(pathParts[1])}`,
      };
    }
    if (pathParts[0] === 'shorts' && pathParts[1]) {
      return {
        valid: true,
        platform: 'youtube',
        contentKind: 'clip',
        identifier: pathParts[1],
        canonicalUrl: `https://www.youtube.com/shorts/${encodeURIComponent(pathParts[1])}`,
      };
    }
    if (pathParts[0]?.startsWith('@')) {
      return {
        valid: true,
        platform: 'youtube',
        contentKind: 'live',
        identifier: pathParts[0],
        canonicalUrl: `https://www.youtube.com/${pathParts[0]}/live`,
      };
    }
    return {
      valid: false,
      platform: 'youtube',
      contentKind: null,
      identifier: null,
      canonicalUrl: null,
      error: 'Include a specific YouTube video, live stream, or channel handle URL.',
    };
  }

  if (KICK_HOSTS.has(hostname)) {
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length === 0) {
      return {
        valid: false,
        platform: 'kick',
        contentKind: null,
        identifier: null,
        canonicalUrl: null,
        error: 'Include a Kick channel, VOD, or clip path.',
      };
    }
    const clipQuery = parsed.searchParams.get('clip');
    if (clipQuery || pathParts[1] === 'clips') {
      const clipId = clipQuery ?? pathParts[2] ?? pathParts[0];
      return {
        valid: true,
        platform: 'kick',
        contentKind: 'clip',
        identifier: clipId,
        canonicalUrl: parsed.toString(),
      };
    }
    if (pathParts[1] === 'videos' && pathParts[2]) {
      return {
        valid: true,
        platform: 'kick',
        contentKind: 'vod',
        identifier: pathParts[2],
        canonicalUrl: `https://kick.com/${encodeURIComponent(pathParts[0])}/videos/${encodeURIComponent(pathParts[2])}`,
      };
    }
    return {
      valid: true,
      platform: 'kick',
      contentKind: 'live',
      identifier: pathParts[0],
      canonicalUrl: `https://kick.com/${encodeURIComponent(pathParts[0])}`,
    };
  }

  if (TWITCH_HOSTS.has(hostname)) {
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (hostname === 'clips.twitch.tv' && pathParts[0]) {
      return {
        valid: true,
        platform: 'twitch',
        contentKind: 'clip',
        identifier: pathParts[0],
        canonicalUrl: `https://clips.twitch.tv/${encodeURIComponent(pathParts[0])}`,
      };
    }
    if (pathParts[0] === 'videos' && pathParts[1]) {
      return {
        valid: true,
        platform: 'twitch',
        contentKind: 'vod',
        identifier: pathParts[1],
        canonicalUrl: `https://www.twitch.tv/videos/${encodeURIComponent(pathParts[1])}`,
      };
    }
    if (pathParts[1] === 'clip' && pathParts[2]) {
      return {
        valid: true,
        platform: 'twitch',
        contentKind: 'clip',
        identifier: pathParts[2],
        canonicalUrl: `https://www.twitch.tv/${encodeURIComponent(pathParts[0])}/clip/${encodeURIComponent(pathParts[2])}`,
      };
    }
    if (pathParts[0]) {
      return {
        valid: true,
        platform: 'twitch',
        contentKind: 'live',
        identifier: pathParts[0],
        canonicalUrl: `https://www.twitch.tv/${encodeURIComponent(pathParts[0])}`,
      };
    }
    return {
      valid: false,
      platform: 'twitch',
      contentKind: null,
      identifier: null,
      canonicalUrl: null,
      error: 'Include a Twitch channel, VOD (/videos/...), or clip URL.',
    };
  }

  return {
    valid: false,
    platform: null,
    contentKind: null,
    identifier: null,
    canonicalUrl: null,
    error: 'Supported platforms: YouTube, Kick, and Twitch URLs.',
  };
}

/**
 * Clamps normalized [0..1] crop boxes so they stay strictly inside the source frame
 * and preserve at least `minSize` width/height.
 */
export function clampCropRect(rect: CropRect, minSize = 0.08): CropRect {
  const width = Math.max(minSize, Math.min(1, rect.width));
  const height = Math.max(minSize, Math.min(1, rect.height));
  const x = Math.max(0, Math.min(1 - width, rect.x));
  const y = Math.max(0, Math.min(1 - height, rect.y));
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: Number(width.toFixed(4)),
    height: Number(height.toFixed(4)),
  };
}

export const DEFAULT_GAMEPLAY_CROP: CropRect = {
  x: 0.105,
  y: 0.02,
  width: 0.5625,
  height: 0.96,
};

export const DEFAULT_FACECAM_CROP: CropRect = {
  x: 0.03,
  y: 0.58,
  width: 0.23,
  height: 0.36,
};

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutDestination {
  gameplayDest: PixelRect;
  facecamDest: PixelRect | null;
  facecamShape: 'rect' | 'circle' | 'rounded';
}

/**
 * Computes exact output pixel rectangles in the 9:16 vertical frame (e.g. 720x1280)
 * shared by both the live HTML5 canvas preview and server-side FFmpeg export.
 */
export function computeLayoutGeometry(
  layout: LayoutMode,
  canvasW = 720,
  canvasH = 1280
): LayoutDestination {
  switch (layout) {
    case 'split': {
      const topH = Math.round(canvasH * 0.55);
      return {
        gameplayDest: { x: 0, y: 0, width: canvasW, height: topH },
        facecamDest: { x: 0, y: topH, width: canvasW, height: canvasH - topH },
        facecamShape: 'rect',
      };
    }
    case 'round-facecam': {
      const size = Math.round(canvasW * 0.34);
      const margin = Math.round(canvasW * 0.055);
      return {
        gameplayDest: { x: 0, y: 0, width: canvasW, height: canvasH },
        facecamDest: { x: margin, y: margin + 36, width: size, height: size },
        facecamShape: 'circle',
      };
    }
    case 'small-facecam': {
      const camW = Math.round(canvasW * 0.36);
      const camH = Math.round(camW * 0.72);
      const margin = Math.round(canvasW * 0.05);
      return {
        gameplayDest: { x: 0, y: 0, width: canvasW, height: canvasH },
        facecamDest: {
          x: canvasW - camW - margin,
          y: margin + 36,
          width: camW,
          height: camH,
        },
        facecamShape: 'rounded',
      };
    }
    case 'fullscreen':
    default:
      return {
        gameplayDest: { x: 0, y: 0, width: canvasW, height: canvasH },
        facecamDest: null,
        facecamShape: 'rect',
      };
  }
}

export function getTimelineTotalDuration(segments: TimelineSegment[]): number {
  return segments.reduce(
    (sum, seg) => sum + Math.max(0, seg.sourceEndSec - seg.sourceStartSec),
    0
  );
}

/**
 * Splits the segment containing `timelineTimeSec` into two contiguous clips.
 */
export function splitSegmentAtTime(
  segments: TimelineSegment[],
  timelineTimeSec: number,
  minDurationSec = 0.5
): TimelineSegment[] {
  let cursor = 0;
  const next: TimelineSegment[] = [];
  let didSplit = false;

  for (const seg of segments) {
    const dur = Math.max(0, seg.sourceEndSec - seg.sourceStartSec);
    const segStart = cursor;
    const segEnd = cursor + dur;

    if (!didSplit && timelineTimeSec > segStart + minDurationSec && timelineTimeSec < segEnd - minDurationSec) {
      const offset = timelineTimeSec - segStart;
      const splitSourceAt = Number((seg.sourceStartSec + offset).toFixed(3));
      next.push({
        id: `${seg.id}-a`,
        label: seg.label,
        sourceStartSec: seg.sourceStartSec,
        sourceEndSec: splitSourceAt,
      });
      next.push({
        id: `${seg.id}-b-${Date.now().toString(36)}`,
        label: `${seg.label} (pt 2)`,
        sourceStartSec: splitSourceAt,
        sourceEndSec: seg.sourceEndSec,
      });
      didSplit = true;
    } else {
      next.push(seg);
    }

    cursor = segEnd;
  }

  return next;
}

/**
 * Removes a timeline segment if at least one segment remains.
 */
export function deleteSegmentById(
  segments: TimelineSegment[],
  segmentId: string
): TimelineSegment[] {
  if (segments.length <= 1) {
    return segments;
  }
  const filtered = segments.filter((s) => s.id !== segmentId);
  return filtered.length > 0 ? filtered : segments;
}

/**
 * Maps an edited timeline timestamp to the underlying source video timestamp.
 */
export function mapTimelineToSourceTime(
  segments: TimelineSegment[],
  timelineTimeSec: number
): { sourceTimeSec: number; activeSegmentId: string | null } {
  let cursor = 0;
  for (const seg of segments) {
    const dur = Math.max(0, seg.sourceEndSec - seg.sourceStartSec);
    if (timelineTimeSec <= cursor + dur || seg === segments[segments.length - 1]) {
      const clampedOffset = Math.max(0, Math.min(dur, timelineTimeSec - cursor));
      return {
        sourceTimeSec: seg.sourceStartSec + clampedOffset,
        activeSegmentId: seg.id,
      };
    }
    cursor += dur;
  }
  return { sourceTimeSec: 0, activeSegmentId: null };
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Computes whether live chat velocity constitutes a viral spike relative to rolling baseline.
 */
export function computeChatSpikeScore(
  currentMsgsPerMin: number,
  baselineMsgsPerMin: number
): { ratio: number; isSpike: boolean; intensity: 'baseline' | 'rising' | 'spike' } {
  const safeBaseline = Math.max(4, baselineMsgsPerMin);
  const ratio = Number((currentMsgsPerMin / safeBaseline).toFixed(2));
  if (ratio >= 2.2) {
    return { ratio, isSpike: true, intensity: 'spike' };
  }
  if (ratio >= 1.5) {
    return { ratio, isSpike: false, intensity: 'rising' };
  }
  return { ratio, isSpike: false, intensity: 'baseline' };
}

export interface ExportSpec {
  preset: ExportPreset;
  width: number;
  height: number;
  fps: number;
  label: string;
  ffmpegPreset: string;
  crf: string;
}

export function resolveExportSpec(preset?: string): ExportSpec {
  switch (preset) {
    case '1080p60':
      return {
        preset: '1080p60',
        width: 1080,
        height: 1920,
        fps: 60,
        label: '1080p60',
        ffmpegPreset: 'ultrafast',
        crf: '22',
      };
    case '720p60':
      return {
        preset: '720p60',
        width: 720,
        height: 1280,
        fps: 60,
        label: '720p60',
        ffmpegPreset: 'veryfast',
        crf: '22',
      };
    case '720p30':
    default:
      return {
        preset: '720p30',
        width: 720,
        height: 1280,
        fps: 30,
        label: '720p30',
        ffmpegPreset: 'veryfast',
        crf: '23',
      };
  }
}

export interface AccentPalette {
  id: AccentPaletteId;
  name: string;
  swatchHex: string;
  darkTextHex: string;
  lightTextHex: string;
  fgHex: string;
}

export const ACCENT_PALETTES: AccentPalette[] = [
  {
    id: 'volt',
    name: 'Volt Green',
    swatchHex: '#3df07a',
    darkTextHex: '#3df07a',
    lightTextHex: '#15803d',
    fgHex: '#04210e',
  },
  {
    id: 'blue',
    name: 'Electric Blue',
    swatchHex: '#3b82f6',
    darkTextHex: '#60a5fa',
    lightTextHex: '#1d4ed8',
    fgHex: '#ffffff',
  },
  {
    id: 'amber',
    name: 'Solar Amber',
    swatchHex: '#f59e0b',
    darkTextHex: '#fbbf24',
    lightTextHex: '#b45309',
    fgHex: '#1c1002',
  },
  {
    id: 'rose',
    name: 'Crimson Pulse',
    swatchHex: '#f43f5e',
    darkTextHex: '#fb7185',
    lightTextHex: '#be123c',
    fgHex: '#ffffff',
  },
  {
    id: 'violet',
    name: 'Violet Spark',
    swatchHex: '#8b5cf6',
    darkTextHex: '#a78bfa',
    lightTextHex: '#6d28d9',
    fgHex: '#ffffff',
  },
];

export function getAccentPalette(id?: string): AccentPalette {
  return ACCENT_PALETTES.find((p) => p.id === id) ?? ACCENT_PALETTES[0];
}

/**
 * Formats seconds with tenth-of-a-second precision (MM:SS.d) for clip trim handles.
 */
export function formatPreciseTimecode(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const roundedTenths = Math.round(safe * 10);
  const mins = Math.floor(roundedTenths / 600);
  const remTenths = roundedTenths % 600;
  const secs = Math.floor(remTenths / 10);
  const tenth = remTenths % 10;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenth}`;
}

/**
 * Clamps and validates a viral moment's [startSec, endSec] range inside [0, totalDurationSec]
 * while preserving a minimum span (`minSpanSec`, default 1.0s) and 0.1s precision.
 */
export function clampMomentRange(
  startSec: number,
  endSec: number,
  totalDurationSec: number,
  changedEdge: 'start' | 'end' = 'start',
  minSpanSec = 1.0
): { startSec: number; endSec: number } {
  const maxDur = Math.max(minSpanSec, Number((totalDurationSec || 30).toFixed(1)));
  const minGap = Math.min(minSpanSec, maxDur);
  const round1 = (n: number) => Number(n.toFixed(1));

  let start = Math.max(0, Math.min(maxDur, Number.isFinite(startSec) ? startSec : 0));
  let end = Math.max(0, Math.min(maxDur, Number.isFinite(endSec) ? endSec : maxDur));

  if (changedEdge === 'start') {
    start = Math.min(start, end - minGap);
    if (start < 0) {
      start = 0;
      end = Math.max(end, minGap);
    }
  } else {
    end = Math.max(end, start + minGap);
    if (end > maxDur) {
      end = maxDur;
      start = Math.min(start, maxDur - minGap);
    }
  }

  return {
    startSec: round1(Math.max(0, start)),
    endSec: round1(Math.min(maxDur, end)),
  };
}

/**
 * Slides an entire [startSec, endSec] clip window by deltaSec without changing its duration.
 */
export function shiftMomentWindow(
  startSec: number,
  endSec: number,
  deltaSec: number,
  totalDurationSec: number
): { startSec: number; endSec: number } {
  const maxDur = Math.max(1, Number((totalDurationSec || 30).toFixed(1)));
  const span = Math.max(1, Math.min(maxDur, endSec - startSec));
  const nextStart = Math.max(0, Math.min(maxDur - span, startSec + deltaSec));
  return {
    startSec: Number(nextStart.toFixed(1)),
    endSec: Number((nextStart + span).toFixed(1)),
  };
}

/**
 * Resolves the specific viral snippet to load when opening a project in the editor:
 * uses an explicitly chosen moment, or the project's selectedMomentId, or its first viral moment.
 */
export function resolveSnippetForProject(
  project: Pick<ClipProject, 'viralMoments' | 'selectedMomentId'>,
  explicitMoment?: ViralMoment
): ViralMoment | undefined {
  if (explicitMoment) return explicitMoment;
  if (!project.viralMoments || project.viralMoments.length === 0) return undefined;
  if (project.selectedMomentId) {
    const matched = project.viralMoments.find((m) => m.id === project.selectedMomentId);
    if (matched) return matched;
  }
  return project.viralMoments[0];
}

/**
 * Computes bounded playback progress inside a viral snippet [startSec, endSec].
 */
export function computeSnippetPreviewProgress(
  videoTimeSec: number,
  startSec: number,
  endSec: number
): { elapsedSec: number; durationSec: number; progressPct: number; isFinished: boolean } {
  const durationSec = Math.max(0.5, Number((endSec - startSec).toFixed(1)));
  const rawElapsed = videoTimeSec - startSec;
  const elapsedSec = Math.max(0, Math.min(durationSec, Number(rawElapsed.toFixed(1))));
  const progressPct = Math.max(0, Math.min(100, (elapsedSec / durationSec) * 100));
  return {
    elapsedSec,
    durationSec,
    progressPct,
    isFinished: videoTimeSec >= endSec - 0.05,
  };
}

export interface ExportProgressState {
  percent: number;
  stageLabel: string;
  stepIndex: 0 | 1 | 2 | 3 | 4;
}

/**
 * Computes simulated-yet-deterministic 0–100% FFmpeg export progress and pipeline stage
 * from elapsed render time and export preset, snapping to 100% when complete.
 */
export function computeExportProgressStage(
  elapsedMs: number,
  preset: ExportPreset | undefined,
  isComplete: boolean,
  durationSec?: number
): ExportProgressState {
  const spec = resolveExportSpec(preset);
  if (isComplete) {
    return {
      percent: 100,
      stageLabel: 'Export ready to download',
      stepIndex: 4,
    };
  }

  const safeElapsed = Math.max(0, elapsedMs);
  const baseTauMs =
    spec.preset === '1080p60' ? 2800 : spec.preset === '720p60' ? 1900 : 1500;
  const durationMultiplier =
    typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 12
      ? Math.min(4.5, durationSec / 12)
      : 1;
  const tauMs = Math.round(baseTauMs * durationMultiplier);
  const rawPercent = Math.round(95 * (1 - Math.exp(-safeElapsed / tauMs)));
  const percent = safeElapsed === 0 ? 0 : Math.max(4, Math.min(94, rawPercent));

  if (percent < 20) {
    return {
      percent,
      stageLabel: 'Probing source streams',
      stepIndex: 0,
    };
  }
  if (percent < 55) {
    return {
      percent,
      stageLabel: 'Reframing 9:16 Gameplay & Facecam',
      stepIndex: 1,
    };
  }
  if (percent < 85) {
    return {
      percent,
      stageLabel: `Encoding ${spec.width}×${spec.height} @ ${spec.fps}fps (H.264)`,
      stepIndex: 2,
    };
  }
  return {
    percent,
    stageLabel: 'Muxing audio, captions & faststart MP4',
    stepIndex: 3,
  };
}

/**
 * Formats rendered MP4 byte counts into human-readable KB / MB labels.
 */
export function formatExportFileSize(bytes?: number | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return 'Ready';
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
