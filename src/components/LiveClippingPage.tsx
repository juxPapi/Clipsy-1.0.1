import React, { useEffect, useState } from 'react';
import {
  Activity,
  Download,
  ExternalLink,
  Flame,
  Play,
  Square,
  Zap,
} from 'lucide-react';
import type { ClipProject, Platform } from '../types/clipfast';
import { computeChatSpikeScore } from '../utils/editorLogic';
import type { AppRoute } from './Navbar';

interface LiveClippingPageProps {
  onCaptureSaved: (project: ClipProject) => void;
  onOpenEditor: (projectId: string) => void;
  onNavigate: (route: AppRoute) => void;
}

interface ExtensionFile {
  name: string;
  content: string;
}

export const LiveClippingPage: React.FC<LiveClippingPageProps> = ({
  onCaptureSaved,
  onOpenEditor,
  onNavigate,
}) => {
  const [platform, setPlatform] = useState<'twitch' | 'kick' | 'youtube'>('twitch');
  const [channelUrl, setChannelUrl] = useState('https://www.twitch.tv/mackjr_live');
  const [monitoring, setMonitoring] = useState(false);
  const [currentRate, setCurrentRate] = useState(32);
  const [baselineRate] = useState(34);
  const [captures, setCaptures] = useState<ClipProject[]>([]);
  const [extFiles, setExtFiles] = useState<ExtensionFile[]>([]);
  const [selectedFile, setSelectedFile] = useState('manifest.json');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/extension/files')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.files)) setExtFiles(d.files);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!monitoring) return;
    const id = window.setInterval(() => {
      setCurrentRate((prev) => {
        const jitter = Math.round((Math.random() - 0.45) * 14);
        return Math.max(18, Math.min(220, prev + jitter));
      });
    }, 1500);
    return () => window.clearInterval(id);
  }, [monitoring]);

  const spikeInfo = computeChatSpikeScore(currentRate, baselineRate);

  const triggerSpikeCapture = async (spikeRate = 138) => {
    setCurrentRate(spikeRate);
    setStatusMessage('Chat spike detected — buffering 60s before + 15s after into Library...');
    try {
      const res = await fetch('/api/extension/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platform as Platform,
          title: `${platform.toUpperCase()} Live Chat Spike`,
          sourceUrl: channelUrl,
          ratePerMin: spikeRate,
          baseline: baselineRate,
          channelName: channelUrl.split('/').filter(Boolean).pop() || 'LiveStream',
        }),
      });
      const data = await res.json();
      if (data.ok && data.project) {
        onCaptureSaved(data.project);
        setCaptures((prev) => [data.project, ...prev]);
        setStatusMessage(`Saved "${data.project.title}" to your Clipsy Library.`);
      }
    } catch {
      setStatusMessage('Failed to save live capture.');
    }
  };

  const activeFileContent =
    extFiles.find((f) => f.name === selectedFile)?.content || '// Loading extension source...';

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-primary)]">
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        {/* Header */}
        <div className="flex flex-col justify-between gap-6 border-b border-[var(--border-hairline)] pb-8 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-xs font-semibold tracking-wider text-[var(--accent-text)]">
              CLIPSY CHROME EXTENSION · TWITCH, KICK &amp; YOUTUBE
            </p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-[var(--ink-primary)]">
              Catch chat spikes while the stream is live.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">
              Install the Clipsy Manifest V3 browser extension to monitor live chat velocity across Twitch, Kick, and YouTube, or test live auto-clipping right here.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 shrink-0">
            <a
              href="/api/extension/download"
              download="clipsy-chrome-extension.tar.gz"
              className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-5 py-2.5 text-xs font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Download Chrome extension (.tar.gz)</span>
            </a>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)] cursor-pointer"
            >
              <span>View clip library</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Interactive Live Chat-Spike Monitor & Extension Code */}
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs font-semibold text-[var(--accent-text)]">
                <Activity className="h-4 w-4" aria-hidden="true" />
                <span>LIVE EXTENSION MONITOR</span>
              </div>
              <span className="font-mono text-xs text-[var(--ink-muted)]">
                {monitoring ? 'WATCHING CHAT' : 'IDLE'}
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block font-mono text-[11px] text-[var(--ink-muted)]">
                  TARGET STREAM PLATFORM
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(['twitch', 'kick', 'youtube'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPlatform(p);
                        if (p === 'twitch') setChannelUrl('https://www.twitch.tv/mackjr_live');
                        if (p === 'kick') setChannelUrl('https://kick.com/xqc');
                        if (p === 'youtube') setChannelUrl('https://www.youtube.com/@StreamClips/live');
                      }}
                      className={`rounded py-2 text-xs font-bold capitalize cursor-pointer ${
                        platform === p
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                          : 'border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--ink-secondary)]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="live-stream-url" className="block font-mono text-[11px] text-[var(--ink-muted)]">
                  LIVE STREAM URL
                </label>
                <input
                  id="live-stream-url"
                  type="url"
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 text-sm text-[var(--ink-primary)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              {/* Velocity Meter */}
              <div className="rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--ink-muted)]">Live chat velocity</span>
                  <span className="font-mono font-bold text-[var(--ink-primary)] tabular-nums">
                    {currentRate} msg/min ({spikeInfo.ratio}x baseline)
                  </span>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--border-hairline)]">
                  <div
                    className="h-full transition-all duration-200"
                    style={{
                      width: `${Math.min(100, (currentRate / 180) * 100)}%`,
                      backgroundColor: spikeInfo.isSpike ? 'var(--accent)' : 'var(--ink-muted)',
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--ink-muted)]">
                  <span>Baseline: {baselineRate}/min</span>
                  <span>Spike trigger: 2.2x ({Math.round(baselineRate * 2.2)}/min)</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setMonitoring((m) => !m)}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 text-xs font-bold cursor-pointer ${
                    monitoring
                      ? 'border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                      : 'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]'
                  }`}
                >
                  {monitoring ? (
                    <>
                      <Square className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Stop monitoring</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Start auto clipping</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => triggerSpikeCapture(148)}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--ink-primary)] hover:border-[var(--accent)] cursor-pointer"
                >
                  <Zap className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>Simulate chat spike</span>
                </button>
              </div>

              {statusMessage && (
                <p
                  className="rounded border px-3 py-2 text-xs text-[var(--accent-text)]"
                  style={{
                    borderColor: 'var(--accent)',
                    backgroundColor: 'var(--accent-soft)',
                  }}
                >
                  {statusMessage}
                </p>
              )}

              {captures.length > 0 && (
                <div className="border-t border-[var(--border-hairline)] pt-4">
                  <h3 className="font-mono text-[11px] font-semibold text-[var(--ink-muted)]">
                    RECENT CAPTURED MOMENTS ({captures.length})
                  </h3>
                  <div className="mt-2.5 space-y-2">
                    {captures.map((cap) => (
                      <div
                        key={cap.id}
                        className="flex items-center justify-between rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Flame className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                          <span className="font-semibold text-[var(--ink-primary)]">{cap.title}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenEditor(cap.id)}
                          className="font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
                        >
                          Open in editor →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Manifest V3 Source Code & Sideload Guide */}
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
            <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
              Included Clipsy Chrome Extension (Manifest V3)
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">
              Download the archive, extract it, open <span className="font-mono text-[var(--ink-primary)]">chrome://extensions</span>, enable Developer Mode, and click <strong className="text-[var(--ink-primary)]">Load unpacked</strong>.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5 border-b border-[var(--border-hairline)] pb-3">
              {['manifest.json', 'content.js', 'popup.html', 'popup.js'].map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedFile(name)}
                  className={`rounded px-2.5 py-1 font-mono text-[11px] cursor-pointer ${
                    selectedFile === name
                      ? 'bg-[var(--accent)] font-bold text-[var(--accent-fg)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>

            <pre className="mt-3 max-h-[320px] overflow-auto rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5 font-mono text-[11px] leading-relaxed text-[var(--ink-secondary)]">
              <code>{activeFileContent}</code>
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
};
