import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import type { ClipProject } from './src/types/clipfast';
import {
  DEFAULT_FACECAM_CROP,
  DEFAULT_GAMEPLAY_CROP,
  parseStreamUrl,
} from './src/utils/editorLogic';
import {
  detectAudioSpikes,
  fetchYoutubeOembedMetadata,
  generateCaptionsWithGemini,
  hasBinary,
  identifyViralMomentsWithGemini,
  inspectStreamWithYtDlp,
  probeVideoFile,
  resolveStreamPlayback,
  resolveYtDlpBinary,
} from './server/services/streamAnalyzer';
import { exportVerticalShortMp4 } from './server/services/videoExporter';

dotenv.config();

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;

const UPLOADS_DIR = path.resolve(ROOT_DIR, 'uploads');
const EXPORTS_DIR = path.resolve(ROOT_DIR, 'exports');
const EXTENSION_DIR = path.resolve(ROOT_DIR, 'extension');
const DATA_DIR = path.resolve(ROOT_DIR, 'data');
const LIBRARY_FILE = path.resolve(DATA_DIR, 'library.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(EXPORTS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

/** Accepts only browser-playable local upload paths or http(s) stream URLs. */
function safeClientVideoUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (value.startsWith('/uploads/') && !value.includes('..')) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? value : '';
  } catch {
    return '';
  }
}

function seedDefaultProjects(): ClipProject[] {
  // No bundled demo projects or preloaded media: projects come from a real
  // stream scan, a local upload, or a live capture.
  return [];
}

function loadLibrary(): ClipProject[] {
  try {
    if (fs.existsSync(LIBRARY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
      if (Array.isArray(parsed)) {
        // Drop legacy seeded projects that pointed at bundled demo footage.
        const cleaned = parsed.filter(
          (p) => p && typeof p.videoUrl === 'string' && !p.videoUrl.includes('/assets/demo/')
        );
        if (cleaned.length !== parsed.length) {
          saveLibrary(cleaned);
        }
        return cleaned;
      }
    }
  } catch {
    // Fall back to an empty library
  }
  const seeded = seedDefaultProjects();
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(seeded, null, 2));
  return seeded;
}

function saveLibrary(projects: ClipProject[]) {
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(projects.slice(0, 50), null, 2));
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.mp4').replace(/[^a-zA-Z0-9.]/g, '') || '.mp4';
    cb(null, `upload-${Date.now().toString(36)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/exports', express.static(EXPORTS_DIR));
  app.use('/assets', express.static(path.resolve(ROOT_DIR, 'public', 'assets')));

  // Health & engine status
  app.get('/api/health', async (_req, res) => {
    const ytDlpPath = resolveYtDlpBinary();
    res.json({
      ok: true,
      engines: {
        ffmpeg: hasBinary('ffmpeg', '-version'),
        ffprobe: hasBinary('ffprobe', '-version'),
        ytDlp: Boolean(ytDlpPath),
        gemini: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      },
    });
  });

  // Library CRUD
  app.get('/api/library', (_req, res) => {
    res.json({ projects: loadLibrary() });
  });

  app.post('/api/library', (req, res) => {
    const project = req.body?.project as ClipProject | undefined;
    if (!project || !project.id || !project.fileName) {
      res.status(400).json({ error: 'Valid project payload required.' });
      return;
    }
    const projects = loadLibrary();
    const idx = projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) {
      projects[idx] = project;
    } else {
      projects.unshift(project);
    }
    saveLibrary(projects);
    res.json({ ok: true, project });
  });

  app.delete('/api/library/:id', (req, res) => {
    const projects = loadLibrary().filter((p) => p.id !== req.params.id);
    saveLibrary(projects);
    res.json({ ok: true });
  });

  // Analyze pasted YouTube / Kick / Twitch stream, VOD, or clip URL
  app.post('/api/streams/analyze', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const parsed = parseStreamUrl(rawUrl);

    if (!parsed.valid || !parsed.platform || !parsed.canonicalUrl || !parsed.contentKind) {
      res.status(400).json({ error: parsed.error || 'Invalid stream URL.' });
      return;
    }

    const ytResult = await inspectStreamWithYtDlp(parsed.canonicalUrl);
    const meta = ytResult.data;
    const oembedMeta =
      !meta && parsed.platform === 'youtube'
        ? await fetchYoutubeOembedMetadata(parsed.canonicalUrl, parsed.identifier)
        : null;

    const title =
      meta?.title ||
      oembedMeta?.title ||
      `${parsed.platform.toUpperCase()} ${parsed.contentKind.toUpperCase()} · ${parsed.identifier}`;
    const channelName =
      meta?.uploader || oembedMeta?.uploader || parsed.identifier || parsed.platform;
    const durationSec = meta?.durationSec || 54;

    // Resolve and use the stream's REAL playable media. No bundled demo footage
    // is ever attached to a scanned project.
    const mediaId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const media = await resolveStreamPlayback(parsed.canonicalUrl, UPLOADS_DIR, mediaId);
    const analysisMediaPath = media.localPath || media.videoUrl;
    const audioSpikes = analysisMediaPath
      ? await detectAudioSpikes(analysisMediaPath, Math.min(durationSec, 600))
      : [];

    const aiResult = await identifyViralMomentsWithGemini({
      platform: parsed.platform,
      title,
      channelName,
      durationSec,
      audioSpikes,
      heatmap: meta?.heatmap,
      chapters: meta?.chapters,
      description: meta?.description,
    });

    const project: ClipProject = {
      id: `stream-${mediaId}`,
      title,
      fileName: `${parsed.platform}-${(parsed.identifier || 'clip').slice(0, 18)}.mp4`,
      platform: parsed.platform,
      sourceUrl: parsed.canonicalUrl,
      videoUrl: media.videoUrl,
      thumbnailUrl:
        meta?.thumbnailUrl ||
        oembedMeta?.thumbnailUrl ||
        '/src/assets/images/gaming_poster_showdown_1795371872597.jpg',
      channelName,
      durationSec,
      fps: meta?.fps || 30,
      sourceWidth: meta?.width || 1920,
      sourceHeight: meta?.height || 1080,
      createdAt: new Date().toISOString(),
      status: aiResult.moments.length > 0 ? 'viral-detected' : 'ready',
      layout: 'split',
      gameplayCrop: { ...DEFAULT_GAMEPLAY_CROP },
      facecamCrop: { ...DEFAULT_FACECAM_CROP },
      segments: [
        {
          id: `seg-${mediaId}`,
          label: aiResult.moments[0]?.title || 'Master clip',
          sourceStartSec: aiResult.moments[0]?.startSec ?? 0,
          sourceEndSec: Math.min(durationSec, aiResult.moments[0]?.endSec ?? Math.min(durationSec, 30)),
        },
      ],
      overlays: [],
      captions: [],
      captionStyle: 'bold-highlight',
      audioTracks: [],
      effects: [],
      masterVolume: 1,
      viralMoments: aiResult.moments,
      selectedMomentId: aiResult.moments[0]?.id,
    };

    const projects = loadLibrary();
    projects.unshift(project);
    saveLibrary(projects);

    res.json({
      ok: true,
      metadataSource: meta ? 'yt-dlp' : oembedMeta ? 'oembed-gemini' : 'url-gemini',
      ytDlpDiagnostic: ytResult.error,
      usedGemini: aiResult.usedGemini,
      geminiError: aiResult.error,
      mediaSource: media.source,
      mediaNote: media.note,
      project,
    });
  });

  // Real local video file upload + FFprobe + FFmpeg audio spike detection + Gemini moment scan
  app.post('/api/upload', upload.single('video'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No video file uploaded.' });
      return;
    }

    const resolved = path.resolve(req.file.path);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid upload path.' });
      return;
    }

    try {
      const probe = await probeVideoFile(resolved);
      const audioSpikes = await detectAudioSpikes(resolved, probe.durationSec);
      const originalName = req.file.originalname || req.file.filename;

      const aiResult = await identifyViralMomentsWithGemini({
        platform: 'upload',
        title: originalName.replace(/\.[^.]+$/, ''),
        channelName: 'Local Upload',
        durationSec: probe.durationSec,
        audioSpikes,
      });

      const project: ClipProject = {
        id: `upload-${Date.now().toString(36)}`,
        title: originalName.replace(/\.[^.]+$/, ''),
        fileName: originalName,
        platform: 'upload',
        videoUrl: `/uploads/${req.file.filename}`,
        thumbnailUrl: '/src/assets/images/gaming_poster_showdown_1795371872597.jpg',
        channelName: 'Local Upload',
        durationSec: probe.durationSec,
        fps: probe.fps,
        sourceWidth: probe.width,
        sourceHeight: probe.height,
        createdAt: new Date().toISOString(),
        status: aiResult.moments.length > 0 ? 'viral-detected' : 'ready',
        layout: 'split',
        gameplayCrop: { ...DEFAULT_GAMEPLAY_CROP },
        facecamCrop: { ...DEFAULT_FACECAM_CROP },
        segments: [
          {
            id: `seg-${Date.now().toString(36)}`,
            label: 'Master clip',
            sourceStartSec: 0,
            sourceEndSec: probe.durationSec,
          },
        ],
        overlays: [],
        captions: [],
        captionStyle: 'bold-highlight',
        audioTracks: [],
        effects: [],
        masterVolume: 1,
        viralMoments: aiResult.moments,
        selectedMomentId: aiResult.moments[0]?.id,
      };

      const projects = loadLibrary();
      projects.unshift(project);
      saveLibrary(projects);

      res.json({
        ok: true,
        project,
        audioSpikes,
        usedGemini: aiResult.usedGemini,
        geminiError: aiResult.error,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to inspect uploaded video.',
      });
    }
  });

  // Auto-generate timed captions with Gemini
  app.post('/api/captions/generate', async (req, res) => {
    const title = String(req.body?.title || 'Stream Highlight');
    const platform = (req.body?.platform || 'twitch') as ClipProject['platform'];
    const durationSec = Math.max(6, Number(req.body?.durationSec || 30));
    const hookContext = typeof req.body?.hookContext === 'string' ? req.body.hookContext : undefined;

    const result = await generateCaptionsWithGemini({
      title,
      platform,
      durationSec,
      hookContext,
    });

    if (result.error && result.captions.length === 0) {
      res.status(502).json({ error: result.error });
      return;
    }

    res.json({ ok: true, captions: result.captions });
  });

  // Real FFmpeg 9:16 MP4 export (1080p60, 720p60, or 720p30)
  app.post('/api/export', async (req, res) => {
    try {
      const exported = await exportVerticalShortMp4(ROOT_DIR, req.body);
      res.json({
        ok: true,
        downloadUrl: `/exports/${encodeURIComponent(exported.fileName)}`,
        fileName: exported.fileName,
        sizeBytes: fs.statSync(exported.outputPath).size,
        width: exported.width,
        height: exported.height,
        fps: exported.fps,
        preset: exported.preset,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Export failed.',
      });
    }
  });

  // Chrome Extension files & downloadable archive
  app.get('/api/extension/files', (_req, res) => {
    const files = ['manifest.json', 'content.js', 'popup.html', 'popup.js'].map((name) => {
      const p = path.resolve(EXTENSION_DIR, name);
      return {
        name,
        content: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '',
      };
    });
    res.json({ files });
  });

  app.get('/api/extension/download', async (_req, res) => {
    const archivePath = path.resolve(EXPORTS_DIR, 'clipsy-chrome-extension.tar.gz');
    try {
      await execFileAsync('tar', ['-czf', archivePath, '-C', EXTENSION_DIR, '.'], {
        timeout: 10000,
      });
      res.download(archivePath, 'clipsy-chrome-extension.tar.gz');
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to package extension.',
      });
    }
  });

  // Receive live chat-spike capture from browser extension or Live Monitor
  app.post('/api/extension/capture', (req, res) => {
    const platform = (req.body?.platform || 'twitch') as ClipProject['platform'];
    const title = String(req.body?.title || 'Live Chat Spike Capture');
    const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl : undefined;
    const ratePerMin = Number(req.body?.ratePerMin || 120);
    const baseline = Number(req.body?.baseline || 35);

    const project: ClipProject = {
      id: `live-${Date.now().toString(36)}`,
      title,
      fileName: `${platform}-live-spike.mp4`,
      platform,
      sourceUrl,
      videoUrl: safeClientVideoUrl(req.body?.videoUrl),
      thumbnailUrl: '/src/assets/images/gaming_poster_showdown_1795371872597.jpg',
      channelName: String(req.body?.channelName || `${platform}Stream`),
      durationSec: 54,
      fps: 30,
      sourceWidth: 1920,
      sourceHeight: 1080,
      createdAt: new Date().toISOString(),
      status: 'viral-detected',
      layout: 'split',
      gameplayCrop: { ...DEFAULT_GAMEPLAY_CROP },
      facecamCrop: { ...DEFAULT_FACECAM_CROP },
      segments: [{ id: `seg-live-${Date.now().toString(36)}`, label: 'Live Buffer (60s+15s)', sourceStartSec: 10, sourceEndSec: 38 }],
      overlays: [],
      captions: [],
      captionStyle: 'bold-highlight',
      audioTracks: [],
      effects: [],
      masterVolume: 1,
      viralMoments: [
        {
          id: `vm-live-${Date.now().toString(36)}`,
          title: `Live Chat Spike (${ratePerMin} msg/min)`,
          startSec: 12,
          endSec: 34,
          score: 96,
          category: 'chat-spike',
          reason: `Chat jumped from ${baseline}/min baseline to ${ratePerMin}/min.`,
          hookText: 'LIVE CHAT EXPLODED',
          peakMetric: `${(ratePerMin / Math.max(1, baseline)).toFixed(1)}x spike`,
        },
      ],
    };

    const projects = loadLibrary();
    projects.unshift(project);
    saveLibrary(projects);
    res.json({ ok: true, project });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(3000, '0.0.0.0', () => {
    console.log('ClipFast server listening on http://0.0.0.0:3000');
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
