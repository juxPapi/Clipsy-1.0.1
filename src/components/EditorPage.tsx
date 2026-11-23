import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import type {
  AccentPaletteId,
  CaptionSegment,
  CaptionStylePreset,
  ClipProject,
  CropRect,
  EditorToolTab,
  ExportPreset,
  LayoutMode,
  TextOverlay,
  ThemeMode,
  VideoEffect,
  ViralMoment,
} from '../types/clipsycut';
import {
  DEFAULT_FACECAM_CROP,
  DEFAULT_GAMEPLAY_CROP,
  deleteSegmentById,
  getAccentPalette,
  getTimelineTotalDuration,
  mapTimelineToSourceTime,
  resolveExportSpec,
  splitSegmentAtTime,
} from '../utils/editorLogic';
import { ClipsyCutLogo } from './Navbar';
import type { AppRoute } from './Navbar';
import { ThemeControl } from './ThemeControl';
import { ExportProgressOverlay } from './editor/ExportProgressOverlay';
import { FinalShortStage } from './editor/FinalShortStage';
import { MomentRangeSlider } from './editor/MomentRangeSlider';
import { SourceFramingStage } from './editor/SourceFramingStage';
import { TimelineDock } from './editor/TimelineDock';
import { ToolsSidebar } from './editor/ToolsSidebar';
import { useHlsVideo } from '../hooks/useHlsVideo';

interface EditorPageProps {
  project: ClipProject;
  onUpdateProject: (updated: ClipProject) => void;
  onSaveProject: (project: ClipProject) => Promise<void>;
  onUploadVideo: (file: File) => Promise<ClipProject | null>;
  onRepairMedia?: (projectId: string) => Promise<ClipProject | null>;
  onNavigate: (route: AppRoute) => void;
  theme: ThemeMode;
  accent: AccentPaletteId;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeAccent: (accent: AccentPaletteId) => void;
}

export const EditorPage: React.FC<EditorPageProps> = ({
  project,
  onUpdateProject,
  onSaveProject,
  onUploadVideo,
  onRepairMedia,
  onNavigate,
  theme,
  accent,
  onChangeTheme,
  onChangeAccent,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<EditorToolTab>('layout');
  const [exportPreset, setExportPreset] = useState<ExportPreset>('1080p60');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState(
    project.segments[0]?.id || 'seg-1'
  );
  const [zoomPercent, setZoomPercent] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isSaved, setIsSaved] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isMediaLoading, setIsMediaLoading] = useState(Boolean(project.videoUrl));
  const [isRepairingMedia, setIsRepairingMedia] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportOverlayOpen, setExportOverlayOpen] = useState(false);
  const [exportElapsedMs, setExportElapsedMs] = useState(0);
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);
  const [exportFileName, setExportFileName] = useState<string | null>(null);
  const [exportSizeBytes, setExportSizeBytes] = useState<number | null>(null);
  const [exportedLabel, setExportedLabel] = useState<string>('1080p60');
  const [exportError, setExportError] = useState<string | null>(null);
  const exportTimerRef = useRef<number | null>(null);

  const stopExportTimer = () => {
    if (exportTimerRef.current !== null) {
      window.clearInterval(exportTimerRef.current);
      exportTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (exportTimerRef.current !== null) {
        window.clearInterval(exportTimerRef.current);
      }
    };
  }, []);

  const accentPalette = getAccentPalette(accent);
  const exportSpec = resolveExportSpec(exportPreset);
  const hasSourceVideo = Boolean(project.videoUrl && project.videoUrl.trim());
  const hlsError = useHlsVideo(videoRef, hasSourceVideo ? project.videoUrl : undefined);
  const playbackError = hlsError || mediaError;

  useEffect(() => {
    setMediaError(null);
    setIsMediaLoading(Boolean(project.videoUrl));
  }, [project.id, project.videoUrl]);

  const firstSegStart = project.segments[0]?.sourceStartSec ?? 0;
  const firstSegId = project.segments[0]?.id || 'seg-1';
  const lastSegEnd =
    project.segments[project.segments.length - 1]?.sourceEndSec ??
    (project.durationSec || 54);

  useEffect(() => {
    setSelectedSegmentId(firstSegId);
    setCurrentTimeSec(0);
    setIsPlaying(false);
    if (videoRef.current && videoRef.current.readyState >= 1) {
      videoRef.current.pause();
      videoRef.current.currentTime = firstSegStart;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.selectedMomentId]);

  const mutateProject = (patch: Partial<ClipProject>) => {
    setIsSaved(false);
    const next = { ...project, ...patch };
    onUpdateProject(next);
  };

  const handleManualSave = async () => {
    await onSaveProject(project);
    setIsSaved(true);
  };

  const handleTogglePlay = async () => {
    const video = videoRef.current;
    if (!video || !hasSourceVideo) return;
    if (video.paused) {
      if (video.currentTime < firstSegStart || video.currentTime >= lastSegEnd - 0.1) {
        video.currentTime = firstSegStart;
        setCurrentTimeSec(0);
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

  const handleSeek = (timelineSec: number) => {
    setCurrentTimeSec(timelineSec);
    const video = videoRef.current;
    if (video) {
      const mapped = mapTimelineToSourceTime(project.segments, timelineSec);
      video.currentTime = mapped.sourceTimeSec;
      if (mapped.activeSegmentId) setSelectedSegmentId(mapped.activeSegmentId);
    }
  };

  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setIsMediaLoading(false);
    setMediaError(null);
    video.currentTime = firstSegStart;
  };

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const total = getTimelineTotalDuration(project.segments);
    if (!video.paused && video.currentTime >= lastSegEnd - 0.05) {
      video.pause();
      video.currentTime = firstSegStart;
      setIsPlaying(false);
      setCurrentTimeSec(0);
      return;
    }
    const rel = Math.max(0, Math.min(total, video.currentTime - firstSegStart));
    setCurrentTimeSec(rel);
  };

  const handleResetFraming = () => {
    mutateProject({
      gameplayCrop: { ...DEFAULT_GAMEPLAY_CROP },
      facecamCrop: { ...DEFAULT_FACECAM_CROP },
    });
  };

  const handleAddOverlay = () => {
    const newOverlay: TextOverlay = {
      id: `ov-${Date.now().toString(36)}`,
      text: 'CHAT WENT WILD',
      startSec: Number(currentTimeSec.toFixed(1)),
      endSec: Number(
        Math.min(getTimelineTotalDuration(project.segments), currentTimeSec + 5).toFixed(1)
      ),
      xPercent: 50,
      yPercent: 45,
      fontSize: 38,
      color: '#ffffff',
      bgColor: 'rgba(5,7,6,0.75)',
    };
    mutateProject({ overlays: [...project.overlays, newOverlay] });
    setActiveTab('text');
  };

  const handleSplit = () => {
    const nextSegments = splitSegmentAtTime(project.segments, currentTimeSec);
    if (nextSegments.length !== project.segments.length) {
      mutateProject({ segments: nextSegments });
      // Splitting replaces the original segment id; keep selection valid so
      // Delete / split actions on the newly selected piece keep working.
      if (!nextSegments.some((s) => s.id === selectedSegmentId)) {
        setSelectedSegmentId(nextSegments[0].id);
      }
    }
  };

  const handleDeleteSegment = () => {
    const nextSegments = deleteSegmentById(project.segments, selectedSegmentId);
    if (nextSegments.length !== project.segments.length) {
      mutateProject({ segments: nextSegments });
      setSelectedSegmentId(nextSegments[0].id);
      setCurrentTimeSec(0);
    }
  };

  const handleGenerateCaptions = async () => {
    setIsGeneratingCaptions(true);
    setExportError(null);
    try {
      const res = await fetch('/api/captions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: project.title,
          platform: project.platform,
          durationSec: getTimelineTotalDuration(project.segments),
          hookContext: project.viralMoments[0]?.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExportError(data.error || 'Caption generation failed.');
      } else if (Array.isArray(data.captions)) {
        mutateProject({ captions: data.captions });
      }
    } catch {
      setExportError('Failed to reach caption generator.');
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setExportError(null);
    try {
      await onUploadVideo(file);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRepairMedia = async () => {
    if (!onRepairMedia || isRepairingMedia) return;
    setIsRepairingMedia(true);
    setMediaError(null);
    setIsMediaLoading(true);
    try {
      const repaired = await onRepairMedia(project.id);
      if (!repaired) {
        setMediaError('Repair failed. Upload a local recording instead.');
        setIsMediaLoading(false);
        return;
      }
      onUpdateProject(repaired);
      const video = videoRef.current;
      if (video) {
        video.load();
      }
    } catch {
      setMediaError('Repair failed. Upload a local recording instead.');
      setIsMediaLoading(false);
    } finally {
      setIsRepairingMedia(false);
    }
  };

  const handleVideoError = () => {
    setMediaError(
      'This video could not be loaded. The stream link may have expired, or the file may be incomplete.'
    );
    setIsMediaLoading(false);
    setIsPlaying(false);
  };

  const handleExportShort = async () => {
    if (!hasSourceVideo) {
      setExportError('No source video loaded. Scan a stream with media access or upload a video first.');
      return;
    }
    stopExportTimer();
    setIsExporting(true);
    setExportOverlayOpen(true);
    setExportElapsedMs(0);
    setExportError(null);
    setExportDownloadUrl(null);
    setExportFileName(null);
    setExportSizeBytes(null);

    const startedAt = Date.now();
    exportTimerRef.current = window.setInterval(() => {
      setExportElapsedMs(Date.now() - startedAt);
    }, 80);

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: project.videoUrl,
          layout: project.layout,
          gameplayCrop: project.gameplayCrop,
          facecamCrop: project.facecamCrop,
          segments: project.segments,
          overlays: project.overlays,
          captions: project.captions,
          masterVolume: isMuted ? 0 : project.masterVolume,
          exportPreset,
          accentHex: accentPalette.swatchHex,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExportError(data.error || 'Export failed.');
      } else if (data.downloadUrl) {
        setExportDownloadUrl(data.downloadUrl);
        setExportFileName(data.fileName || `ClipsyCut-short-${exportPreset}.mp4`);
        setExportSizeBytes(typeof data.sizeBytes === 'number' ? data.sizeBytes : null);
        setExportedLabel(`${exportSpec.label} (${exportSpec.width}×${exportSpec.height} · ${exportSpec.fps}fps)`);
        mutateProject({ status: 'exported' });
      }
    } catch {
      setExportError('Export request failed.');
    } finally {
      stopExportTimer();
      setIsExporting(false);
    }
  };

  const handleJumpToMoment = (moment: ViralMoment) => {
    const segId = `seg-${moment.id}`;
    mutateProject({
      segments: [
        {
          id: segId,
          label: moment.title,
          sourceStartSec: moment.startSec,
          sourceEndSec: moment.endSec,
        },
      ],
      selectedMomentId: moment.id,
    });
    setSelectedSegmentId(segId);
    setCurrentTimeSec(0);
    if (videoRef.current) {
      videoRef.current.currentTime = moment.startSec;
    }
  };

  const activeMoment =
    project.viralMoments.find((m) => m.id === project.selectedMomentId) ||
    project.viralMoments[0];

  const sourceTotalDur = Math.max(1, project.durationSec || 54);
  const segStart = project.segments[0]?.sourceStartSec ?? 0;
  const segEnd =
    project.segments[project.segments.length - 1]?.sourceEndSec ?? sourceTotalDur;
  const isFullSource =
    project.segments.length === 1 &&
    segStart <= 0.05 &&
    segEnd >= sourceTotalDur - 0.1;

  const activeRangeStart = activeMoment ? activeMoment.startSec : segStart;
  const activeRangeEnd = activeMoment ? activeMoment.endSec : segEnd;
  const currentSourceSec = mapTimelineToSourceTime(
    project.segments,
    currentTimeSec
  ).sourceTimeSec;

  const handleSelectMomentById = (momentId: string) => {
    const found = project.viralMoments.find((m) => m.id === momentId);
    if (found) {
      handleJumpToMoment(found);
    }
  };

  const handleChangeMomentRange = (
    nextStart: number,
    nextEnd: number,
    previewSec?: number
  ) => {
    const segId = activeMoment ? `seg-${activeMoment.id}` : 'seg-1';
    const segLabel = activeMoment
      ? activeMoment.title
      : project.segments[0]?.label || 'Master clip';

    const updatedMoments = activeMoment
      ? project.viralMoments.map((m) =>
          m.id === activeMoment.id
            ? { ...m, startSec: nextStart, endSec: nextEnd }
            : m
        )
      : project.viralMoments;

    mutateProject({
      viralMoments: updatedMoments,
      selectedMomentId: activeMoment?.id ?? project.selectedMomentId,
      segments: [
        {
          id: segId,
          label: segLabel,
          sourceStartSec: nextStart,
          sourceEndSec: nextEnd,
        },
      ],
    });
    setSelectedSegmentId(segId);

    const targetSourceSec = previewSec ?? nextStart;
    setCurrentTimeSec(
      Math.max(0, Math.min(nextEnd - nextStart, targetSourceSec - nextStart))
    );
    if (videoRef.current) {
      videoRef.current.currentTime = targetSourceSec;
    }
  };

  const handleResetToFullSource = () => {
    mutateProject({
      segments: [
        {
          id: 'seg-1',
          label: 'Master clip',
          sourceStartSec: 0,
          sourceEndSec: sourceTotalDur,
        },
      ],
    });
    setSelectedSegmentId('seg-1');
    setCurrentTimeSec(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--ink-primary)]">
      {/* Editor Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ClipsyCutLogo size={22} />
          <span className="font-display text-base font-extrabold tracking-tight text-[var(--ink-primary)]">
            CLIPSYCUT
          </span>
        </button>

        {/* Center Project Breadcrumb */}
        <div className="hidden lg:flex items-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs">
          <button
            type="button"
            onClick={() => onNavigate('library')}
            className="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            Projects
          </button>
          <span className="text-[var(--ink-muted)]">/</span>
          <span className="max-w-[180px] truncate font-semibold text-[var(--ink-primary)]">
            {project.fileName}
          </span>
          <button
            type="button"
            onClick={handleManualSave}
            className="ml-1 inline-flex items-center gap-1 rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--ink-secondary)] hover:border-[var(--accent)] cursor-pointer"
          >
            <Check className="h-3 w-3 text-[var(--accent-text)]" aria-hidden="true" />
            <span>{isSaved ? 'SAVED' : 'SAVE'}</span>
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <ThemeControl
            theme={theme}
            accent={accent}
            onChangeTheme={onChangeTheme}
            onChangeAccent={onChangeAccent}
            compact
          />

          <input
            ref={uploadInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleUploadFile}
          />

          <button
            type="button"
            onClick={() => setActiveTab('ai-clips')}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 font-mono text-[11px] font-bold tracking-wider whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'ai-clips'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                : 'border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--ink-primary)] hover:border-[var(--accent)]'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
            <span>AI CLIPS</span>
          </button>

          <button
            type="button"
            disabled={isUploading}
            onClick={() => uploadInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 font-mono text-[11px] font-bold tracking-wider text-[var(--ink-primary)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isUploading ? 'UPLOADING...' : 'UPLOAD VIDEO'}</span>
          </button>

          {/* 1080p60 / 720p60 / 720p30 Export Preset Selector */}
          <select
            aria-label="Export quality"
            value={exportPreset}
            onChange={(e) => setExportPreset(e.target.value as ExportPreset)}
            className="h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 font-mono text-[11px] font-bold text-[var(--ink-primary)] focus:border-[var(--accent)] focus:outline-none cursor-pointer"
          >
            <option value="1080p60">1080p60 (1080×1920)</option>
            <option value="720p60">720p60 (720×1280)</option>
            <option value="720p30">720p30 (720×1280)</option>
          </select>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportShort}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 font-mono text-[11px] font-bold tracking-wider text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            <span>{isExporting ? `EXPORTING ${exportPreset.toUpperCase()}...` : 'EXPORT SHORT'}</span>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Export / Status Banner if overlay was dismissed in background */}
      {!exportOverlayOpen && (exportDownloadUrl || exportError) && (
        <div
          className={`flex items-center justify-between border-b px-4 py-2 text-xs ${
            exportError
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-200'
              : 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-text)]'
          }`}
        >
          <span>
            {exportError
              ? exportError
              : `${exportedLabel} MP4 render complete and ready to download.`}
          </span>
          <div className="flex items-center gap-3">
            {exportDownloadUrl && (
              <a
                href={exportDownloadUrl}
                download={`ClipsyCut-short-${exportPreset}.mp4`}
                className="rounded bg-[var(--accent)] px-3 py-1 font-mono text-[11px] font-bold text-[var(--accent-fg)]"
              >
                Download MP4
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setExportDownloadUrl(null);
                setExportError(null);
              }}
              className="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Middle Framing Workspace + Right Tools */}
      <div className="flex flex-1 min-h-0">
        {/* Framing Stage */}
        <main className="flex flex-1 min-w-0 min-h-0 flex-col p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] font-bold tracking-wider text-[var(--accent-text)]">
                LAYOUT
              </div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--ink-primary)]">
                Frame your sources
              </h1>
            </div>

            <button
              type="button"
              onClick={handleResetFraming}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset framing</span>
            </button>
          </div>

          <div className="mt-3 grid flex-1 min-h-0 grid-cols-1 gap-5 lg:grid-cols-[1.45fr_1fr]">
            <SourceFramingStage
              videoRef={videoRef}
              videoUrl={project.videoUrl}
              sourceWidth={project.sourceWidth}
              sourceHeight={project.sourceHeight}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              layout={project.layout}
              gameplayCrop={project.gameplayCrop}
              facecamCrop={project.facecamCrop}
              onChangeGameplayCrop={(rect: CropRect) => mutateProject({ gameplayCrop: rect })}
              onChangeFacecamCrop={(rect: CropRect) => mutateProject({ facecamCrop: rect })}
              onVideoLoadedMetadata={handleVideoLoadedMetadata}
              onVideoTimeUpdate={handleVideoTimeUpdate}
              onVideoEnded={() => setIsPlaying(false)}
              onVideoError={handleVideoError}
              onVideoWaiting={() => setIsMediaLoading(true)}
              onVideoReady={() => setIsMediaLoading(false)}
              masterVolume={project.masterVolume}
              isMuted={isMuted}
              playbackError={playbackError}
              isLoading={isMediaLoading}
              isRepairing={isRepairingMedia}
              onRepairMedia={onRepairMedia ? handleRepairMedia : undefined}
            />

            <FinalShortStage
              videoRef={videoRef}
              layout={project.layout}
              gameplayCrop={project.gameplayCrop}
              facecamCrop={project.facecamCrop}
              currentTimeSec={currentTimeSec}
              overlays={project.overlays}
              captions={project.captions}
              captionStyle={project.captionStyle}
              effects={project.effects}
              exportPreset={exportPreset}
              accentHex={accentPalette.swatchHex}
              hasVideoSource={hasSourceVideo}
            />
          </div>

          <MomentRangeSlider
            totalDurationSec={sourceTotalDur}
            viralMoments={project.viralMoments}
            selectedMomentId={activeMoment?.id}
            startSec={activeRangeStart}
            endSec={activeRangeEnd}
            currentSourceSec={currentSourceSec}
            onSelectMoment={handleSelectMomentById}
            onChangeRange={handleChangeMomentRange}
            onResetToFullSource={handleResetToFullSource}
            isFullSource={isFullSource}
          />
        </main>

        {/* Tools Sidebar + Vertical Rail */}
        <ToolsSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          project={project}
          currentTimeSec={currentTimeSec}
          onChangeLayout={(layout: LayoutMode) => mutateProject({ layout })}
          onAddOverlay={handleAddOverlay}
          onUpdateOverlay={(id, patch) =>
            mutateProject({
              overlays: project.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
            })
          }
          onDeleteOverlay={(id) =>
            mutateProject({
              overlays: project.overlays.filter((o) => o.id !== id),
            })
          }
          onGenerateCaptions={handleGenerateCaptions}
          isGeneratingCaptions={isGeneratingCaptions}
          onUpdateCaption={(id, patch: Partial<CaptionSegment>) =>
            mutateProject({
              captions: project.captions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            })
          }
          onChangeCaptionStyle={(captionStyle: CaptionStylePreset) =>
            mutateProject({ captionStyle })
          }
          onAddAudioTrack={(name, category) =>
            mutateProject({
              audioTracks: [
                ...project.audioTracks,
                {
                  id: `aud-${Date.now().toString(36)}`,
                  name,
                  category,
                  startSec: Number(currentTimeSec.toFixed(1)),
                  durationSec: category === 'sfx' ? 3 : 12,
                  volume: 0.85,
                },
              ],
            })
          }
          onDeleteAudioTrack={(id) =>
            mutateProject({
              audioTracks: project.audioTracks.filter((a) => a.id !== id),
            })
          }
          onToggleEffect={(type: VideoEffect['type'], label: string) => {
            const exists = project.effects.some((e) => e.type === type);
            mutateProject({
              effects: exists
                ? project.effects.filter((e) => e.type !== type)
                : [
                    ...project.effects,
                    {
                      id: `fx-${type}`,
                      type,
                      label,
                      startSec: 0,
                      endSec: getTimelineTotalDuration(project.segments),
                      intensity: 1,
                    },
                  ],
            });
          }}
          onJumpToMoment={handleJumpToMoment}
        />
      </div>

      {/* Bottom Timeline Dock */}
      <TimelineDock
        project={project}
        currentTimeSec={currentTimeSec}
        selectedSegmentId={selectedSegmentId}
        onSelectSegment={setSelectedSegmentId}
        onSeek={handleSeek}
        zoomPercent={zoomPercent}
        onChangeZoom={setZoomPercent}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted((m) => !m)}
        onChangeVolume={(vol) => {
          mutateProject({ masterVolume: vol });
          if (videoRef.current) videoRef.current.volume = vol;
        }}
        onAddOverlay={handleAddOverlay}
        onSplitAtPlayhead={handleSplit}
        onDeleteSelectedSegment={handleDeleteSegment}
      />

      <ExportProgressOverlay
        isOpen={exportOverlayOpen}
        exportPreset={exportPreset}
        isExporting={isExporting}
        elapsedMs={exportElapsedMs}
        durationSec={getTimelineTotalDuration(project.segments)}
        downloadUrl={exportDownloadUrl}
        fileName={exportFileName}
        sizeBytes={exportSizeBytes}
        error={exportError}
        onClose={() => setExportOverlayOpen(false)}
      />
    </div>
  );
};
