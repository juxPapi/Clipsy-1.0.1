import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { AccentPaletteId, ThemeMode } from '../types/clipsycut';
import { ThemeControl } from './ThemeControl';

export type AppRoute = 'home' | 'library' | 'editor' | 'live-clipping';

interface NavbarProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute, projectId?: string) => void;
  theme: ThemeMode;
  accent: AccentPaletteId;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeAccent: (accent: AccentPaletteId) => void;
}

/**
 * Distinct ClipsyCut studio brand mark: chamfered 9:16 crop frame with a diagonal cut-notch and play prism.
 */
export const ClipsyCutLogo: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <rect
      x="2"
      y="2"
      width="24"
      height="24"
      rx="6"
      fill="var(--accent)"
    />
    <path
      d="M17.5 2L26 10.5V7.5C26 4.46 23.54 2 20.5 2H17.5Z"
      fill="var(--accent-fg)"
      fillOpacity="0.22"
    />
    <path
      d="M10.2 8.4C10.2 7.52 11.17 6.98 11.92 7.45L20.15 12.68C20.84 13.12 20.84 14.13 20.15 14.57L11.92 19.8C11.17 20.27 10.2 19.73 10.2 18.85V8.4Z"
      fill="var(--accent-fg)"
    />
    <rect
      x="6.2"
      y="7.8"
      width="2.2"
      height="12.4"
      rx="1.1"
      fill="var(--accent-fg)"
    />
  </svg>
);

export const Navbar: React.FC<NavbarProps> = ({
  activeRoute,
  onNavigate,
  theme,
  accent,
  onChangeTheme,
  onChangeAccent,
}) => {
  const navItems: Array<{ route: AppRoute; label: string }> = [
    { route: 'home', label: 'Home' },
    { route: 'library', label: 'Library' },
    { route: 'live-clipping', label: 'Live clipping' },
    { route: 'editor', label: 'Editor' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-3.5">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        >
          <ClipsyCutLogo size={24} />
          <span className="font-display text-lg font-extrabold tracking-tight text-[var(--ink-primary)]">
            CLIPSYCUT
          </span>
        </button>

        <nav
          aria-label="Main navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'font-semibold text-[var(--accent-text)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <ThemeControl
            theme={theme}
            accent={accent}
            onChangeTheme={onChangeTheme}
            onChangeAccent={onChangeAccent}
          />
          <button
            type="button"
            onClick={() => onNavigate('editor')}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Open editor</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};
