import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { CaptionSegment, Platform, ViralMoment } from '../../src/types/clipsycut';
import {
  MAX_GENERATED_CLIPS,
  MIN_GENERATED_CLIPS,
  buildFallbackCaptions,
  normalizeViralMoments,
} from '../../src/utils/editorLogic';

const execFileAsync = promisify(execFile);

const YT_DLP_CANDIDATES = [
  path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
  '/usr/local/bin/yt-dlp',
  '/usr/bin/yt-dlp',
];

/** True when a binary can actually be executed (supports PATH installs on Windows/macOS). */
export function hasBinary(bin: string, versionArg = '--version'): boolean {
  try {
    execFileSync(bin, [versionArg], { timeout: 15000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function resolveYtDlpBinary(): string | null {
  for (const candidate of YT_DLP_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Winget/Homebrew/npm installs expose yt-dlp on PATH rather than at a fixed path.
  return hasBinary('yt-dlp') ? 'yt-dlp' : null;
}

export interface StreamMediaResult {
  /** Absolute path to a locally downloaded copy of the stream, when available. */
  localPath?: string;
  /** Browser-playable source: local `/uploads/...`, a direct CDN URL, or '' when unavailable. */
  videoUrl: string;
  source: 'downloaded' | 'direct-url' | 'none';
  note?: string;
  /** Real duration of the resolved media (may be shorter than the source VOD). */
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  /** True when only the first N seconds of a long VOD were downloaded. */
  truncated?: boolean;
  downloadError?: string;
}

/** Long VODs are bounded so previews play fast and never fill the disk. */
export const DEFAULT_MAX_SOURCE_SEC = Math.max(
  60,
  Math.min(3600, Number(process.env.CLIPSYCUT_MAX_SOURCE_SEC || 900))
);

const DOWNLOAD_TIMEOUT_MS = Math.max(
  120000,
  Math.min(900000, Number(process.env.CLIPSYCUT_DOWNLOAD_TIMEOUT_MS || 600000))
);

export function encodeHlsProxyUrl(targetUrl: string): string {
  return `/api/hls-proxy?u=${encodeURIComponent(targetUrl)}`;
}

/** True for remote HLS playlists and same-origin app HLS proxies. */
export function isHlsUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith('/api/hls-proxy')) return true;
  try {
    const url = new URL(value, 'http://localhost');
    if (url.pathname.endsWith('.m3u8')) return true;
    if (/\\.m3u8($|\\?)/i.test(value)) return true;
    const host = url.hostname.toLowerCase();
    if (host === 'manifest.googlevideo.com') return true;
    return /manifest[\/\\]hls_playlist/i.test(url.pathname) || /m3u8/i.test(url.search);
  } catch {
    return /\\.m3u8($|\\?)/i.test(value);
  }
}

/**
 * Removes abandoned yt-dlp downloads (`.part`, `.ytdl`, fragment parts).
 * Long streams used to leave multi-hundred-MB stubs behind after timeouts.
 */
export function cleanupStaleMediaParts(uploadsDir: string, olderThanMs = 60 * 60 * 1000): number {
  let removed = 0;
  try {
    if (!fs.existsSync(uploadsDir)) return 0;
    const now = Date.now();
    for (const name of fs.readdirSync(uploadsDir)) {
      const isPartial =
        name.endsWith('.part') || name.endsWith('.ytdl') || /\.part[-.]/i.test(name);
      if (!isPartial) continue;
      const full = path.join(uploadsDir, name);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs < olderThanMs) continue;
        fs.rmSync(full, { force: true });
        removed += 1;
      } catch {
        // Ignore locks; a later run can retry.
      }
    }
  } catch {
    // Non-fatal cleanup.
  }
  return removed;
}

function hasFastStart(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(512 * 1024);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.subarray(0, read).toString('latin1');
    const moov = head.indexOf('moov');
    const mdat = head.indexOf('mdat');
    return moov !== -1 && (mdat === -1 || moov < mdat);
  } catch {
    return false;
  }
}

/**
 * Guarantees a file the browser can actually play: H.264/AAC in a fast-start
 * MP4 container. HLS/TS/WebM/MKV downloads are remuxed or transcoded here.
 */
async function ensureBrowserPlayableMp4(
  inputPath: string,
  outputPath: string,
  maxDurationSec?: number
): Promise<{ filePath: string; probe: VideoProbeInfo }> {
  const probe = await probeVideoFile(inputPath);
  const isMp4 = /\.[a-z0-9]+$/i.test(outputPath) && /mp4/i.test(path.extname(inputPath));
  const alreadyPlayable =
    isMp4 &&
    probe.videoCodec === 'h264' &&
    (!probe.hasAudio || probe.audioCodec === 'aac') &&
    hasFastStart(inputPath);

  if (alreadyPlayable) {
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      fs.copyFileSync(inputPath, outputPath);
    }
    return { filePath: outputPath, probe };
  }

  const copyOnly = probe.videoCodec === 'h264' && (!probe.hasAudio || probe.audioCodec === 'aac');
  const args = ['-y', '-i', inputPath];
  if (copyOnly) {
    args.push('-c', 'copy');
  } else {
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '24',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '160k'
    );
  }
  args.push('-movflags', '+faststart');
  if (maxDurationSec && maxDurationSec > 0) {
    args.push('-t', String(Math.ceil(maxDurationSec)));
  }
  args.push(outputPath);

  await execFileAsync('ffmpeg', args, { timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
  const outProbe = await probeVideoFile(outputPath);
  return { filePath: outputPath, probe: outProbe };
}

/**
 * Resolves the REAL media of a pasted stream so the preview/editor never falls
 * back to bundled demo footage. Downloads a bounded, browser-safe MP4 into the
 * uploads directory (also enables FFmpeg export); falls back to a direct CDN
 * URL (HLS is played with hls.js) when downloading is blocked.
 */
export async function resolveStreamPlayback(
  canonicalUrl: string,
  uploadsDir: string,
  mediaId: string,
  options: { durationSec?: number; maxSourceSec?: number } = {}
): Promise<StreamMediaResult> {
  const bin = resolveYtDlpBinary();
  if (!bin) {
    return {
      videoUrl: '',
      source: 'none',
      note: 'yt-dlp is unavailable on the server. Upload a local video file to preview and edit.',
    };
  }

  const cap = Math.max(60, options.maxSourceSec || DEFAULT_MAX_SOURCE_SEC);
  const durationHint = Math.max(0, Number(options.durationSec) || 0);
  const maxHeight = durationHint > 0 && durationHint <= 600 ? 720 : 480;
  const format = [
    `b[ext=mp4][height<=${maxHeight}]/b[height<=${maxHeight}]`,
    'bv*/ba*/b',
  ].join('/');

  let directUrl = '';
  try {
    const { stdout } = await execFileAsync(
      bin,
      [
        '-g',
        '-f',
        format,
        '--no-playlist',
        '--no-warnings',
        '--socket-timeout',
        '15',
        canonicalUrl,
      ],
      { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }
    );
    directUrl =
      stdout
        .split('\n')
        .map((line) => line.trim())
        .find((line) => /^https?:\/\//i.test(line)) || '';
  } catch {
    // Direct URL extraction can fail on bot-protected platforms; still try download.
  }

  // Live HLS is bounded by the client-side hls.js player instead of a local
  // download; only long VOD-style media is bounded via --download-sections.
  const truncated = durationHint > cap + 5 && !isHlsUrl(directUrl);

  fs.mkdirSync(uploadsDir, { recursive: true });
  cleanupStaleMediaParts(uploadsDir);
  for (const name of fs.readdirSync(uploadsDir)) {
    if (name.startsWith(`stream-${mediaId}.`) && /\.(part|ytdl)$/i.test(name)) {
      try {
        fs.rmSync(path.join(uploadsDir, name), { force: true });
      } catch {
        // ignore
      }
    }
  }

  const outTemplate = path.join(uploadsDir, `stream-${mediaId}.%(ext)s`);
  const downloadArgs = [
    '-f',
    format,
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout',
    '20',
    '--retries',
    '3',
    '--fragment-retries',
    '5',
    '--remux-video',
    'mp4',
    '--merge-output-format',
    'mp4',
    '-o',
    outTemplate,
  ];
  if (truncated) {
    downloadArgs.push('--download-sections', `*0-${cap}`, '--force-keyframes-at-cuts');
  }
  downloadArgs.push(canonicalUrl);

  let downloadError = '';
  try {
    await execFileAsync(bin, downloadArgs, {
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
    const downloaded = fs
      .readdirSync(uploadsDir)
      .filter(
        (name) =>
          name.startsWith(`stream-${mediaId}.`) &&
          /\.(mp4|webm|mkv|mov|ts)$/i.test(name) &&
          fs.statSync(path.join(uploadsDir, name)).size > 10 * 1024
      )
      .sort(
        (a, b) =>
          fs.statSync(path.join(uploadsDir, b)).size - fs.statSync(path.join(uploadsDir, a)).size
      )[0];

    if (downloaded) {
      const downloadedPath = path.join(uploadsDir, downloaded);
      const finalPath = path.join(uploadsDir, `stream-${mediaId}.mp4`);
      try {
        const normalized = await ensureBrowserPlayableMp4(
          downloadedPath,
          finalPath,
          truncated ? cap : undefined
        );
        if (path.resolve(downloadedPath) !== path.resolve(normalized.filePath)) {
          try {
            fs.rmSync(downloadedPath, { force: true });
          } catch {
            // ignore
          }
        }
        return {
          localPath: normalized.filePath,
          videoUrl: `/uploads/${path.basename(normalized.filePath)}`,
          source: 'downloaded',
          durationSec: normalized.probe.durationSec,
          width: normalized.probe.width,
          height: normalized.probe.height,
          fps: normalized.probe.fps,
          truncated,
          note: truncated
            ? `Downloaded the first ${Math.round(cap / 60)} minutes of this long stream so it plays instantly.`
            : undefined,
        };
      } catch (err) {
        // Keep the yt-dlp output when FFmpeg normalization fails (most browsers
        // still play MP4/WebM); report the issue for diagnostics.
        downloadError = err instanceof Error ? err.message : String(err);
        const fallbackProbe = await probeVideoFile(downloadedPath).catch(() => null);
        if (fallbackProbe) {
          return {
            localPath: downloadedPath,
            videoUrl: `/uploads/${downloaded}`,
            source: 'downloaded',
            durationSec: fallbackProbe.durationSec,
            width: fallbackProbe.width,
            height: fallbackProbe.height,
            fps: fallbackProbe.fps,
            truncated,
            downloadError,
          };
        }
      }
    }
  } catch (err) {
    downloadError = err instanceof Error ? err.message.split('\n')[0] : String(err);
    // Remove partial fragments so they cannot masquerade as playable media.
    for (const name of fs.readdirSync(uploadsDir)) {
      if (name.startsWith(`stream-${mediaId}.`) && /\.(part|ytdl)$/i.test(name)) {
        try {
          fs.rmSync(path.join(uploadsDir, name), { force: true });
        } catch {
          // ignore
        }
      }
    }
  }

  if (directUrl) {
    const proxiedHls = isHlsUrl(directUrl) ? encodeHlsProxyUrl(directUrl) : '';
    return {
      videoUrl: proxiedHls,
      source: 'direct-url',
      durationSec: durationHint || undefined,
      truncated: false,
      downloadError: downloadError || undefined,
      note: proxiedHls
        ? 'Playing directly from the platform HLS CDN through the app proxy. If the link expires, use Repair media.'
        : 'Playing directly from the platform CDN. Use Repair media if it expires.',
    };
  }

  const reason = downloadError
    ? ` (${downloadError.replace(/\s+/g, ' ').slice(0, 140)})`
    : '';
  return {
    videoUrl: '',
    source: 'none',
    truncated: false,
    downloadError: downloadError || undefined,
    note: `Could not retrieve playable media from this stream${reason}. Use Repair media or upload a local recording.`,
  };
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 20000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed?.error ?? parsed;
    if (inner?.message) {
      return inner.status ? `${inner.status}: ${inner.message}` : String(inner.message);
    }
  } catch {
    // Not a JSON string; return raw message trimmed
  }
  return raw.slice(0, 220);
}

export interface VideoProbeInfo {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
}

export async function probeVideoFile(filePath: string): Promise<VideoProbeInfo> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate',
      '-of',
      'json',
      filePath,
    ],
    { timeout: 30000 }
  );

  const parsed = JSON.parse(stdout || '{}');
  const streams: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
  }> = Array.isArray(parsed.streams) ? parsed.streams : [];

  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  let fps = 30;
  if (videoStream?.r_frame_rate && videoStream.r_frame_rate.includes('/')) {
    const [numStr, denStr] = videoStream.r_frame_rate.split('/');
    const num = Number(numStr);
    const den = Number(denStr);
    if (den > 0 && Number.isFinite(num)) {
      fps = Number((num / den).toFixed(3));
    }
  }

  const durationSec = Math.max(1, Number(Number(parsed.format?.duration || 30).toFixed(1)));

  return {
    durationSec,
    width: videoStream?.width || 1280,
    height: videoStream?.height || 720,
    fps,
    hasAudio: Boolean(audioStream),
    videoCodec: videoStream?.codec_name,
    audioCodec: audioStream?.codec_name,
  };
}

export interface AudioPeakWindow {
  startSec: number;
  endSec: number;
  peakDb: number;
}

/**
 * Extracts real audio loudness windows from a video file using FFmpeg `astats`.
 */
export async function detectAudioSpikes(
  filePath: string,
  durationSec: number
): Promise<AudioPeakWindow[]> {
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      [
        '-i',
        filePath,
        '-vn',
        '-af',
        'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
        '-f',
        'null',
        '-',
      ],
      {
        timeout: Math.min(150000, Math.max(25000, durationSec * 120)),
        maxBuffer: 8 * 1024 * 1024,
      }
    );

    const samples: Array<{ time: number; db: number }> = [];
    let currentTime = 0;

    for (const line of stderr.split('\n')) {
      const ptsMatch = line.match(/pts_time:([0-9.]+)/);
      if (ptsMatch) {
        currentTime = Number(ptsMatch[1]);
      }
      const rmsMatch = line.match(/lavfi\.astats\.Overall\.RMS_level=([-0-9.]+)/);
      if (rmsMatch) {
        const db = Number(rmsMatch[1]);
        if (Number.isFinite(db)) {
          samples.push({ time: currentTime, db });
        }
      }
    }

    if (samples.length === 0) {
      return [];
    }

    const avgDb = samples.reduce((acc, s) => acc + s.db, 0) / samples.length;
    const variance =
      samples.reduce((acc, s) => acc + (s.db - avgDb) ** 2, 0) / Math.max(1, samples.length);
    const stdDb = Math.sqrt(variance);
    const sortedDb = [...samples].map((s) => s.db).sort((a, b) => a - b);
    const p85 = sortedDb[Math.min(sortedDb.length - 1, Math.floor(sortedDb.length * 0.85))];
    const threshold = Math.max(avgDb + Math.max(1.5, stdDb * 0.6), p85);

    // Only real peaks above both the adaptive floor and the 85th percentile.
    const spikes = samples.filter((s) => s.db >= threshold);
    if (spikes.length === 0) {
      return [];
    }

    // Merge nearby detections into single highlight windows.
    const clusters: Array<{ first: number; last: number; peakDb: number }> = [];
    for (const sample of spikes) {
      const last = clusters[clusters.length - 1];
      if (last && sample.time <= last.last + 4) {
        last.last = sample.time;
        last.peakDb = Math.max(last.peakDb, sample.db);
      } else {
        clusters.push({ first: sample.time, last: sample.time, peakDb: sample.db });
      }
    }

    const windows: AudioPeakWindow[] = clusters.map((cluster) => {
      const minSpan = 6;
      const maxSpan = 14;
      let start = Math.max(0, cluster.first - 3);
      let end = Math.min(durationSec, cluster.last + 4);
      if (end - start < minSpan) {
        const center = (cluster.first + cluster.last) / 2;
        start = Math.max(0, center - minSpan / 2);
        end = Math.min(durationSec, start + minSpan);
        start = Math.max(0, end - minSpan);
      }
      if (end - start > maxSpan) {
        end = start + maxSpan;
      }
      return {
        startSec: Number(start.toFixed(1)),
        endSec: Number(end.toFixed(1)),
        peakDb: Number(cluster.peakDb.toFixed(1)),
      };
    });

    // Rank by loudness, then keep non-overlapping windows so the five to eight
    // clips each come from a distinct high-energy moment.
    const selected: AudioPeakWindow[] = [];
    for (const window of windows.sort((a, b) => b.peakDb - a.peakDb)) {
      const overlaps = selected.some((other) => {
        const overlap =
          Math.min(window.endSec, other.endSec) - Math.max(window.startSec, other.startSec);
        const smaller = Math.min(
          window.endSec - window.startSec,
          other.endSec - other.startSec
        );
        return overlap > 0 && overlap / Math.max(0.1, smaller) > 0.5;
      });
      if (!overlaps) selected.push(window);
      if (selected.length >= MAX_GENERATED_CLIPS) break;
    }

    return selected;
  } catch {
    return [];
  }
}

export interface YtDlpMetadata {
  title: string;
  uploader: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  thumbnailUrl?: string;
  heatmap?: Array<{ start_time: number; end_time: number; value: number }>;
  chapters?: Array<{ start_time: number; end_time: number; title: string }>;
  isLive?: boolean;
  description?: string;
}

export async function inspectStreamWithYtDlp(canonicalUrl: string): Promise<{
  data: YtDlpMetadata | null;
  error?: string;
}> {
  const bin = resolveYtDlpBinary();
  if (!bin) {
    return { data: null, error: 'yt-dlp binary is not installed on server.' };
  }

  try {
    const { stdout } = await execFileAsync(
      bin,
      [
        '--dump-single-json',
        '--no-download',
        '--no-warnings',
        '--no-playlist',
        '--socket-timeout',
        '10',
        canonicalUrl,
      ],
      { timeout: 18000, maxBuffer: 8 * 1024 * 1024 }
    );

    const info = JSON.parse(stdout || '{}');
    return {
      data: {
        title: info.title || 'Stream Highlight',
        uploader: info.uploader || info.channel || info.creator || 'Creator',
        durationSec: Math.max(15, Number(info.duration || 54)),
        width: Number(info.width || 1920),
        height: Number(info.height || 1080),
        fps: Number(info.fps || 30),
        thumbnailUrl: typeof info.thumbnail === 'string' ? info.thumbnail : undefined,
        heatmap: Array.isArray(info.heatmap) ? info.heatmap.slice(0, 40) : undefined,
        chapters: Array.isArray(info.chapters) ? info.chapters.slice(0, 20) : undefined,
        isLive: Boolean(info.is_live),
        description: typeof info.description === 'string' ? info.description.slice(0, 600) : undefined,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      error: message.split('\n').slice(0, 2).join(' ').slice(0, 240),
    };
  }
}

export async function fetchYoutubeOembedMetadata(
  canonicalUrl: string,
  videoId?: string | null
): Promise<Partial<YtDlpMetadata> | null> {
  try {
    const lookupUrl =
      videoId && !videoId.startsWith('@')
        ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
        : canonicalUrl;
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(lookupUrl)}&format=json`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    if (!data?.title) return null;
    return {
      title: data.title,
      uploader: data.author_name || 'YouTube Creator',
      thumbnailUrl: data.thumbnail_url,
    };
  } catch {
    return null;
  }
}

export async function identifyViralMomentsWithGemini(params: {
  platform: Platform;
  title: string;
  channelName: string;
  durationSec: number;
  audioSpikes: AudioPeakWindow[];
  heatmap?: Array<{ start_time: number; end_time: number; value: number }>;
  chapters?: Array<{ start_time: number; end_time: number; title: string }>;
  description?: string;
}): Promise<{ moments: ViralMoment[]; usedGemini: boolean; error?: string }> {
  const ai = getGeminiClient();
  const safeDuration = Math.max(15, params.durationSec);

  if (!ai) {
    // Deterministic fallback grounded strictly in measured FFmpeg/heatmap signals.
    // Always produces the configured 5-8 clip range when the stream is long enough.
    const signalSeeds: Array<{ startSec: number; endSec?: number; peakMetric?: string }> = [
      ...params.audioSpikes.map((spike) => ({
        startSec: spike.startSec,
        endSec: spike.endSec,
        peakMetric: `${spike.peakDb} dB audio peak`,
      })),
      ...(params.heatmap || []).map((point) => ({
        startSec: point.start_time,
        endSec: point.end_time,
        peakMetric: `Heatmap peak ${point.value}`,
      })),
    ];
    const audioCandidates: ViralMoment[] = params.audioSpikes.map((spike, idx) => ({
      id: `spike-${idx + 1}`,
      title: `Audio energy spike #${idx + 1}`,
      startSec: spike.startSec,
      endSec: spike.endSec,
      score: Math.min(98, Math.round(74 + Math.max(0, spike.peakDb + 40) * 0.7)),
      category: 'reaction',
      reason: `FFmpeg measured an RMS loudness surge peaking at ${spike.peakDb} dB.`,
      hookText: 'WAIT FOR THE REACTION',
      peakMetric: `${spike.peakDb} dB audio peak`,
    }));

    // Replay heatmaps are the strongest "this is the good part" signal on
    // platforms that expose them, so they compete directly with audio peaks.
    const heatmapCandidates: ViralMoment[] = (params.heatmap || [])
      .filter((point) => Number(point.value) > 0.2)
      .map((point, idx) => {
        const center = (Number(point.start_time) + Number(point.end_time)) / 2;
        const span = Math.max(8, Math.min(14, Number(point.end_time) - Number(point.start_time) + 6));
        const start = Math.max(0, Math.min(safeDuration - 6, center - span / 2));
        const end = Math.min(safeDuration, start + span);
        return {
          id: `heat-${idx + 1}`,
          title: `Most-replayed peak #${idx + 1}`,
          startSec: Number(start.toFixed(1)),
          endSec: Number(end.toFixed(1)),
          score: Math.min(98, Math.round(62 + Number(point.value) * 36)),
          category: 'clutch' as const,
          reason: `Platform replay heatmap spikes to ${Math.round(Number(point.value) * 100)}% here.`,
          hookText: 'CHAT REPLAYED THIS',
          peakMetric: `Heatmap ${Math.round(Number(point.value) * 100)}%`,
        };
      });

    const candidates = [...audioCandidates, ...heatmapCandidates];

    return {
      moments: normalizeViralMoments(candidates, safeDuration, signalSeeds),
      usedGemini: false,
      error: 'GEMINI_API_KEY is not configured in Secrets; returned measured signal windows.',
    };
  }

  const prompt = `Analyze this ${params.platform} stream/video and identify ${MIN_GENERATED_CLIPS} to ${MAX_GENERATED_CLIPS} high-retention vertical short-form viral moments (each 6 to 28 seconds long, strictly within 0 to ${safeDuration} seconds). Return as many distinct moments as the stream actually contains, never fewer than ${MIN_GENERATED_CLIPS} when that many candidates exist.

Metadata:
- Title: ${params.title}
- Channel: ${params.channelName}
- Duration: ${safeDuration}s
- Measured FFmpeg Audio Spikes: ${JSON.stringify(params.audioSpikes)}
- Platform Heatmap Peaks: ${JSON.stringify(params.heatmap?.slice(0, 12) ?? [])}
- Chapters: ${JSON.stringify(params.chapters ?? [])}
- Notes: ${params.description ?? 'None'}

Anchor your timestamps to the real audio spikes or heatmap peaks when provided. Keep hookText under 6 words.`;

  const callMomentsModel = async (
    model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite',
    thinkingLevel: ThinkingLevel,
    timeoutMs: number
  ) => {
    return ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        abortSignal: AbortSignal.timeout(timeoutMs),
        thinkingConfig: { thinkingLevel },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              startSec: { type: Type.NUMBER },
              endSec: { type: Type.NUMBER },
              score: { type: Type.INTEGER },
              category: { type: Type.STRING },
              reason: { type: Type.STRING },
              hookText: { type: Type.STRING },
              peakMetric: { type: Type.STRING },
            },
            required: ['title', 'startSec', 'endSec', 'score', 'category', 'reason', 'hookText', 'peakMetric'],
          },
        },
      },
    });
  };

  const t0 = Date.now();
  try {
    let response;
    try {
      response = await callMomentsModel('gemini-4-hydrogen', ThinkingLevel.LOW, 12000);
    } catch (primaryErr) {
      const primaryMsg = formatGeminiError(primaryErr);
      console.warn(`[Gemini] primary moments call failed (${Date.now() - t0}ms): ${primaryMsg}; trying gemini-3.1-flash-lite`);
      response = await callMomentsModel('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL, 12000);
    }

    const raw = JSON.parse((response.text ?? '[]').trim());
    const validCategories = new Set(['clutch', 'chat-spike', 'reaction', 'humor', 'callout']);
    const stamp = Date.now().toString(36);

    const parsed: ViralMoment[] = (Array.isArray(raw) ? raw : []).slice(0, MAX_GENERATED_CLIPS).map((item, idx) => {
      const start = Math.max(0, Math.min(safeDuration - 4, Number(item.startSec) || 0));
      const end = Math.max(start + 4, Math.min(safeDuration, Number(item.endSec) || start + 12));
      const cat = validCategories.has(item.category) ? item.category : 'clutch';
      return {
        id: `vm-${stamp}-${idx + 1}`,
        title: String(item.title || `Moment ${idx + 1}`),
        startSec: Number(start.toFixed(1)),
        endSec: Number(end.toFixed(1)),
        score: Math.max(50, Math.min(99, Math.round(Number(item.score) || 85))),
        category: cat as ViralMoment['category'],
        reason: String(item.reason || 'High-energy stream highlight'),
        hookText: String(item.hookText || 'WATCH THIS MOMENT'),
        peakMetric: String(item.peakMetric || 'AI Moment Scan'),
      };
    });

    const signalSeeds: Array<{ startSec: number; endSec?: number; peakMetric?: string }> = [
      ...params.audioSpikes.map((spike) => ({
        startSec: spike.startSec,
        endSec: spike.endSec,
        peakMetric: `${spike.peakDb} dB audio peak`,
      })),
      ...(params.heatmap || []).map((point) => ({
        startSec: point.start_time,
        endSec: point.end_time,
        peakMetric: `Heatmap peak ${point.value}`,
      })),
    ];
    const moments = normalizeViralMoments(parsed, safeDuration, signalSeeds);

    return { moments, usedGemini: true };
  } catch (err) {
    const msg = formatGeminiError(err);
    console.error(`[Gemini] identifyViralMomentsWithGemini failed after ${Date.now() - t0}ms:`, msg);
    return { moments: [], usedGemini: false, error: msg };
  }
}

export async function generateCaptionsWithGemini(params: {
  title: string;
  platform: Platform;
  durationSec: number;
  hookContext?: string;
}): Promise<{ captions: CaptionSegment[]; error?: string }> {
  const ai = getGeminiClient();
  const safeDur = Math.max(2, Math.min(180, params.durationSec));

  if (!ai) {
    return {
      captions: buildFallbackCaptions(params.title, safeDur, params.hookContext),
    };
  }

  const captionCount = Math.max(2, Math.min(6, Math.round(safeDur / 4) || 2));
  const prompt = `Generate ${captionCount} short-form TikTok/Shorts caption lines timed across 0 to ${safeDur} seconds for a ${params.platform} stream clip titled "${params.title}". Context: ${params.hookContext || 'High-energy gameplay and streamer reaction'}. Each caption should be 3-6 punchy words with 1 highlightWord. Cover the whole clip without overlapping timestamps.`;

  const callCaptionsModel = async (
    model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite',
    thinkingLevel: ThinkingLevel,
    timeoutMs: number
  ) => {
    return ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        abortSignal: AbortSignal.timeout(timeoutMs),
        thinkingConfig: { thinkingLevel },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              startSec: { type: Type.NUMBER },
              endSec: { type: Type.NUMBER },
              highlightWord: { type: Type.STRING },
            },
            required: ['text', 'startSec', 'endSec', 'highlightWord'],
          },
        },
      },
    });
  };

  const t0 = Date.now();
  try {
    let response;
    try {
      response = await callCaptionsModel('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL, 10000);
    } catch (primaryErr) {
      const primaryMsg = formatGeminiError(primaryErr);
      console.warn(`[Gemini] fast captions call failed (${Date.now() - t0}ms): ${primaryMsg}; trying gemini-4-hydrogen`);
      response = await callCaptionsModel('gemini-4-hydrogen', ThinkingLevel.LOW, 12000);
    }

    const raw = JSON.parse((response.text ?? '[]').trim());
    const stamp = Date.now().toString(36);
    const captions: CaptionSegment[] = (Array.isArray(raw) ? raw : [])
      .slice(0, 6)
      .map((c, idx) => {
        const start = Math.max(0, Math.min(safeDur - 0.4, Number(c.startSec) || idx * 3));
        const requestedEnd = Number(c.endSec) || start + 2.8;
        const end = Math.max(start + 0.3, Math.min(safeDur, requestedEnd));
        return {
          id: `cap-${stamp}-${idx}`,
          text: String(c.text || '').trim().slice(0, 60),
          startSec: Number(start.toFixed(2)),
          endSec: Number(end.toFixed(2)),
          highlightWord: String(c.highlightWord || '').trim().slice(0, 18),
        };
      })
      .filter((caption) => caption.text.length > 0 && caption.endSec > caption.startSec)
      .sort((a, b) => a.startSec - b.startSec);

    if (captions.length === 0) {
      return { captions: buildFallbackCaptions(params.title, safeDur, params.hookContext) };
    }

    return { captions };
  } catch (err) {
    const msg = formatGeminiError(err);
    console.error(`[Gemini] generateCaptionsWithGemini failed after ${Date.now() - t0}ms:`, msg);
    // Never leave the user with a dead captions button.
    return {
      captions: buildFallbackCaptions(params.title, safeDur, params.hookContext),
      error: msg,
    };
  }
}
