# Changelog

All notable changes to **Clipsy** are documented in this file.

## [Unreleased]

### Added
- **`README.md` & `CHANGELOG.md`**: Documented prerequisites (`Node.js >= 22`, `FFmpeg`, `FFprobe`, `yt-dlp`), environment variables (`GEMINI_API_KEY`, `APP_URL`, `NODE_ENV`, `DISABLE_HMR`), run/build/test commands, API endpoints, and Chrome extension setup.

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
