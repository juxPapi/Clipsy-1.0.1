import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { CaptionSegment, Platform, ViralMoment } from '../../src/types/clipfast';
import {
  MAX_GENERATED_CLIPS,
  MIN_GENERATED_CLIPS,
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
}

/**
 * Resolves the REAL media of a pasted stream so the preview/editor never falls
 * back to bundled demo footage. Prefers downloading a bounded 720p copy into
 * the uploads directory (also enables FFmpeg export); falls back to a direct
 * CDN URL for browser playback only.
 */
export async function resolveStreamPlayback(
  canonicalUrl: string,
  uploadsDir: string,
  mediaId: string
): Promise<StreamMediaResult> {
  const bin = resolveYtDlpBinary();
  if (!bin) {
    return {
      videoUrl: '',
      source: 'none',
      note: 'yt-dlp is unavailable on the server. Upload a local video file to preview and edit.',
    };
  }

  const format = 'best[height<=720][ext=mp4]/best[height<=720]/best';
  let directUrl = '';
  try {
    const { stdout } = await execFileAsync(
      bin,
      ['-g', '-f', format, '--no-playlist', '--socket-timeout', '10', canonicalUrl],
      { timeout: 25000, maxBuffer: 2 * 1024 * 1024 }
    );
    directUrl =
      stdout
        .split('\n')
        .map((line) => line.trim())
        .find((line) => /^https?:\/\//i.test(line)) || '';
  } catch {
    // Direct URL extraction can fail on bot-protected platforms; still try download.
  }

  fs.mkdirSync(uploadsDir, { recursive: true });
  const outTemplate = path.join(uploadsDir, `stream-${mediaId}.%(ext)s`);
  try {
    await execFileAsync(
      bin,
      [
        '-f',
        format,
        '--no-playlist',
        '--socket-timeout',
        '10',
        '--retries',
        '2',
        '-o',
        outTemplate,
        canonicalUrl,
      ],
      { timeout: 180000, maxBuffer: 2 * 1024 * 1024 }
    );
    const downloaded = fs
      .readdirSync(uploadsDir)
      .find((name) => name.startsWith(`stream-${mediaId}.`) && /\.(mp4|webm|mkv|mov)$/i.test(name));
    if (downloaded) {
      return {
        localPath: path.join(uploadsDir, downloaded),
        videoUrl: `/uploads/${downloaded}`,
        source: 'downloaded',
      };
    }
  } catch {
    // Fall through to the direct CDN URL.
  }

  if (directUrl) {
    return {
      videoUrl: directUrl,
      source: 'direct-url',
      note: 'Streaming from the platform CDN. Upload a local copy if you need FFmpeg export.',
    };
  }
  return {
    videoUrl: '',
    source: 'none',
    note: 'Could not retrieve playable media from this stream. Upload a local recording to preview and edit.',
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
}

export async function probeVideoFile(filePath: string): Promise<VideoProbeInfo> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,width,height,r_frame_rate',
      '-of',
      'json',
      filePath,
    ],
    { timeout: 15000 }
  );

  const parsed = JSON.parse(stdout || '{}');
  const streams: Array<{
    codec_type?: string;
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
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024 }
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
    const spikes = samples.filter((s) => s.db > avgDb + 3.5);

    const windows: AudioPeakWindow[] = [];
    for (const sample of spikes) {
      const last = windows[windows.length - 1];
      if (last && sample.time <= last.endSec + 2.5) {
        last.endSec = Math.min(durationSec, Number((sample.time + 2).toFixed(1)));
        last.peakDb = Math.max(last.peakDb, sample.db);
      } else {
        windows.push({
          startSec: Math.max(0, Number((sample.time - 2).toFixed(1))),
          endSec: Math.min(durationSec, Number((sample.time + 4).toFixed(1))),
          peakDb: Number(sample.db.toFixed(1)),
        });
      }
    }

    return windows.sort((a, b) => b.peakDb - a.peakDb).slice(0, MAX_GENERATED_CLIPS);
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
    const candidates: ViralMoment[] = params.audioSpikes.map((spike, idx) => ({
      id: `spike-${idx + 1}`,
      title: `Audio energy spike #${idx + 1}`,
      startSec: spike.startSec,
      endSec: spike.endSec,
      score: Math.min(98, Math.round(78 + (spike.peakDb + 30) * 0.8)),
      category: 'reaction',
      reason: `FFmpeg measured RMS loudness surge at ${spike.peakDb} dB.`,
      hookText: 'WAIT FOR THE REACTION',
      peakMetric: `${spike.peakDb} dB audio peak`,
    }));

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
  const safeDur = Math.max(6, Math.min(60, params.durationSec));

  if (!ai) {
    // Local fallback keeps the caption tool usable without an API key.
    const source = `${params.hookContext || ''} ${params.title}`.replace(/[^\w\s']/g, ' ');
    const words = source.split(/\s+/).map((w) => w.trim()).filter(Boolean);
    const fallbackLines = words.length
      ? Array.from({ length: 5 }, (_, i) => words.slice(i * 2, i * 2 + 3).join(' ') || 'WATCH THIS')
      : ['WATCH THIS', 'NO WAY', 'CHAT WENT WILD', 'WHAT A PLAY', 'INCREDIBLE'];
    const step = safeDur / fallbackLines.length;
    const captions: CaptionSegment[] = fallbackLines.map((line, idx) => ({
      id: `cap-local-${Date.now().toString(36)}-${idx}`,
      text: line.toUpperCase().slice(0, 44),
      startSec: Number((step * idx).toFixed(1)),
      endSec: Number(Math.min(safeDur, step * (idx + 1) - 0.3).toFixed(1)),
      highlightWord: line.split(/\s+/)[0]?.toUpperCase().slice(0, 16) || '',
    }));
    return { captions };
  }

  const prompt = `Generate 5 short-form TikTok/Shorts caption lines timed across 0 to ${safeDur} seconds for a ${params.platform} stream clip titled "${params.title}". Context: ${params.hookContext || 'High-energy gameplay and streamer reaction'}. Each caption should be 3-6 punchy words with 1 highlightWord.`;

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
    const captions: CaptionSegment[] = (Array.isArray(raw) ? raw : []).map((c, idx) => ({
      id: `cap-${Date.now().toString(36)}-${idx}`,
      text: String(c.text || ''),
      startSec: Math.max(0, Number(c.startSec) || idx * 3),
      endSec: Math.min(safeDur, Number(c.endSec) || idx * 3 + 2.8),
      highlightWord: String(c.highlightWord || ''),
    }));

    return { captions };
  } catch (err) {
    const msg = formatGeminiError(err);
    console.error(`[Gemini] generateCaptionsWithGemini failed after ${Date.now() - t0}ms:`, msg);
    return {
      captions: [],
      error: msg,
    };
  }
}
