import React from 'react';
import {
  AudioLines,
  Captions,
  LayoutGrid,
  Sparkles,
  Type as TypeIcon,
  Wand2,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  AudioTrackItem,
  CaptionSegment,
  CaptionStylePreset,
  ClipProject,
  EditorToolTab,
  LayoutMode,
  TextOverlay,
  VideoEffect,
  ViralMoment,
} from '../../types/clipsycut';
import { formatPreciseTimecode, formatTimecode } from '../../utils/editorLogic';

interface ToolsSidebarProps {
  activeTab: EditorToolTab;
  onSelectTab: (tab: EditorToolTab) => void;
  project: ClipProject;
  currentTimeSec: number;
  onChangeLayout: (layout: LayoutMode) => void;
  onAddOverlay: () => void;
  onUpdateOverlay: (id: string, patch: Partial<TextOverlay>) => void;
  onDeleteOverlay: (id: string) => void;
  onGenerateCaptions: () => Promise<void>;
  isGeneratingCaptions: boolean;
  onUpdateCaption: (id: string, patch: Partial<CaptionSegment>) => void;
  onChangeCaptionStyle: (style: CaptionStylePreset) => void;
  onAddAudioTrack: (name: string, category: 'sfx' | 'music') => void;
  onDeleteAudioTrack: (id: string) => void;
  onToggleEffect: (type: VideoEffect['type'], label: string) => void;
  onJumpToMoment: (moment: ViralMoment) => void;
}

const RAIL_ITEMS: Array<{
  id: EditorToolTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'layout', label: 'LAYOUT', icon: LayoutGrid },
  { id: 'text', label: 'TEXT', icon: TypeIcon },
  { id: 'captions', label: 'CAPTIONS', icon: Captions },
  { id: 'audio', label: 'AUDIO', icon: AudioLines },
  { id: 'effects', label: 'EFFECTS', icon: Wand2 },
  { id: 'ai-clips', label: 'AI CLIPS', icon: Sparkles },
];

const LAYOUT_CARDS: Array<{
  id: LayoutMode;
  title: string;
  desc: string;
}> = [
  { id: 'split', title: 'Split', desc: 'Two connected sections' },
  { id: 'round-facecam', title: 'Round facecam', desc: 'Gameplay with a circular cam' },
  { id: 'fullscreen', title: 'Fullscreen', desc: 'Full 9:16 gameplay focus' },
  { id: 'small-facecam', title: 'Small facecam', desc: 'Gameplay with corner cam' },
];

const SFX_LIBRARY = [
  { name: 'Boom Impact', category: 'sfx' as const, freq: 90 },
  { name: 'Whoosh Transition', category: 'sfx' as const, freq: 320 },
  { name: 'Hype Riser', category: 'sfx' as const, freq: 520 },
  { name: 'Phonk Beat Bed', category: 'music' as const, freq: 140 },
];

function playPreviewTone(freq: number) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(45, freq * 0.45), ctx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // AudioContext blocked or unavailable
  }
}

export const ToolsSidebar: React.FC<ToolsSidebarProps> = ({
  activeTab,
  onSelectTab,
  project,
  currentTimeSec,
  onChangeLayout,
  onAddOverlay,
  onUpdateOverlay,
  onDeleteOverlay,
  onGenerateCaptions,
  isGeneratingCaptions,
  onUpdateCaption,
  onChangeCaptionStyle,
  onAddAudioTrack,
  onDeleteAudioTrack,
  onToggleEffect,
  onJumpToMoment,
}) => {
  const toolDescriptions: Record<EditorToolTab, string> = {
    layout: 'Choose a layout, then frame Gameplay and Facecam from the source.',
    text: 'Add bold hooks and callouts timed to your vertical edit.',
    captions: 'Generate and edit word-highlighted captions for silent viewers.',
    audio: 'Layer sound effects and background music onto the timeline.',
    effects: 'Add timed punch zooms, screen shake, and flashes on impact.',
    'ai-clips': 'Jump directly to AI-detected viral spikes and clutch moments.',
  };

  const renderLayoutDiagram = (id: LayoutMode, active: boolean) => {
    const stroke = active ? 'var(--accent-fg)' : 'var(--ink-muted)';
    const fill = active ? 'var(--accent-fg)' : 'var(--bg-elevated)';
    return (
      <div
        className={`mx-auto mb-3 flex h-14 w-9 flex-col items-center justify-center rounded-xs border relative overflow-hidden ${
          active
            ? 'border-[var(--accent-fg)]/40 bg-[var(--accent-fg)]/10'
            : 'border-[var(--border-strong)] bg-[var(--bg-canvas)]'
        }`}
      >
        {id === 'split' && (
          <>
            <div className="h-1/2 w-full border-b" style={{ borderColor: stroke, background: fill }} />
            <div className="h-1/2 w-full opacity-55" style={{ background: fill }} />
          </>
        )}
        {id === 'round-facecam' && (
          <div
            className="absolute top-1.5 left-1.5 h-3.5 w-3.5 rounded-full border"
            style={{
              borderColor: active ? 'var(--accent-fg)' : 'var(--accent)',
              background: active ? 'var(--accent-fg)' : 'var(--accent)',
            }}
          />
        )}
        {id === 'small-facecam' && (
          <div
            className="absolute top-1.5 right-1.5 h-2.5 w-3.5 border"
            style={{
              borderColor: active ? 'var(--accent-fg)' : 'var(--accent)',
              background: active ? 'var(--accent-fg)' : 'var(--accent)',
            }}
          />
        )}
      </div>
    );
  };

  return (
    <aside className="flex h-full shrink-0 border-l border-[var(--border-hairline)] bg-[var(--bg-surface)]">
      {/* Active Tool Drawer */}
      <div className="flex w-[320px] flex-col overflow-y-auto p-5">
        <div className="border-b border-[var(--border-hairline)] pb-4">
          <div className="font-mono text-[11px] font-bold tracking-wider text-[var(--accent-text)]">
            CLIPSYCUT TOOLS
          </div>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[var(--ink-primary)] uppercase">
            {activeTab === 'ai-clips' ? 'AI CLIPS' : activeTab}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">
            {toolDescriptions[activeTab]}
          </p>
        </div>

        <div className="mt-5 flex-1">
          {activeTab === 'layout' && (
            <div className="grid grid-cols-2 gap-3">
              {LAYOUT_CARDS.map((card) => {
                const active = project.layout === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChangeLayout(card.id)}
                    className={`flex flex-col items-start rounded-md border p-3.5 text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--ink-primary)] hover:border-[var(--accent)]'
                    }`}
                  >
                    {renderLayoutDiagram(card.id, active)}
                    <div className="font-display text-sm font-bold">{card.title}</div>
                    <div
                      className={`mt-1 text-[11px] leading-snug ${
                        active ? 'opacity-90 font-medium' : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      {card.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'text' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={onAddOverlay}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-xs font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add text overlay at {formatTimecode(currentTimeSec)}</span>
              </button>

              {project.overlays.length === 0 ? (
                <p className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4 text-xs text-[var(--ink-muted)]">
                  No text overlays yet. Add a hook title or callout above.
                </p>
              ) : (
                <div className="space-y-3">
                  {project.overlays.map((ov) => (
                    <div
                      key={ov.id}
                      className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-3 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={ov.text}
                          aria-label="Overlay text"
                          onChange={(e) => onUpdateOverlay(ov.id, { text: e.target.value })}
                          className="w-full rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)] focus:border-[var(--accent)] focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Delete overlay"
                          onClick={() => onDeleteOverlay(ov.id)}
                          className="rounded p-1.5 text-[var(--ink-muted)] hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                        <label className="text-[var(--ink-muted)]">
                          Y Pos (%)
                          <input
                            type="number"
                            min={10}
                            max={90}
                            value={ov.yPercent}
                            onChange={(e) =>
                              onUpdateOverlay(ov.id, { yPercent: Number(e.target.value) })
                            }
                            className="mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 text-[var(--ink-primary)]"
                          />
                        </label>
                        <label className="text-[var(--ink-muted)]">
                          Size (px)
                          <input
                            type="number"
                            min={18}
                            max={64}
                            value={ov.fontSize}
                            onChange={(e) =>
                              onUpdateOverlay(ov.id, { fontSize: Number(e.target.value) })
                            }
                            className="mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 text-[var(--ink-primary)]"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'captions' && (
            <div className="space-y-4">
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-3">
                <div className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-wider text-[var(--ink-muted)]">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] text-[var(--accent-fg)]">
                    1
                  </span>
                  MAKE CAPTIONS
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-secondary)]">
                  One click adds timed text to the whole clip. You can edit every
                  line afterwards.
                </p>
                <button
                  type="button"
                  disabled={isGeneratingCaptions}
                  onClick={onGenerateCaptions}
                  className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-xs font-bold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isGeneratingCaptions
                      ? 'Writing captions…'
                      : project.captions.length > 0
                        ? 'Regenerate captions'
                        : 'Generate captions'}
                  </span>
                </button>
              </div>

              <div>
                <div className="font-mono text-[10px] font-semibold text-[var(--ink-muted)]">
                  2. PICK A STYLE
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'bold-highlight', label: 'Highlight' },
                      { id: 'clean-box', label: 'Clean Box' },
                      { id: 'minimal-stroke', label: 'Stroke' },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onChangeCaptionStyle(preset.id)}
                      className={`rounded py-1.5 text-[11px] font-semibold cursor-pointer ${
                        project.captionStyle === preset.id
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                          : 'border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--ink-secondary)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="font-mono text-[10px] font-semibold text-[var(--ink-muted)]">
                    3. EDIT YOUR LINES
                  </div>
                  {project.captions.length > 0 && (
                    <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                      {project.captions.length} line
                      {project.captions.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                {project.captions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-4 text-center">
                    <Captions
                      className="mx-auto h-5 w-5 text-[var(--ink-muted)]"
                      aria-hidden="true"
                    />
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-muted)]">
                      No captions yet. Click <strong>Generate captions</strong> above
                      and they will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {project.captions.map((cap) => (
                      <div
                        key={cap.id}
                        className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-2.5"
                      >
                        <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-[var(--accent-text)]">
                          <span>
                            {formatTimecode(cap.startSec)} – {formatTimecode(cap.endSec)}
                          </span>
                          {cap.highlightWord && (
                            <span>HIGHLIGHT: {cap.highlightWord}</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={cap.text}
                          aria-label="Caption line text"
                          onChange={(e) =>
                            onUpdateCaption(cap.id, { text: e.target.value })
                          }
                          className="w-full rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--ink-primary)] focus:border-[var(--accent)] focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div className="font-mono text-[11px] font-semibold text-[var(--ink-muted)]">
                SFX &amp; MUSIC CLIPS
              </div>
              <div className="space-y-2">
                {SFX_LIBRARY.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 py-2.5"
                  >
                    <div>
                      <div className="text-xs font-bold text-[var(--ink-primary)]">{item.name}</div>
                      <div className="font-mono text-[10px] text-[var(--ink-muted)] uppercase">
                        {item.category}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        playPreviewTone(item.freq);
                        onAddAudioTrack(item.name, item.category);
                      }}
                      className="rounded bg-[var(--accent-soft)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent-text)] hover:bg-[var(--accent)] hover:text-[var(--accent-fg)] cursor-pointer transition-colors"
                    >
                      + Add at {formatTimecode(currentTimeSec)}
                    </button>
                  </div>
                ))}
              </div>

              {project.audioTracks.length > 0 && (
                <div className="border-t border-[var(--border-hairline)] pt-3">
                  <div className="mb-2 font-mono text-[10px] text-[var(--ink-muted)]">
                    ACTIVE AUDIO TRACKS
                  </div>
                  <div className="space-y-1.5">
                    {project.audioTracks.map((tr: AudioTrackItem) => (
                      <div
                        key={tr.id}
                        className="flex items-center justify-between rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs"
                      >
                        <span className="text-[var(--ink-primary)]">
                          {tr.name} · {formatTimecode(tr.startSec)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${tr.name}`}
                          onClick={() => onDeleteAudioTrack(tr.id)}
                          className="text-[var(--ink-muted)] hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'effects' && (
            <div className="space-y-2.5">
              {(
                [
                  { type: 'punch-zoom', label: 'Punch Zoom (1.12x)' },
                  { type: 'screen-shake', label: 'Screen Shake' },
                  { type: 'impact-flash', label: 'Impact Flash' },
                  { type: 'vignette', label: 'Cinema Vignette' },
                ] as const
              ).map((fx) => {
                const active = project.effects.some((e) => e.type === fx.type);
                return (
                  <button
                    key={fx.type}
                    type="button"
                    onClick={() => onToggleEffect(fx.type, fx.label)}
                    className={`flex w-full items-center justify-between rounded-md border px-3.5 py-3 text-left text-xs font-bold cursor-pointer transition-colors ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--ink-primary)] hover:border-[var(--accent)]'
                    }`}
                  >
                    <span>{fx.label}</span>
                    <span className="font-mono text-[10px]">
                      {active ? 'ACTIVE' : 'APPLY'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'ai-clips' && (
            <div className="space-y-3">
              {project.viralMoments.length === 0 ? (
                <p className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4 text-xs text-[var(--ink-muted)]">
                  No viral moments scanned for this clip yet. Paste a stream URL in the Library to detect spikes.
                </p>
              ) : (
                project.viralMoments.map((vm) => {
                  const isActive = vm.id === (project.selectedMomentId || project.viralMoments[0]?.id);
                  return (
                    <div
                      key={vm.id}
                      className={`rounded-md border p-3.5 transition-colors ${
                        isActive
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-elevated)]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-bold text-[var(--accent-text)]">
                          {formatPreciseTimecode(vm.startSec)} – {formatPreciseTimecode(vm.endSec)}
                        </span>
                        <span className="text-[var(--ink-muted)]">{vm.peakMetric}</span>
                      </div>
                      <div className="mt-1.5 text-xs font-bold text-[var(--ink-primary)]">{vm.title}</div>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-muted)]">
                        {vm.reason}
                      </p>
                      <button
                        type="button"
                        onClick={() => onJumpToMoment(vm)}
                        className="mt-3 w-full rounded bg-[var(--accent)]/15 py-1.5 text-[11px] font-bold text-[var(--accent-text)] hover:bg-[var(--accent)] hover:text-[var(--accent-fg)] cursor-pointer transition-colors"
                      >
                        {isActive ? 'Active in range slider' : 'Jump & frame moment'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Far-Right Vertical Tool Rail */}
      <nav
        aria-label="Editor tools"
        className="flex w-[72px] shrink-0 flex-col border-l border-[var(--border-hairline)] bg-[var(--bg-canvas)]"
      >
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1.5 border-b border-[var(--border-hairline)] py-4 px-1 text-[10px] font-mono font-bold tracking-wider transition-colors cursor-pointer ${
                active
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                  : 'text-[var(--ink-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
