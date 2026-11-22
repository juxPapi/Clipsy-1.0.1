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

function routeFromLocation(): { route: AppRoute; projectId?: string } {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') {
    return { route: 'editor', projectId: 'demo-clipsy' };
  }
  if (path === '/library' || path === '/edit/library') {
    return { route: 'library' };
  }
  if (path === '/live-clipping') {
    return { route: 'live-clipping' };
  }
  if (path === '/editor' || path.startsWith('/edit/')) {
    const seg = path.replace(/^\/edit\//, '').replace(/^\/editor\/?/, '');
    return {
      route: 'editor',
      projectId: seg && seg !== 'demo' ? seg : 'demo-clipsy',
    };
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
  const [activeProjectId, setActiveProjectId] = useState<string>(
    initial.projectId || 'demo-clipsy'
  );
  const [loading, setLoading] = useState(true);
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
    else if (nextRoute === 'editor') url = `/edit/${projectId || activeProjectId || 'demo-clipsy'}`;

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

  const handleOpenEditor = (projectId: string, moment?: ViralMoment) => {
    if (moment) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                segments: [
                  {
                    id: `seg-${moment.id}`,
                    label: moment.title,
                    sourceStartSec: moment.startSec,
                    sourceEndSec: moment.endSec,
                  },
                ],
                selectedMomentId: moment.id,
              }
            : p
        )
      );
    }
    navigate('editor', projectId);
  };

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  if (route === 'editor') {
    if (loading || !activeProject) {
      return (
        <div className="flex h-screen items-center justify-center bg-[var(--bg-canvas)] font-mono text-xs text-[var(--ink-muted)]">
          Loading Clipsy Editor...
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
