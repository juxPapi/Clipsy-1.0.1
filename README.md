# Clipsy

**Clipsy** is a full-stack stream clipping studio and 9:16 vertical video editor for **YouTube**, **Kick**, and **Twitch** creators. Paste a stream, VOD, or clip link (or upload a recording / connect the Manifest V3 Chrome extension) to detect viral moments, preview snippets, reframe Gameplay + Facecam into 9:16 vertical layouts, burn in timed captions & overlays, and export H.264 MP4 shorts at `1080p60`, `720p60`, or `720p30`.

---

## Key Features

- **Stream Link & Local Video Viral Scanner**: Accepts YouTube (`/watch?v=`, `/live/`, `/shorts/`, `/@handle`, `youtu.be`), Kick, and Twitch URLs plus local `.mp4` / `.webm` / `.mov` uploads (`<= 250 MB`). Resolves the real playable stream media with `yt-dlp` (downloads a bounded copy to `uploads/` for preview and export; no demo footage is preloaded), and combines `yt-dlp` metadata/heatmaps (with automatic YouTube oEmbed fallback), FFmpeg `astats` RMS audio-loudness spike detection, and Gemini AI moment scoring. Each scan produces a configurable **5–8** viral clips (five minimum, eight maximum when more candidates are detected).
- **Library Snippet Preview & Direct Snippet Handoff**: Preview any detected viral moment inside a bounded `startSec`–`endSec` player modal with scrubbing, looping, and hook overlay—then click **Open in editor** to load that exact snippet directly onto the timeline.
- **9:16 Vertical Framing Studio**: Drag and resize independent **Gameplay** and **Facecam** crop boxes over 16:9 sources with real-time canvas preview across four layouts:
  - `Split` (top gameplay, bottom facecam)
  - `Round facecam` (circular overlay over 9:16 gameplay)
  - `Small facecam` (rounded corner cam)
  - `Fullscreen` (full 9:16 gameplay)
- **Visual Viral Moment Range Slider (`Clip Window`)**: Dual-thumb precision `IN` / `OUT` slider (`0.1s` resolution), draggable window shift, `-0.5s / +0.5s` nudge buttons, and keyboard arrow controls synced live to the video player, `AI CLIPS` drawer, timeline segments, and FFmpeg export.
- **Timeline, Captions, Audio & Effects**: Frame-accurate timeline scrubbing, segment splitting/deletion, AI caption generation with `Highlight` / `Clean Box` / `Stroke` styles, synthesized SFX & music beds, and impact effects (`Punch Zoom`, `Screen Shake`, `Impact Flash`, `Cinema Vignette`).
- **Real FFmpeg H.264 MP4 Export & Live Progress Overlay**: Server-side 9:16 rendering at **`1080p60` (`1080×1920 @ 60fps`)**, **`720p60` (`720×1280 @ 60fps`)**, and **`720p30` (`720×1280 @ 30fps`)** with burned-in text overlays, captions, audio mixing, and an interactive `0–100%` `ExportProgressOverlay` tracking probing, reframing, H.264 encoding, MP4 muxing, file size, and instant download.
- **Dark / Light Skins & 5 Accent Palettes**: Switch between Dark and Light modes and 5 accent themes (`Volt Green`, `Electric Blue`, `Solar Amber`, `Crimson Pulse`, `Violet Spark`) persisted in `localStorage`.
- **Live Clipping Chrome Extension (Manifest V3)**: Monitors live chat velocity on Twitch, Kick, and YouTube to detect spikes (`>= 2.2x` rolling baseline) and post captured moments straight to `/api/extension/capture`.

---

## Prerequisites & System Engines

| Requirement | Purpose | Notes |
| --- | --- | --- |
| **Node.js `>= 22`** | Runtime & Express + Vite server | Verified on `v22.23.2` |
| **FFmpeg & FFprobe** | Video probing (`ffprobe`), audio spike detection (`astats`), and 9:16 H.264 export (`ffmpeg`) | Resolved on `PATH` (Winget, Homebrew, `/usr/bin/...`); verified by `/api/health` |
| **yt-dlp** *(required for stream links)* | Stream/VOD metadata, heatmaps, and **real playable media** | Resolved on `PATH` or in `~/.local/bin`, `/usr/local/bin`, `/usr/bin`; without it, upload a local video instead |
| **Gemini API Key** | AI viral moment scoring & auto-generated captions | Uses `@google/genai` server-side only |

> **Note on YouTube bot checks in cloud environments**: When running on cloud/datacenter IPs where YouTube blocks `yt-dlp` with `"Sign in to confirm you're not a bot"`, Clipsy automatically falls back to YouTube's public oEmbed endpoint for real stream title, channel name, and thumbnail metadata. No bundled demo footage is ever substituted: if playable stream media cannot be retrieved, the project is created without a preview and you can upload a local recording in the editor. Uploading an `.mp4`/`.webm` file directly always processes your exact footage end-to-end.

---

## Environment Variables

Copy `.env.example` to `.env` before running locally:

```bash
cp .env.example .env
```

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Recommended | Server-side Google Gemini API key (`AI...`) for viral moment analysis (`POST /api/streams/analyze`, `POST /api/upload`) and caption generation (`POST /api/captions/generate`). Never exposed to the browser. If omitted, deterministic FFmpeg audio-peak windows and local fallback captions are returned instead. |
| `APP_URL` | Optional | Public URL where the app is hosted (used for self-referential links/integration docs). |
| `NODE_ENV` | Optional | Set to `production` when running `npm start` to serve the built `dist/` bundle instead of Vite dev middleware. |
| `DISABLE_HMR` | Optional | Set to `true` to disable Vite HMR file watching in containerized/remote environments. |

---

## Running & Building the Project

### 1. Install dependencies

```bash
npm install
```

### 2. Start development server (Express + Vite middleware on port `3000`)

```bash
npm run dev
```

Open `http://localhost:3000`.

### 3. Production build & run

```bash
npm run build
NODE_ENV=production npm start
```

### 4. Type-check & unit tests

```bash
# TypeScript strict check
npm run lint

# Pure editor logic unit tests (URL validation, crop clamping, layouts, timeline,
# export specs & progress, range slider, snippet resolution, 5-8 clip normalization)
npx tsx --test src/utils/editorLogic.test.ts
```

### 5. Verify with a real stream (optional smoke test)

```bash
# 1. Paste a short public stream/VOD link in the Library and click "Scan viral moments".
#    Expect: real media downloaded to uploads/, five viral moment cards, playable preview.
# 2. Open a moment in the editor and exercise layout, text, captions, audio, effects,
#    AI CLIPS, clip-window slider, split/delete, and play/pause.
# 3. Click "EXPORT SHORT" and download the rendered 9:16 MP4.
```

No demo footage is bundled: if media cannot be fetched, the editor shows a no-source state and the **UPLOAD VIDEO** button loads your own recording.

---

## Project Architecture & API Endpoints

```text
├── server.ts                       # Express server (port 3000), Vite middleware / dist static serving, API routes
├── server/services/
│   ├── streamAnalyzer.ts           # Real stream media resolution (yt-dlp -g/download), ffprobe, FFmpeg audio peaks, oEmbed fallback, Gemini AI, 5-8 clip normalization, caption fallback
│   └── videoExporter.ts            # FFmpeg 9:16 H.264 MP4 renderer (1080p60 / 720p60 / 720p30)
├── src/
│   ├── App.tsx                     # SPA routing (/home, /edit/library, /live-clipping, /edit/:id) + persisted theme/accent state
│   ├── components/
│   │   ├── HomePage.tsx            # Landing page, URL scanner, interactive 16:9 -> 9:16 layout preview
│   │   ├── LibraryPage.tsx         # Clip library, URL scanner, viral moment cards & inline snippet preview trigger
│   │   ├── SnippetPreviewModal.tsx # Bounded [startSec..endSec] viral snippet preview dialog
│   │   ├── EditorPage.tsx          # Main 9:16 studio workspace
│   │   ├── LiveClippingPage.tsx    # Interactive chat-spike simulator + Chrome extension setup & bundle download
│   │   ├── ThemeControl.tsx        # Dark/Light skin & 5-accent palette popover
│   │   └── editor/                 # SourceFramingStage, FinalShortStage, MomentRangeSlider, ExportProgressOverlay, ToolsSidebar, TimelineDock
│   ├── utils/editorLogic.ts        # Pure geometry, URL validation, timeline, export preset/progress, moment range & 5-8 clip normalization helpers
│   └── types/clipfast.ts           # Shared TypeScript interfaces
├── extension/                      # Unpacked Manifest V3 Chrome Extension (manifest.json, content.js, popup.html, popup.js)
├── public/assets/                  # Static marketing images only (no preloaded demo video)
└── data/                           # Local persisted library JSON (created empty on first boot; no demo projects)
```

### Backend Endpoints

- `GET /api/health` — Reports availability of `ffmpeg`, `ffprobe`, `ytDlp`, and `gemini`.
- `GET /api/library` · `POST /api/library` · `DELETE /api/library/:id` — Read, upsert, and remove clip projects (`data/library.json`).
- `POST /api/streams/analyze` — Validates YouTube/Kick/Twitch URL, extracts metadata (`yt-dlp` / YouTube oEmbed), **downloads the real playable media** (or returns a direct CDN URL), scores **5–8** viral moments with FFmpeg + Gemini (with a deterministic fallback), and saves a project. No demo video is attached.
- `POST /api/upload` — Accepts multipart video (`video` field, up to 250 MB), runs `ffprobe` + FFmpeg audio spike detection + Gemini scan (also normalized to 5–8 moments).
- `POST /api/captions/generate` — Generates timed short-form caption segments via Gemini, with five deterministic local captions when no API key is configured.
- `POST /api/export` — Renders a 9:16 H.264 MP4 (`1080p60`, `720p60`, or `720p30`) from the local upload/download or a validated remote media URL to `/exports/<file>.mp4`.
- `GET /api/extension/files` · `GET /api/extension/download` · `POST /api/extension/capture` — Inspects/downloads the Manifest V3 extension (`clipsy-chrome-extension.tar.gz`) and receives live chat-spike captures.

---

## Integrating the Live Clipping Chrome Extension

1. Visit **`/live-clipping`** in the web app and click **Download extension bundle** (or load the `/extension` directory directly).
2. Extract the downloaded `clipsy-chrome-extension.tar.gz` archive (if downloaded).
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the extracted folder (or `/extension`).
4. Navigate to any live **Twitch**, **Kick**, or **YouTube** stream with live chat visible, open the **Clipsy Live Clipper** popup, and click **Start auto clipping**.
5. Whenever live chat velocity spikes (`>= 2.2x` baseline), `content.js` sends a `POST /api/extension/capture` payload to `http://localhost:3000` (update `currentAppUrl` in `extension/popup.js` if pointing to a deployed `APP_URL`).

---

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for the full release history, including the `0.5.0` real-stream-media / 5–8 clip update.
