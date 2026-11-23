import React from 'react';
import { Check, CheckCircle2, Download, Film, Loader2, X, AlertCircle } from 'lucide-react';
import type { ExportPreset } from '../../types/clipsycut';
import {
  computeExportProgressStage,
  formatExportFileSize,
  resolveExportSpec,
} from '../../utils/editorLogic';

interface ExportProgressOverlayProps {
  isOpen: boolean;
  exportPreset: ExportPreset;
  isExporting: boolean;
  elapsedMs: number;
  durationSec?: number;
  downloadUrl: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
  error: string | null;
  onClose: () => void;
}

export const ExportProgressOverlay: React.FC<ExportProgressOverlayProps> = ({
  isOpen,
  exportPreset,
  isExporting,
  elapsedMs,
  durationSec,
  downloadUrl,
  fileName,
  sizeBytes,
  error,
  onClose,
}) => {
  if (!isOpen) return null;

  const spec = resolveExportSpec(exportPreset);
  const isComplete = !isExporting && Boolean(downloadUrl) && !error;
  const hasError = !isExporting && Boolean(error);
  const progress = computeExportProgressStage(elapsedMs, exportPreset, isComplete, durationSec);

  const steps = [
    { label: 'Probing source streams', index: 0 },
    { label: '9:16 Gameplay & Facecam', index: 1 },
    { label: `${spec.width}×${spec.height} @ ${spec.fps}fps encode`, index: 2 },
    { label: 'Audio, captions & MP4', index: 3 },
  ] as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-overlay-title"
      data-testid="export-progress-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 text-[var(--ink-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                hasError
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                  : isComplete
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                  : 'border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-text)]'
              }`}
            >
              {hasError ? (
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
              ) : isComplete ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider text-[var(--accent-text)]">
                <span>{spec.label.toUpperCase()}</span>
                <span aria-hidden="true">·</span>
                <span>{spec.width}×{spec.height}</span>
                <span aria-hidden="true">·</span>
                <span>{spec.fps} FPS</span>
              </div>
              <h2
                id="export-overlay-title"
                className="mt-0.5 truncate font-display text-lg font-extrabold tracking-tight text-[var(--ink-primary)]"
              >
                {hasError
                  ? 'Export failed'
                  : isComplete
                  ? 'Short ready for download'
                  : `Rendering ${spec.label} MP4`}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close export progress overlay"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--ink-muted)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Percentage + Stage Readout */}
        {!hasError ? (
          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-4">
              <span
                data-testid="export-progress-stage"
                className="truncate text-xs font-medium text-[var(--ink-secondary)]"
              >
                {progress.stageLabel}
              </span>
              <span
                data-testid="export-progress-percent"
                className="font-mono text-2xl font-extrabold tracking-tight text-[var(--ink-primary)] tabular-nums"
              >
                {progress.percent}%
              </span>
            </div>

            {/* Progress Track */}
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              aria-label={`${spec.label} export progress`}
              className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)] border border-[var(--border-hairline)]"
            >
              <div
                className="h-full origin-left rounded-full bg-[var(--accent)] transition-transform duration-150 ease-out"
                style={{
                  transform: `scaleX(${Math.max(0.02, progress.percent / 100)})`,
                }}
              />
            </div>

            {/* 4-Step Pipeline List */}
            <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2">
              {steps.map((step) => {
                const done = isComplete || progress.stepIndex > step.index;
                const active = !isComplete && progress.stepIndex === step.index;
                return (
                  <div
                    key={step.index}
                    className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs ${
                      done
                        ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--ink-primary)]'
                        : active
                        ? 'border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--ink-primary)] font-semibold'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--ink-muted)]'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                        done
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                          : active
                          ? 'border border-[var(--accent)] text-[var(--accent-text)]'
                          : 'border border-[var(--border-strong)] text-[var(--ink-muted)]'
                      }`}
                    >
                      {done ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : step.index + 1}
                    </span>
                    <span className="truncate">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-600 dark:text-rose-200">
            {error}
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4">
          <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--ink-muted)] tabular-nums">
            <Film className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {isComplete ? (
              <span className="truncate">
                {fileName || `ClipsyCut-short-${exportPreset}.mp4`} · {formatExportFileSize(sizeBytes)}
              </span>
            ) : hasError ? (
              <span className="truncate">Check source video and retry</span>
            ) : (
              <span className="truncate">FFmpeg H.264 pipeline active</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isComplete && downloadUrl ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 items-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Done
                </button>
                <a
                  href={downloadUrl}
                  download={fileName || `ClipsyCut-short-${exportPreset}.mp4`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 font-mono text-[11px] font-bold tracking-wider text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download MP4</span>
                </a>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {hasError ? 'Dismiss' : 'Hide in background'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
