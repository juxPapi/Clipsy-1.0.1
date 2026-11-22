# Changelog

All notable changes to **Clipsy** are documented in this file.

## [Unreleased]

### Added

- **Export Progress Overlay (`ExportProgressOverlay`)**: Added a dedicated modal progress overlay (`0–100%`) in `EditorPage` when initiating a `1080p60`, `720p60`, or `720p30` download, showing preset metadata, live progress bar (`computeExportProgressStage`), 4-stage pipeline status (`Probing source streams`, `9:16 Gameplay & Facecam reframe`, `H.264 encode`, `Audio, captions & faststart MP4`), rendered MP4 size, error recovery, and instant `Download MP4` CTA upon completion.
- **`README.md` & `CHANGELOG.md`**: Documented prerequisites (`Node.js >= 22`, `FFmpeg`, `FFprobe`, `yt-dlp`), environment variables (`GEMINI_API_KEY`, `APP_URL`, `NODE_ENV`, `DISABLE_HMR`), run/build/test commands, API endpoints, and Chrome extension setup.

## [0.5.0] - 2026-11-22

### Added
- **Real Stream Media Resolution (`resolveStreamPlayback`)**: Stream scans now fetch the actual video with `yt-dlp` (`-g` direct URL, plus a bounded 720p download into `uploads/`), so pasted YouTube/Kick/Twitch links play their own footage in the snippet preview and editor and can be exported with FFmpeg. A direct CDN URL is used as a playback-only fallback when downloading is blocked.
- **5–8 Viral Clip Generation (`normalizeViralMoments`)**: Added `MIN_GENERATED_CLIPS = 5` / `MAX_GENERATED_CLIPS = 8` and a pure normalizer that keeps the highest-scoring distinct moments, drops near-duplicate overlaps, and pads with measured audio/heatmap signals or staggered timeline windows. Gemini prompt, AI parsing, no-key fallback, and audio spike detection now all target the 5–8 range.
- **Local Caption Fallback**: `generateCaptionsWithGemini` now returns five deterministic timed caption lines derived from the title/hook context when `GEMINI_API_KEY` is absent, so AI CAPTIONS works without any secret configured.
- **Unit Tests**: Added coverage for the 5–8 clip normalizer (few candidates, many candidates, signal seeds, and short full-length streams) and for playback/export readiness.

### Changed
- **No Preloaded Demo Media**: Removed the bundled `ClipFast-clip.mp4` / `stream-sample.mp4` demo videos and all seeded demo projects. Scanned projects now carry real stream media (or an explicit empty `videoUrl` with an "upload a video" hint) instead of silently substituting sample footage. Home/library demo CTAs were replaced with "scan a stream or upload video".
- **Empty / No-Media States**: `SourceFramingStage`, `FinalShortStage`, `SnippetPreviewModal`, and the editor route now show clear "No source video" states and disable playback/export when no media is loaded.
- **Export Accepts Remote Media**: `videoExporter.ts` can now FFmpeg-export from a validated http(s) stream URL when no local download exists; private/localhost/IP targets remain rejected.
- **Tooling**: Bumped `esbuild` to `^0.28.0` to satisfy Vite 8's peer range and regenerated `bun.lock`; replaced `__dirname` with `import.meta.dirname` in `vite.config.ts` to clear the Vite config warning. Runtime `uploads/`, `exports/`, and `data/` are now gitignored.
- **Documentation**: README and CHANGELOG now describe real stream media, 5–8 clip output, the caption fallback, and the no-demo-media behavior.

### Fixed
- **Editor Split/Delete**: Selecting a segment after splitting now points at the new segment id, so Delete and subsequent splits work instead of silently no-oping.
- **Short-Stream Clip Starvation**: Capped individual moment windows and added staggered fallback windows so a single full-length audio window no longer prevents reaching the five-clip minimum.
- **PATH Tool Detection**: `ffmpeg`, `ffprobe`, and `yt-dlp` are now health-checked by executing them with a realistic timeout; Winget/PATH installs on Windows are detected correctly (previous `/usr/bin/...` checks and 4s probe wrongly reported them unavailable).
- **Dependency Conflict**: `npm install` no longer fails with an esbuild/Vite 8 peer dependency ERESOLVE error.
- Verified end-to-end against a live YouTube stream: real media downloaded, 5 clips detected, all editor tools exercised in-browser with zero console errors, and a real 720×1280 MP4 export produced.

## [0.4.0] - 2026-11-22

### Added
- **Library Viral Snippet Preview (`SnippetPreviewModal`)**: Added an inline video preview modal inside `LibraryPage` bounded strictly to each viral moment's `[startSec, endSec]` window with scrubbing, loop toggle, mute control, AI hook overlay, and direct **Open snippet in editor** handoff.
- **Snippet-Specific Editor Opening (`resolveSnippetForProject`)**: Selecting or previewing any viral moment card in the Library now opens that exact viral snippet inside `EditorPage` (`Open snippet (MM:SS–MM:SS)`), seating playback and the timeline cleanly at `[startSec, endSec]` and bounding editor playback to the snippet end.
- **Visual Viral Moment Range Slider (`MomentRangeSlider`)**: Added a dual-thumb `0.1s`-precision range slider in `EditorPage` with draggable `IN`/`OUT` handles, draggable clip window shifting, `-0.5s / +0.5s` micro-nudge buttons, keyboard arrow support, live video frame scrubbing, and timeline/`AI CLIPS` sidebar sync.
- **Unit Tests**: Expanded `src/utils/editorLogic.test.ts` to 8 tests covering `clampMomentRange`, `shiftMomentWindow`, `formatPreciseTimecode`, `resolveSnippetForProject`, and `computeSnippetPreviewProgress`.

## [0.3.0] - 2026-11-22

### Added
- **YouTube oEmbed Metadata Fallback (`fetchYoutubeOembedMetadata`)**: Normalized `/live/<id>` and `/shorts/<id>` URLs to resolve real YouTube stream titles, channel names, and thumbnails automatically whenever datacenter `yt-dlp` requests encounter YouTube bot checks.
- **Clipsy Rebrand & Custom Logo**: Renamed the application, metadata, extension bundle (`clipsy-chrome-extension.tar.gz`), and exported files (`Clipsy-short-*.mp4`) to **Clipsy**, and added the geometric chamfered 9:16 `ClipsyLogo` mark.
- **Dark / Light Skins & 5 Accent Palettes (`ThemeControl`)**: Added persistent Dark/Light theme switching and 5 accent color palettes (`Volt Green`, `Electric Blue`, `Solar Amber`, `Crimson Pulse`, `Violet Spark`) wired across CSS variables, editor crop boxes, live canvas previews, and exported captions.
- **High-Frame-Rate Export Presets (`1080p60` & `720p60`)**: Added `1080p60 (1080×1920 @ 60fps)` and `720p60 (720×1280 @ 60fps)` options alongside `720p30` in `EditorPage` and `videoExporter.ts`.
- **Gaming Stream & Poster Artwork**: Added 5 generated gaming posters/graphics across Home, Library cards, and the built-in composite 1920×1080 FPS stream + facecam demo video.

## [0.2.0] - 2026-11-22

### Fixed
- **Gemini Request Timeouts & Fallback**: Added `20s` client timeout, `AbortSignal.timeout`, structured error extraction, and `gemini-3.1-flash-lite` fallback in `streamAnalyzer.ts` for reliable caption generation and viral moment scoring.

## [0.1.0] - 2026-11-22

### Added
- Initial full-stack stream clipper and 9:16 vertical video editor (`HomePage`, `LibraryPage`, `EditorPage`, `LiveClippingPage`) with `yt-dlp`, `FFmpeg`/`FFprobe` audio spike detection and H.264 MP4 export, Gemini AI viral moment/caption APIs, and the Manifest V3 live chat-spike Chrome extension.
