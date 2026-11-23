export type Platform = 'youtube' | 'kick' | 'twitch' | 'upload';

export type LayoutMode = 'split' | 'round-facecam' | 'small-facecam' | 'fullscreen';

export type EditorToolTab = 'layout' | 'text' | 'captions' | 'audio' | 'effects' | 'ai-clips';

export type ExportPreset = '1080p60' | '720p60' | '720p30';

export type ThemeMode = 'dark' | 'light';

export type AccentPaletteId = 'volt' | 'blue' | 'amber' | 'rose' | 'violet';

export interface CropRect {
  /** Normalized 0..1 coordinates relative to source video width/height */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimelineSegment {
  id: string;
  label: string;
  sourceStartSec: number;
  sourceEndSec: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  xPercent: number;
  yPercent: number;
  fontSize: number;
  color: string;
  bgColor: string;
}

export interface CaptionSegment {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  highlightWord?: string;
}

export type CaptionStylePreset = 'bold-highlight' | 'clean-box' | 'minimal-stroke';

export interface AudioTrackItem {
  id: string;
  name: string;
  category: 'sfx' | 'music';
  startSec: number;
  durationSec: number;
  volume: number;
}

export interface VideoEffect {
  id: string;
  type: 'punch-zoom' | 'screen-shake' | 'impact-flash' | 'vignette';
  label: string;
  startSec: number;
  endSec: number;
  intensity: number;
}

export interface ViralMoment {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  score: number;
  category: 'clutch' | 'chat-spike' | 'reaction' | 'humor' | 'callout';
  reason: string;
  hookText: string;
  peakMetric: string;
}

export interface ClipProject {
  id: string;
  title: string;
  fileName: string;
  platform: Platform;
  sourceUrl?: string;
  videoUrl: string;
  /** Human-readable note about how the source media was resolved. */
  mediaNote?: string;
  thumbnailUrl?: string;
  channelName: string;
  durationSec: number;
  fps: number;
  sourceWidth: number;
  sourceHeight: number;
  createdAt: string;
  status: 'ready' | 'viral-detected' | 'exported';
  layout: LayoutMode;
  gameplayCrop: CropRect;
  facecamCrop: CropRect;
  segments: TimelineSegment[];
  overlays: TextOverlay[];
  captions: CaptionSegment[];
  captionStyle: CaptionStylePreset;
  audioTracks: AudioTrackItem[];
  effects: VideoEffect[];
  masterVolume: number;
  viralMoments: ViralMoment[];
  selectedMomentId?: string;
}

export interface StreamAnalysisResult {
  ok: boolean;
  platform: Platform;
  contentKind: 'live' | 'vod' | 'clip' | 'video';
  canonicalUrl: string;
  title: string;
  channelName: string;
  durationSec: number;
  sourceWidth: number;
  sourceHeight: number;
  fps: number;
  thumbnailUrl?: string;
  videoUrl: string;
  metadataSource: 'yt-dlp' | 'ffprobe' | 'url-gemini';
  note?: string;
  moments: ViralMoment[];
}
