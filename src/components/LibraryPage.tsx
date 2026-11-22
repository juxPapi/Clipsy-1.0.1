import React, { useRef, useState } from 'react';
import {
  ArrowUpRight,
  Link2,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import type { ClipProject, Platform, ViralMoment } from '../types/clipfast';
import { formatTimecode, parseStreamUrl } from '../utils/editorLogic';
import type { AppRoute } from './Navbar';

interface LibraryPageProps {
  projects: ClipProject[];
  onOpenEditor: (projectId: string, moment?: ViralMoment) => void;
  onAnalyzeStreamUrl: (url: string) => Promise<ClipProject | null>;
  onUploadVideo: (file: File) => Promise<ClipProject | null>;
  onDeleteProject: (id: string) => Promise<void>;
  onNavigate: (route: AppRoute) => void;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  kick: 'Kick',
  twitch: 'Twitch',
  upload: 'Upload',
};

const PLATFORM_POSTER_FALLBACK: Record<Platform, string> = {
  twitch: '/src/assets/images/gaming_stream_fps_1795371872867.jpg',
  kick: '/src/assets/images/gaming_poster_racing_1795371871712.jpg',
  youtube: '/src/assets/images/gaming_poster_arena_1795371873067.jpg',
  upload: '/src/assets/images/gaming_poster_showdown_1795371872597.jpg',
};

export const LibraryPage: React.FC<LibraryPageProps> = ({
  projects,
  onOpenEditor,
  onAnalyzeStreamUrl,
  onUploadVideo,
  onDeleteProject,
  onNavigate,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<'all' | Platform>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScannedProject, setLastScannedProject] = useState<ClipProject | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  const handleAnalyzeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseStreamUrl(streamUrl);
    if (!parsed.valid) {
      setScanError(parsed.error || 'Enter a valid YouTube, Kick, or Twitch URL.');
      return;
    }
    setScanError(null);
    setIsScanning(true);
    try {
      const created = await onAnalyzeStreamUrl(streamUrl);
      if (created) {
        setLastScannedProject(created);
        setStreamUrl('');
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setIsUploading(true);
    try {
      const created = await onUploadVideo(file);
      if (created) {
        setLastScannedProject(created);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesPlatform = filterPlatform === 'all' || p.platform === filterPlatform;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.fileName.toLowerCase().includes(q) ||
      p.channelName.toLowerCase().includes(q);
    return matchesPlatform && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-primary)]">
      <div className="mx-auto max-w-[1280px] px-6 py-10">
        {/* Header & Actions */}
        <div className="flex flex-col justify-between gap-4 border-b border-[var(--border-hairline)] pb-8 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-xs font-semibold tracking-wider text-[var(--accent-text)]">
              CLIPSY LIBRARY &amp; VIRAL SCANNER
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
              Detect moments. Open directly in 9:16 editor.
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-bold text-[var(--ink-primary)] hover:border-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
              <span>{isUploading ? 'Uploading & scanning...' : 'Upload video file'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('live-clipping')}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-bold text-[var(--ink-primary)] hover:border-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Live extension monitor</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Paste Stream URL Form */}
        <section
          aria-label="Stream URL viral moment scanner"
          className="mt-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6"
        >
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <h2 className="font-display text-base font-bold text-[var(--ink-primary)]">
              Paste a YouTube, Kick, or Twitch link to scan for viral moments
            </h2>
            <span className="font-mono text-xs text-[var(--ink-muted)]">
              yt-dlp + FFmpeg audio peaks + Gemini AI
            </span>
          </div>

          <form onSubmit={handleAnalyzeSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Link2
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
                aria-hidden="true"
              />
              <input
                type="url"
                value={streamUrl}
                onChange={(e) => {
                  setStreamUrl(e.target.value);
                  if (scanError) setScanError(null);
                }}
                aria-label="Stream or VOD URL"
                placeholder="https://www.twitch.tv/videos/... or https://kick.com/... or https://youtube.com/watch?v=..."
                className="h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-canvas)] pr-4 pl-10 text-sm text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isScanning}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 text-xs font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{isScanning ? 'Analyzing stream...' : 'Scan viral moments'}</span>
            </button>
          </form>

          {scanError && (
            <p role="alert" className="mt-2.5 text-xs font-medium text-rose-500">
              {scanError}
            </p>
          )}

          {/* Freshly Scanned Viral Moments Panel */}
          {lastScannedProject && lastScannedProject.viralMoments.length > 0 && (
            <div className="mt-6 border-t border-[var(--border-hairline)] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--ink-primary)]">
                  Detected moments for: {lastScannedProject.title}
                </h3>
                <button
                  type="button"
                  onClick={() => onOpenEditor(lastScannedProject.id)}
                  className="text-xs font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
                >
                  Open full clip in editor →
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                {lastScannedProject.viralMoments.map((moment) => (
                  <div
                    key={moment.id}
                    className="flex flex-col justify-between rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4"
                  >
                    <div>
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="font-semibold text-[var(--accent-text)]">
                          {formatTimecode(moment.startSec)} – {formatTimecode(moment.endSec)}
                        </span>
                        <span className="text-[var(--ink-muted)]">{moment.peakMetric}</span>
                      </div>
                      <div className="mt-2 font-display text-sm font-bold text-[var(--ink-primary)]">
                        {moment.title}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                        {moment.reason}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenEditor(lastScannedProject.id, moment)}
                      className="mt-4 w-full rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2 text-xs font-bold text-[var(--accent-text)] hover:bg-[var(--accent)] hover:text-[var(--accent-fg)] transition-colors cursor-pointer"
                    >
                      Clip &amp; open in editor
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Filter & Search Bar */}
        <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div
            role="group"
            aria-label="Filter clips by platform"
            className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1"
          >
            {(
              [
                { id: 'all', label: 'All clips' },
                { id: 'twitch', label: 'Twitch' },
                { id: 'kick', label: 'Kick' },
                { id: 'youtube', label: 'YouTube' },
                { id: 'upload', label: 'Uploads' },
              ] as const
            ).map((tab) => {
              const active = filterPlatform === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterPlatform(tab.id)}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search clip library"
              placeholder="Search title, channel, or file..."
              className="h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] pr-3 pl-9 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
        </div>

        {/* Library Grid */}
        {filteredProjects.length === 0 ? (
          <div className="mt-10 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-12 text-center">
            <Video className="mx-auto h-8 w-8 text-[var(--ink-muted)]" aria-hidden="true" />
            <h3 className="mt-3 font-display text-lg font-bold text-[var(--ink-primary)]">
              No clips match this filter
            </h3>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Paste a YouTube, Kick, or Twitch URL above or upload a recording to start editing.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => {
              const posterSrc = brokenThumbs[project.id]
                ? PLATFORM_POSTER_FALLBACK[project.platform]
                : project.thumbnailUrl || PLATFORM_POSTER_FALLBACK[project.platform];

              return (
                <article
                  key={project.id}
                  className="flex flex-col justify-between overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
                >
                  <div>
                    <div className="relative aspect-video overflow-hidden border-b border-[var(--border-hairline)] bg-gradient-to-br from-[#122017] to-[#080d0a]">
                      <img
                        src={posterSrc}
                        alt={`${project.title} gaming preview poster`}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenThumbs((prev) => ({ ...prev, [project.id]: true }))
                        }
                        className="h-full w-full object-cover"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                      <div className="absolute right-3 bottom-2.5 left-3 flex items-center justify-between font-mono text-[11px] text-white">
                        <span className="truncate pr-2">{project.fileName}</span>
                        <span className="shrink-0 tabular-nums">
                          {formatTimecode(project.durationSec)}
                        </span>
                      </div>
                    </div>

                    <div className="p-5">
                      <h3 className="font-display text-base font-bold text-[var(--ink-primary)] line-clamp-1">
                        {project.title}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
                        <span className="font-semibold text-[var(--accent-text)]">
                          {PLATFORM_LABEL[project.platform]}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{project.channelName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {project.viralMoments.length} viral{' '}
                          {project.viralMoments.length === 1 ? 'moment' : 'moments'}
                        </span>
                      </div>

                      {project.viralMoments.length > 0 && (
                        <div className="mt-4 space-y-1.5 border-t border-[var(--border-hairline)] pt-3">
                          {project.viralMoments.slice(0, 2).map((vm) => (
                            <button
                              key={vm.id}
                              type="button"
                              onClick={() => onOpenEditor(project.id, vm)}
                              className="flex w-full items-center justify-between rounded bg-[var(--bg-elevated)] px-2.5 py-1.5 text-left text-xs hover:opacity-90 cursor-pointer"
                            >
                              <span className="truncate text-[var(--ink-secondary)]">
                                {vm.title}
                              </span>
                              <span className="ml-2 shrink-0 font-mono text-[11px] font-semibold text-[var(--accent-text)]">
                                {formatTimecode(vm.startSec)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => onOpenEditor(project.id)}
                      className="flex-1 rounded bg-[var(--accent)] py-2 text-xs font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] cursor-pointer"
                    >
                      Open in editor
                    </button>
                    {project.id !== 'demo-clipsy' && project.id !== 'demo-clipfast' && (
                      <button
                        type="button"
                        aria-label={`Delete ${project.title}`}
                        onClick={() => onDeleteProject(project.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border-strong)] text-[var(--ink-muted)] hover:border-rose-500/60 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
