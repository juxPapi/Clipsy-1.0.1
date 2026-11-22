import React, { useEffect, useRef, useState } from 'react';
import { Check, Moon, Palette, Sun } from 'lucide-react';
import type { AccentPaletteId, ThemeMode } from '../types/clipfast';
import { ACCENT_PALETTES, getAccentPalette } from '../utils/editorLogic';

interface ThemeControlProps {
  theme: ThemeMode;
  accent: AccentPaletteId;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeAccent: (accent: AccentPaletteId) => void;
  compact?: boolean;
}

export const ThemeControl: React.FC<ThemeControlProps> = ({
  theme,
  accent,
  onChangeTheme,
  onChangeAccent,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const currentPalette = getAccentPalette(accent);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Theme and accent settings"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
      >
        {theme === 'dark' ? (
          <Moon className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
        )}
        {!compact && <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>}
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full border border-black/20"
          style={{ backgroundColor: currentPalette.swatchHex }}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Appearance settings"
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 shadow-xl"
        >
          <div>
            <div className="font-mono text-[11px] font-semibold tracking-wider text-[var(--ink-muted)]">
              SKIN
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={theme === 'dark'}
                onClick={() => onChangeTheme('dark')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--ink-primary)] hover:border-[var(--accent)]'
                }`}
              >
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Dark</span>
              </button>
              <button
                type="button"
                aria-pressed={theme === 'light'}
                onClick={() => onChangeTheme('light')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--ink-primary)] hover:border-[var(--accent)]'
                }`}
              >
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Light</span>
              </button>
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--border-hairline)] pt-3.5">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-[var(--ink-muted)]">
              <Palette className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ACCENT COLOR</span>
            </div>
            <div className="mt-2.5 grid grid-cols-5 gap-2">
              {ACCENT_PALETTES.map((pal) => {
                const selected = accent === pal.id;
                return (
                  <button
                    key={pal.id}
                    type="button"
                    aria-label={`Accent ${pal.name}`}
                    aria-pressed={selected}
                    title={pal.name}
                    onClick={() => onChangeAccent(pal.id)}
                    className={`flex h-9 w-full items-center justify-center rounded-md border transition-transform cursor-pointer ${
                      selected
                        ? 'scale-105 border-[var(--ink-primary)] ring-2 ring-[var(--ink-primary)]/20'
                        : 'border-black/15 hover:scale-105'
                    }`}
                    style={{ backgroundColor: pal.swatchHex, color: pal.fgHex }}
                  >
                    {selected && <Check className="h-3.5 w-3.5 stroke-[3]" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 font-mono text-[11px] text-[var(--ink-muted)]">
              Active: <span className="font-semibold text-[var(--ink-primary)]">{currentPalette.name}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
