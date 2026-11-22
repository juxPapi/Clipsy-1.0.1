import { useEffect, useState } from 'react';
import { EditorPage } from './components/EditorPage';
import { HomePage } from './components/HomePage';
import { LibraryPage } from './components/LibraryPage';
import { LiveClippingPage } from './components/LiveClippingPage';
import { Navbar } from './components/Navbar';
import type { AppRoute } from './components/Navbar';
import type {
  AccentPaletteId,
  ClipProject,
  ThemeMode,
  ViralMoment,
} from './types/clipfast';
import { resolveSnippetForProject } from './utils/editorLogic';

function routeFromLocation(): { route: AppRoute; projectId?: string } {
  const path = window.location.pathname.toLowerCase();
  if (path === '/library' || path === '/edit/library') {
    return { route: 'library' };
  }
  if (path === '/live-clipping') {
    return { route: 'live-clipping' };
  }
  if (path === '/editor' || path.startsWith('/edit/')) {
    const seg = path.replace(/^\/edit\//, '').replace(/^\/editor\/?/, '');
    return { route: 'editor', projectId: seg || undefined };
  }
  return { route: 'home' };
}

function readStoredTheme(): ThemeMode {
  try {
    const val = window.localStorage.getItem('clipsy-theme');
    return val === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function readStoredAccent(): AccentPaletteId {
  try {
    const val = window.localStorage.getItem('clipsy-accent');
    if (val === 'volt' || val === 'blue' || val === 'amber' || val === 'rose' || val === 'violet') {
      return val;
    }
  } catch {
    // ignore storage failures
  }
  return 'volt';
}

export default function App() {
  const initial = routeFromLocation();
  const [route, setRoute] = useState<AppRoute>(initial.route);
  const [projects, setProjects] = useState<ClipProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    initial.projectId ?? null
  );
  const [loading, setLoading] = useState(true);
  const [lastScannedProjectId, setLastScannedProjectId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);
  const [accent, setAccent] = useState<AccentPaletteId>(readStoredAccent);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.accent = accent;
    try {
      window.localStorage.setItem('clipsy-theme', theme);
      window.localStorage.setItem('clipsy-accent', accent);
    } catch {
      // ignore storage failures
    }
  }, [theme, accent]);

  useEffect(() => {
    fetch('/api/library')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.projects)) {
          setProjects(data.projects);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = routeFromLocation();
      setRoute(next.route);
      if (next.projectId) setActiveProjectId(next.projectId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextRoute: AppRoute, projectId?: string) => {
    setRoute(nextRoute);
    if (projectId) setActiveProjectId(projectId);

    let url = '/home';
    if (nextRoute === 'library') url = '/edit/library';
    else if (nextRoute === 'live-clipping') url = '/live-clipping';
    else if (nextRoute === 'editor') url = `/edit/${projectId || activeProjectId || ''}`;

    if (window.location.pathname !== url) {
      window.history.pushState({}, '', url);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleAnalyzeStreamUrl = async (url: string): Promise<ClipProject | null> => {
    const res = await fetch('/api/streams/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Stream analysis failed.');
    }
    if (data.project) {
      setProjects((prev) => [data.project, ...prev.filter((p) => p.id !== data.project.id)]);
      setLastScannedProjectId(data.project.id);
      return data.project;
    }
    return null;
  };

  const handleUploadVideo = async (file: File): Promise<ClipProject | null> => {
    const form = new FormData();
    form.append('video', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Video upload failed.');
    }
    if (data.project) {
      setProjects((prev) => [data.project, ...prev]);
      setActiveProjectId(data.project.id);
      setLastScannedProjectId(data.project.id);
      return data.project;
    }
    return null;
  };

  const handleSaveProject = async (project: ClipProject) => {
    await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project }),
    });
  };

  const handleUpdateProject = (updated: ClipProject) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleDeleteProject = async (id: string) => {
    await fetch(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const handleOpenEditor = (projectId: string, explicitMoment?: ViralMoment) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const snippet = resolveSnippetForProject(p, explicitMoment);
        if (!snippet) return p;
        return {
          ...p,
          segments: [
            {
              id: `seg-${snippet.id}`,
              label: snippet.title,
              sourceStartSec: snippet.startSec,
              sourceEndSec: snippet.endSec,
            },
          ],
          selectedMomentId: snippet.id,
        };
      })
    );
    navigate('editor', projectId);
  };

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  if (route === 'editor') {
    if (loading) {
      return (
        <div className="flex h-screen items-center justify-center bg-[var(--bg-canvas)] font-mono text-xs text-[var(--ink-muted)]">
          Loading Clipsy Editor...
        </div>
      );
    }
    if (!activeProject) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-canvas)] px-6 text-center text-[var(--ink-primary)]">
          <p className="font-display text-2xl font-extrabold">No video loaded</p>
          <p className="max-w-md text-sm text-[var(--ink-muted)]">
            Scan a YouTube, Kick, or Twitch stream—or upload a recording—from the library to start editing. No demo media is bundled.
          </p>
          <button
            type="button"
            onClick={() => navigate('library')}
            className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[var(--accent-fg)] cursor-pointer"
          >
            Open clip library
          </button>
        </div>
      );
    }
    return (
      <EditorPage
        project={activeProject}
        onUpdateProject={handleUpdateProject}
        onSaveProject={handleSaveProject}
        onUploadVideo={handleUploadVideo}
        onNavigate={navigate}
        theme={theme}
        accent={accent}
        onChangeTheme={setTheme}
        onChangeAccent={setAccent}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-primary)]">
      <Navbar
        activeRoute={route}
        onNavigate={navigate}
        theme={theme}
        accent={accent}
        onChangeTheme={setTheme}
        onChangeAccent={setAccent}
      />

      {route === 'home' && (
        <HomePage
          onNavigate={navigate}
          onAnalyzeStreamUrl={handleAnalyzeStreamUrl}
        />
      )}

      {route === 'library' && (
        <LibraryPage
          projects={projects}
          initialScannedProject={
            projects.find((p) => p.id === lastScannedProjectId) ?? null
          }
          onOpenEditor={handleOpenEditor}
          onAnalyzeStreamUrl={handleAnalyzeStreamUrl}
          onUploadVideo={handleUploadVideo}
          onDeleteProject={handleDeleteProject}
          onNavigate={navigate}
        />
      )}

      {route === 'live-clipping' && (
        <LiveClippingPage
          onCaptureSaved={(proj) => setProjects((prev) => [proj, ...prev])}
          onOpenEditor={(id) => handleOpenEditor(id)}
          onNavigate={navigate}
        />
      )}
    </div>
  );
}
