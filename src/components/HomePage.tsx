import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Captions,
  ChevronDown,
  Crop,
  Link2,
  Maximize2,
  Radio,
  Scissors,
  Sparkles,
  UserCircle,
  Volume2,
} from 'lucide-react';
import type { ClipProject, LayoutMode } from '../types/clipfast';
import { parseStreamUrl } from '../utils/editorLogic';
import type { AppRoute } from './Navbar';
import { ClipsyLogo } from './Navbar';

interface HomePageProps {
  onNavigate: (route: AppRoute, projectId?: string) => void;
  onAnalyzeStreamUrl: (url: string) => Promise<ClipProject | null>;
}

const STREAM_FPS_IMG = '/src/assets/images/gaming_stream_fps_1795371872867.jpg';
const FACECAM_IMG = '/src/assets/images/streamer_facecam_react_1795371872614.jpg';
const POSTER_ARENA_IMG = '/src/assets/images/gaming_poster_arena_1795371873067.jpg';
const POSTER_RACING_IMG = '/src/assets/images/gaming_poster_racing_1795371871712.jpg';
const POSTER_SHOWDOWN_IMG = '/src/assets/images/gaming_poster_showdown_1795371872597.jpg';

const FAQ_ITEMS = [
  {
    q: 'How does automatic viral moment detection work?',
    a: 'Paste any YouTube, Kick, or Twitch stream, VOD, or clip URL—or upload a video file. Clipsy inspects stream metadata, platform replay heatmaps, FFmpeg audio energy surges, and Gemini AI hook scoring to pinpoint the exact start and end timestamps worth clipping.',
  },
  {
    q: 'How does the Live Clipping Chrome extension capture moments?',
    a: 'While you watch a live Twitch, Kick, or YouTube stream with chat open, the Clipsy extension tracks the baseline message rate and automatically buffers 60 seconds before and 15 seconds after any sudden chat-velocity spike.',
  },
  {
    q: 'Can I frame gameplay and facecam separately for 9:16?',
    a: 'Yes. The Clipsy editor provides independent draggable and resizable Gameplay and Facecam crop boxes over your 16:9 source, with Split screen, Round facecam, Small facecam, and Fullscreen 9:16 presets.',
  },
  {
    q: 'What quality presets does Export Short support?',
    a: 'Export Short renders real H.264 MP4 vertical 9:16 shorts using FFmpeg in 1080p60 (1080×1920 @ 60fps), 720p60 (720×1280 @ 60fps), or 720p30—complete with your crop framing, timeline trims, captions, and overlays.',
  },
];

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onAnalyzeStreamUrl }) => {
  const [previewLayout, setPreviewLayout] = useState<LayoutMode>('split');
  const [streamUrl, setStreamUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = parseStreamUrl(streamUrl);
    if (!check.valid) {
      setUrlError(check.error || 'Enter a valid YouTube, Kick, or Twitch link.');
      return;
    }
    setUrlError(null);
    setIsScanning(true);
    try {
      const created = await onAnalyzeStreamUrl(streamUrl);
      if (created) {
        onNavigate('library');
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Unable to analyze stream link.');
    } finally {
      setIsScanning(false);
    }
  };

  const layoutLabels: Record<LayoutMode, string> = {
    split: 'Split screen preview · Adjust the crop and facecam position in the editor.',
    'round-facecam': 'Round facecam preview · Circular cam pinned over full-bleed gameplay.',
    'small-facecam': 'Small facecam preview · Corner reaction box over 9:16 gameplay.',
    fullscreen: 'Fullscreen preview · Edge-to-edge 9:16 gameplay crop without cam.',
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-primary)]">
      <main id="main">
        {/* Hero */}
        <section className="mx-auto max-w-[1200px] px-6 pt-16 pb-16">
          <div className="mx-auto max-w-[820px] text-center">
            <h1 className="font-display text-[clamp(2.4rem,5.2vw,4.25rem)] font-extrabold leading-[1.03] tracking-tight text-[var(--ink-primary)] [text-wrap:balance]">
              STREAM CLIPS TO{' '}
              <span className="text-[var(--accent-text)]">TIKTOK &amp; SHORTS.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[640px] text-base leading-relaxed text-[var(--ink-muted)]">
              Turn YouTube, Kick, and Twitch highlights into crisp 1080p60 vertical 9:16 videos. Auto-detect viral spikes, frame your facecam, add captions, and export MP4.
            </p>

            {/* Primary Paste Stream Link Bar */}
            <form
              onSubmit={handleScanSubmit}
              className="mx-auto mt-8 flex max-w-[680px] flex-col gap-2.5 sm:flex-row"
            >
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
                    if (urlError) setUrlError(null);
                  }}
                  aria-label="Paste YouTube, Kick, or Twitch stream URL"
                  placeholder="Paste YouTube, Kick, or Twitch stream / VOD / clip link..."
                  className="h-12 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] pr-4 pl-10 text-sm text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isScanning}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-6 text-sm font-bold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>{isScanning ? 'Scanning stream...' : 'Find viral clips'}</span>
              </button>
            </form>

            {urlError && (
              <p role="alert" className="mt-2 text-xs font-medium text-rose-500">
                {urlError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-[var(--ink-muted)]">
              <span>Try sample link:</span>
              <button
                type="button"
                onClick={() => setStreamUrl('https://www.twitch.tv/videos/2184901234')}
                className="underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--ink-primary)] cursor-pointer"
              >
                Twitch VOD
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setStreamUrl('https://kick.com/xqc/clips/clip_01ABC')}
                className="underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--ink-primary)] cursor-pointer"
              >
                Kick Clip
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setStreamUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw')}
                className="underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--ink-primary)] cursor-pointer"
              >
                YouTube Stream
              </button>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
              <button
                type="button"
                onClick={() => onNavigate('editor', 'demo-clipsy')}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)] cursor-pointer"
              >
                <span>Start editing demo clip</span>
                <ArrowUpRight className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
              </button>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
              >
                <span>See how it works</span>
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-[var(--ink-muted)]">
              <span>YouTube Shorts</span>
              <span aria-hidden="true">·</span>
              <span>Kick &amp; Twitch VODs</span>
              <span aria-hidden="true">·</span>
              <span>1080p60 &amp; 720p60 9:16 MP4</span>
            </div>
          </div>

          {/* Interactive 16:9 -> 9:16 Layout Switcher Stage */}
          <div
            id="layout-preview"
            className="mt-14 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3 font-mono text-[11px] tracking-wider text-[var(--ink-muted)]">
              <span>FROM STREAM TO SHORT</span>
              <span>LAYOUT PREVIEW · 001</span>
            </div>

            <div className="dot-grid-surface grid grid-cols-1 items-center gap-8 px-6 py-8 lg:grid-cols-[1.5fr_auto_0.8fr]">
              {/* 16:9 Source Gaming Stream */}
              <div>
                <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-[var(--ink-muted)]">
                  <span>THE ORIGINAL</span>
                  <span>16:9</span>
                </div>
                <div className="relative aspect-video overflow-hidden rounded border border-[var(--border-strong)] bg-[#0b110d]">
                  <img
                    src={STREAM_FPS_IMG}
                    alt="Tactical FPS competitive esports gameplay stream frame"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" />

                  {/* Gameplay Crop Box */}
                  <div
                    className="absolute top-[8%] left-[22%] h-[82%] w-[44%] border-2 bg-black/5"
                    style={{ borderColor: 'var(--accent)' }}
                  >
                    <span
                      className="inline-block px-1.5 py-0.5 font-mono text-[10px] font-bold"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                    >
                      GAMEPLAY
                    </span>
                  </div>

                  {/* Facecam Crop Box with real streamer portrait */}
                  <div className="absolute bottom-[8%] left-[4%] h-[36%] w-[21%] overflow-hidden border-2 border-white/85 bg-[#121915] shadow-md">
                    <img
                      src={FACECAM_IMG}
                      alt="Streamer headset reaction facecam"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute top-1 left-1 bg-black/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                      FACECAM
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-[var(--ink-muted)]">
                  <span>00:12</span>
                  <div className="grid flex-1 grid-cols-10 gap-1">
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="h-4 rounded-xs border"
                        style={
                          idx === 3
                            ? {
                                backgroundColor: 'var(--accent-soft)',
                                borderColor: 'var(--accent)',
                              }
                            : {
                                backgroundColor: 'var(--bg-elevated)',
                                borderColor: 'var(--border-hairline)',
                              }
                        }
                      />
                    ))}
                  </div>
                  <span>00:30</span>
                </div>
              </div>

              {/* Center Arrow */}
              <div className="flex flex-col items-center gap-2 text-center font-mono text-[11px] text-[var(--ink-muted)]">
                <ArrowRight
                  className="h-5 w-5 rotate-90 lg:rotate-0 text-[var(--accent-text)]"
                  aria-hidden="true"
                />
                <span className="max-w-[84px] leading-tight">MAKE IT VERTICAL</span>
              </div>

              {/* 9:16 Output Preview */}
              <div className="mx-auto w-full max-w-[240px]">
                <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-[var(--accent-text)]">
                  <span>THE NEXT POST</span>
                  <span>9:16</span>
                </div>
                <div
                  className="relative aspect-[9/16] overflow-hidden rounded border-2 bg-[#0b100d]"
                  style={{ borderColor: 'var(--accent)' }}
                >
                  <div
                    className={`relative w-full overflow-hidden bg-[#111914] ${
                      previewLayout === 'split' ? 'h-[56%]' : 'h-full'
                    }`}
                  >
                    <img
                      src={STREAM_FPS_IMG}
                      alt="Vertical 9:16 gameplay crop preview"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover object-center"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                    <div className="absolute inset-x-3 bottom-4 text-center">
                      <span className="font-display text-lg font-extrabold leading-none tracking-tight text-white drop-shadow">
                        ONE MORE{' '}
                      </span>
                      <span
                        className="font-display text-lg font-extrabold leading-none tracking-tight drop-shadow"
                        style={{ color: 'var(--accent)' }}
                      >
                        CLUTCH.
                      </span>
                    </div>
                  </div>

                  {previewLayout === 'split' && (
                    <div className="relative h-[44%] w-full overflow-hidden border-t border-white/15 bg-[#141a17]">
                      <img
                        src={FACECAM_IMG}
                        alt="Split screen streamer facecam preview"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  {previewLayout === 'round-facecam' && (
                    <div
                      className="absolute top-3.5 left-3.5 h-16 w-16 overflow-hidden rounded-full border-2 bg-[#141a17] shadow-lg"
                      style={{ borderColor: 'var(--accent)' }}
                    >
                      <img
                        src={FACECAM_IMG}
                        alt="Circular facecam overlay"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  {previewLayout === 'small-facecam' && (
                    <div
                      className="absolute top-3.5 right-3.5 h-12 w-16 overflow-hidden rounded border-2 bg-[#141a17] shadow-lg"
                      style={{ borderColor: 'var(--accent)' }}
                    >
                      <img
                        src={FACECAM_IMG}
                        alt="Corner facecam overlay"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <div
                    className="absolute right-2.5 bottom-2.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                    style={{ color: 'var(--accent)' }}
                  >
                    9:16
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-mono text-[11px] tracking-wider text-[var(--ink-muted)]">
                CHOOSE YOUR LAYOUT
              </span>
              <div role="group" aria-label="Preview a video layout" className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'split', label: 'Split screen', icon: Crop },
                    { id: 'round-facecam', label: 'Round facecam', icon: UserCircle },
                    { id: 'small-facecam', label: 'Small facecam', icon: Maximize2 },
                    { id: 'fullscreen', label: 'Fullscreen', icon: Maximize2 },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = previewLayout === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPreviewLayout(item.id)}
                      className={`inline-flex items-center gap-2 rounded px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                          : 'border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-5 py-2.5 text-right text-xs text-[var(--ink-muted)]">
              {layoutLabels[previewLayout]}
            </div>
          </div>
        </section>

        {/* 01. How It Works — with lively gaming content posters */}
        <section
          id="how-it-works"
          className="mx-auto max-w-[1200px] border-t border-[var(--border-hairline)] px-6 py-20"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-xs font-semibold tracking-wider text-[var(--accent-text)]">
                01. HOW IT WORKS
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
                From stream link to vertical short in three steps.
              </h2>
            </div>
            <p className="max-w-sm text-sm text-[var(--ink-muted)]">
              Works with YouTube, Kick, Twitch URLs, local MP4 uploads, and live browser monitoring.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] md:grid-cols-3 md:divide-x md:divide-y-0">
            <article className="flex flex-col justify-between bg-[var(--bg-surface)] p-7">
              <div>
                <span className="font-mono text-xs text-[var(--ink-muted)]">01</span>
                <h3 className="mt-3 font-display text-xl font-bold text-[var(--ink-primary)]">
                  Paste link or stream live.
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--ink-muted)]">
                  Drop a Twitch VOD, Kick clip, or YouTube link—or let the Chrome extension auto-save chat spikes as they happen.
                </p>
              </div>
              <div className="relative mt-6 aspect-video overflow-hidden rounded border border-[var(--border-hairline)] bg-[#0b110d]">
                <img
                  src={POSTER_ARENA_IMG}
                  alt="Battle royale squad drop arena poster"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute right-3 bottom-2.5 left-3 flex items-center justify-between text-xs text-white">
                  <span className="font-mono font-semibold">ArenaDrop_VOD.mp4</span>
                  <span className="font-mono text-[#3df07a]">3 spikes</span>
                </div>
              </div>
            </article>

            <article className="flex flex-col justify-between bg-[var(--bg-surface)] p-7">
              <div>
                <span className="font-mono text-xs text-[var(--ink-muted)]">02</span>
                <h3 className="mt-3 font-display text-xl font-bold text-[var(--ink-primary)]">
                  Reframe it vertical.
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--ink-muted)]">
                  Drag independent Gameplay and Facecam boxes over your 16:9 feed, switch layouts, and add timed captions.
                </p>
              </div>
              <div className="relative mt-6 aspect-video overflow-hidden rounded border border-[var(--border-hairline)] bg-[#0b110d]">
                <img
                  src={POSTER_SHOWDOWN_IMG}
                  alt="Hero shooter rooftop showdown game graphic"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute right-3 bottom-2.5 left-3 flex items-center justify-between text-xs text-white">
                  <span className="font-display font-extrabold">CHAT WENT WILD.</span>
                  <span className="font-mono text-[#3df07a]">SPLIT 9:16</span>
                </div>
              </div>
            </article>

            <article className="flex flex-col justify-between bg-[var(--bg-surface)] p-7">
              <div>
                <span className="font-mono text-xs text-[var(--ink-muted)]">03</span>
                <h3 className="mt-3 font-display text-xl font-bold text-[var(--ink-primary)]">
                  Export 1080p60 MP4.
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--ink-muted)]">
                  Render crisp 1080p60 or 720p60 H.264 vertical video with FFmpeg directly from your exact crop boxes and timeline cuts.
                </p>
              </div>
              <div className="relative mt-6 aspect-video overflow-hidden rounded border border-[var(--border-hairline)] bg-[#0b110d]">
                <img
                  src={POSTER_RACING_IMG}
                  alt="GT drift circuit twilight racing game poster"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute right-3 bottom-2.5 left-3 flex items-center justify-between text-xs text-white">
                  <span className="font-mono font-semibold">Clipsy_Short.mp4</span>
                  <span className="font-mono text-[#3df07a]">1080p60</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* 02. Editor Features */}
        <section
          id="features"
          className="mx-auto max-w-[1200px] border-t border-[var(--border-hairline)] px-6 py-20"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-xs font-semibold tracking-wider text-[var(--accent-text)]">
                02. EDITOR FEATURES
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
                Built for stream clippers and short-form editors.
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
            >
              <span>Open clip library</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
            {[
              {
                icon: Scissors,
                label: 'TRIM & SPLIT',
                title: 'Cut setup, keep the reaction.',
                desc: 'Scrub the timeline with frame-accurate timestamps, split clips at the playhead, and export at 1080p60 or 720p60.',
              },
              {
                icon: Captions,
                label: 'AI CAPTIONS',
                title: 'Auto-timed short-form captions.',
                desc: 'Generate punchy vertical captions with highlight words, custom styling presets, and word-level timing.',
              },
              {
                icon: Volume2,
                label: 'AUDIO & SFX',
                title: 'Layer impact audio on the beat.',
                desc: 'Mix source stream audio with boom hits, whooshes, and music tracks directly on the timeline.',
              },
              {
                icon: Radio,
                label: 'LIVE EXTENSION',
                title: 'Auto-clip live Twitch, Kick & YouTube.',
                desc: 'Download the Manifest V3 Chrome extension to watch chat velocity spikes and save 60s before + 15s after.',
              },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <article
                  key={feat.label}
                  className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6"
                >
                  <div className="flex items-center gap-2 font-mono text-xs font-semibold text-[var(--accent-text)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{feat.label}</span>
                  </div>
                  <h3 className="mt-3 font-display text-xl font-bold text-[var(--ink-primary)]">
                    {feat.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">{feat.desc}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* 03. Live Clipping CTA Banner */}
        <section className="mx-auto max-w-[1200px] border-t border-[var(--border-hairline)] px-6 py-16">
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 md:flex-row md:items-center">
            <div>
              <p className="font-mono text-xs font-semibold tracking-wider text-[var(--accent-text)]">
                03. LIVE CLIPPING CHROME EXTENSION
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-[var(--ink-primary)]">
                Never miss a live chat spike on Twitch, Kick, or YouTube.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--ink-muted)]">
                Download the unpacked Clipsy Chrome extension bundle or run the interactive live chat-spike monitor right in your browser.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('live-clipping')}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Explore live clipping</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* 04. FAQ */}
        <section
          id="faq"
          className="mx-auto max-w-[1200px] border-t border-[var(--border-hairline)] px-6 py-20"
        >
          <p className="font-mono text-xs font-semibold tracking-wider text-[var(--accent-text)]">
            04. FAQ
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
            Questions, answered.
          </h2>
          <div className="mt-8 divide-y divide-[var(--border-hairline)] border-y border-[var(--border-hairline)]">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between py-5 text-left text-base font-semibold text-[var(--ink-primary)] hover:text-[var(--accent-text)] cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform ${
                        isOpen ? 'rotate-180 text-[var(--accent-text)]' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <p className="pb-5 text-sm leading-relaxed text-[var(--ink-muted)]">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <ClipsyLogo size={20} />
            <span className="font-display text-sm font-bold text-[var(--ink-primary)]">CLIPSY</span>
            <span className="text-xs text-[var(--ink-muted)]">
              · YouTube, Kick &amp; Twitch 9:16 clip studio
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-[var(--ink-muted)]">
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="hover:text-[var(--ink-primary)] cursor-pointer"
            >
              Clip Library
            </button>
            <button
              type="button"
              onClick={() => onNavigate('live-clipping')}
              className="hover:text-[var(--ink-primary)] cursor-pointer"
            >
              Live Extension
            </button>
            <button
              type="button"
              onClick={() => onNavigate('editor', 'demo-clipsy')}
              className="hover:text-[var(--ink-primary)] cursor-pointer"
            >
              Open Editor
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
