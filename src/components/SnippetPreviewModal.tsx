import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { ClipProject, ViralMoment } from '../types/clipsycut';
import {
  computeSnippetPreviewProgress,
  formatPreciseTimecode,
  isHlsUrl,
} from '../utils/editorLogic';
import { useHlsVideo } from '../hooks/useHlsVideo';

interface SnippetPreviewModalProps {
  project: ClipProject;
  moment: ViralMoment;
  onClose: () => void;
  onOpenInEditor: (projectId: string, moment: ViralMoment) => void;
  onRepairMedia?: (projectId: string) => Promise<ClipProject | null>;
}

export const SnippetPreviewModal: React.FC<SnippetPreviewModalProps> = ({
  project,
  moment,
  onClose,
  onOpenInEditor,
  onRepairMedia,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [currentSourceSec, setCurrentSourceSec] = useState(moment.startSec);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(project.videoUrl));
  const [isRepairing, setIsRepairing] = useState(false);
  const [resolvedProject, setResolvedProject] = useState<ClipProject>(project);
  const sourceUrl = resolvedProject.videoUrl;
  const hasVideo = Boolean(sourceUrl && sourceUrl.trim());
  const hlsError = useHlsVideo(videoRef, hasVideo ? sourceUrl : undefined);
  const playbackError = hlsError || mediaError;

  useEffect(() => {
    setResolvedProject(project);
    setMediaError(null);
    setIsLoading(Boolean(project.videoUrl));
  }, [project]);

  const progress = computeSnippetPreviewProgress(
    currentSourceSec,
    moment.startSec,
    moment.endSec
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleLoadedMetadata = async () => {
    const video = videoRef.current;
    if (!video) return;
    setIsLoading(false);
    // Seek after metadata so the browser does not ignore the assignment.
    try {
      video.currentTime = moment.startSec;
    } catch {
      // Some HLS live edges reject seeks; playback still starts below.
    }
    setCurrentSourceSec(moment.startSec);
    try {
      await video.play();
      setIsPlaying(true);
    } catch {
      // Autoplay can be blocked; the user can press play.
      setIsPlaying(false);
    }
  };

  const handleVideoError = () => {
    setIsLoading(false);
    setIsPlaying(false);
    setMediaError(
      'This video could not be loaded. The stream link may have expired, or the file may be incomplete.'
    );
  };

  const handleRepair = async () => {
    if (!onRepairMedia || isRepairing) return;
    setIsRepairing(true);
    setMediaError(null);
    setIsLoading(true);
    const repaired = await onRepairMedia(project.id);
    setIsRepairing(false);
    if (!repaired) {
      setMediaError('Repair failed. Upload a local recording instead.');
      setIsLoading(false);
      return;
    }
    setResolvedProject(repaired);
    const video = videoRef.current;
    if (video && repaired.videoUrl && !isHlsUrl(repaired.videoUrl)) {
      video.src = repaired.videoUrl;
      video.load();
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime >= moment.endSec) {
      if (isLooping) {
        video.currentTime = moment.startSec;
        setCurrentSourceSec(moment.startSec);
      } else {
        video.pause();
        video.currentTime = moment.endSec;
        setCurrentSourceSec(moment.endSec);
        setIsPlaying(false);
      }
      return;
    }
    setCurrentSourceSec(video.currentTime);
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime >= moment.endSec - 0.1 || video.currentTime < moment.startSec) {
        video.currentTime = moment.startSec;
      }
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextElapsed = Number(e.target.value);
    const nextSource = Math.min(
      moment.endSec,
      Math.max(moment.startSec, moment.startSec + nextElapsed)
    );
    setCurrentSourceSec(nextSource);
    if (videoRef.current) {
      videoRef.current.currentTime = nextSource;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="snippet-preview-title"
      data-testid="snippet-preview-modal"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[780px] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 font-bold text-[var(--accent-text)]">
                VIRAL SNIPPET PREVIEW
              </span>
              <span className="text-[var(--ink-muted)] tabular-nums">
                {formatPreciseTimecode(moment.startSec)} – {formatPreciseTimecode(moment.endSec)} ({progress.durationSec.toFixed(1)}s)
              </span>
              <span className="text-[var(--ink-muted)]">·</span>
              <span className="font-semibold text-[var(--ink-secondary)]">
                {moment.peakMetric}
              </span>
            </div>
            <h2
              id="snippet-preview-title"
              className="mt-1.5 font-display text-lg font-bold text-[var(--ink-primary)] truncate"
            >
              {moment.title}
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close snippet preview"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Bounded Video Stage */}
        <div className="relative aspect-video w-full bg-[var(--bg-stage)]">
          <video
            ref={videoRef}
            src={
              hasVideo && !isHlsUrl(sourceUrl) ? sourceUrl : undefined
            }
            playsInline
            muted={isMuted}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onWaiting={() => setIsLoading(true)}
            onCanPlay={() => setIsLoading(false)}
            onPlaying={() => {
              setIsPlaying(true);
              setIsLoading(false);
            }}
            onError={handleVideoError}
            onEnded={() => setIsPlaying(false)}
            className="h-full w-full object-contain"
          />

          {isLoading && hasVideo && !playbackError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 font-mono text-[11px] font-semibold text-white">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Loading stream media…
              </span>
            </div>
          )}

          {playbackError && hasVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 px-6 text-center">
              <AlertTriangle className="h-7 w-7 text-amber-400" aria-hidden="true" />
              <p className="font-mono text-[11px] font-bold tracking-wider text-white">
                SOURCE VIDEO COULD NOT PLAY
              </p>
              <p className="max-w-[360px] text-[11px] leading-relaxed text-white/70">
                {playbackError}
              </p>
              {onRepairMedia && (
                <button
                  type="button"
                  onClick={handleRepair}
                  disabled={isRepairing}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-60"
                >
                  {isRepairing ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  )}
                  {isRepairing ? 'Downloading stream…' : 'Repair media'}
                </button>
              )}
            </div>
          )}

          {!hasVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 px-6 text-center">
              <VideoOff className="h-7 w-7 text-white/50" aria-hidden="true" />
              <p className="font-mono text-[11px] font-bold tracking-wider text-white">
                NO SOURCE VIDEO LOADED
              </p>
              <p className="max-w-[320px] text-[11px] leading-relaxed text-white/60">
                This project has no playable stream media yet. Repair media will
                download the original stream, or upload a local recording in the editor.
              </p>
              {onRepairMedia && resolvedProject.sourceUrl && (
                <button
                  type="button"
                  onClick={handleRepair}
                  disabled={isRepairing}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-60"
                >
                  {isRepairing ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  )}
                  {isRepairing ? 'Downloading stream…' : 'Download source video'}
                </button>
              )}
            </div>
          )}

          {/* AI Hook Caption Preview Overlay */}
          {moment.hookText && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/80 px-3.5 py-1.5 text-center font-display text-sm font-extrabold tracking-wide text-white shadow">
              {moment.hookText}
            </div>
          )}

          <button
            type="button"
            aria-label={isPlaying ? 'Pause snippet' : 'Play snippet'}
            disabled={!hasVideo}
            onClick={togglePlay}
            className="absolute top-1/2 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/75 text-white transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5 fill-current translate-x-0.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Snippet Scrubber + Details */}
        <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!hasVideo}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:border-[var(--accent)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5 translate-x-0.25" aria-hidden="true" />
              )}
            </button>

            <input
              type="range"
              aria-label="Snippet playback position"
              min={0}
              max={progress.durationSec}
              step={0.1}
              value={progress.elapsedSec}
              disabled={!hasVideo}
              onChange={handleScrub}
              style={{ accentColor: 'var(--accent)' }}
              className="flex-1 cursor-pointer"
            />

            <span className="font-mono text-xs text-[var(--ink-secondary)] tabular-nums whitespace-nowrap">
              {formatPreciseTimecode(progress.elapsedSec)} / {formatPreciseTimecode(progress.durationSec)}
            </span>

            <button
              type="button"
              aria-pressed={isLooping}
              aria-label="Toggle loop snippet"
              onClick={() => setIsLooping((l) => !l)}
              className={`inline-flex h-8 items-center gap-1 rounded border px-2 font-mono text-[11px] font-semibold cursor-pointer ${
                isLooping
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                  : 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--ink-muted)]'
              }`}
            >
              <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Loop</span>
            </button>

            <button
              type="button"
              aria-label={isMuted ? 'Unmute preview' : 'Mute preview'}
              onClick={() => setIsMuted((m) => !m)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="mt-3 flex flex-col justify-between gap-3 border-t border-[var(--border-hairline)] pt-3 sm:flex-row sm:items-center">
            <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
              <span className="font-semibold text-[var(--ink-primary)]">{project.title}: </span>
              {moment.reason}
            </p>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)] cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInEditor(project.id, moment);
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap"
              >
                <span>Open snippet in editor</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
