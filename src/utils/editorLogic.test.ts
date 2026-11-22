import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampCropRect,
  clampMomentRange,
  computeChatSpikeScore,
  computeLayoutGeometry,
  deleteSegmentById,
  formatPreciseTimecode,
  formatTimecode,
  getAccentPalette,
  getTimelineTotalDuration,
  mapTimelineToSourceTime,
  parseStreamUrl,
  resolveExportSpec,
  shiftMomentWindow,
  splitSegmentAtTime,
} from './editorLogic';

test('parseStreamUrl accepts YouTube, Kick, and Twitch URLs and rejects SSRF targets', () => {
  const yt = parseStreamUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(yt.valid, true);
  assert.equal(yt.platform, 'youtube');
  assert.equal(yt.identifier, 'dQw4w9WgXcQ');

  const kick = parseStreamUrl('https://kick.com/xqc/clips/clip_01ABC');
  assert.equal(kick.valid, true);
  assert.equal(kick.platform, 'kick');
  assert.equal(kick.contentKind, 'clip');

  const twitch = parseStreamUrl('https://www.twitch.tv/videos/2184901234');
  assert.equal(twitch.valid, true);
  assert.equal(twitch.platform, 'twitch');
  assert.equal(twitch.contentKind, 'vod');

  const ssrf = parseStreamUrl('http://127.0.0.1:3000/secret');
  assert.equal(ssrf.valid, false);

  const local = parseStreamUrl('http://169.254.169.254/latest/meta-data');
  assert.equal(local.valid, false);

  const unsupported = parseStreamUrl('https://example.com/video.mp4');
  assert.equal(unsupported.valid, false);
});

test('clampCropRect constrains crop boxes within 0..1 bounds', () => {
  const clamped = clampCropRect({ x: -0.2, y: 0.9, width: 0.5, height: 0.3 });
  assert.equal(clamped.x, 0);
  assert.equal(clamped.y, 0.7);
  assert.equal(clamped.width, 0.5);
  assert.equal(clamped.height, 0.3);
});

test('computeLayoutGeometry returns valid 9:16 regions for all four layouts', () => {
  const split = computeLayoutGeometry('split', 720, 1280);
  assert.equal(split.gameplayDest.width, 720);
  assert.ok(split.facecamDest !== null);
  assert.equal(split.gameplayDest.height + split.facecamDest!.height, 1280);

  const round = computeLayoutGeometry('round-facecam', 720, 1280);
  assert.equal(round.facecamShape, 'circle');
  assert.equal(round.gameplayDest.height, 1280);

  const full = computeLayoutGeometry('fullscreen', 720, 1280);
  assert.equal(full.facecamDest, null);
});

test('timeline split, delete, and time mapping preserve contiguous durations', () => {
  const initial = [{ id: 'master', label: 'Master clip', sourceStartSec: 0, sourceEndSec: 54 }];
  const split = splitSegmentAtTime(initial, 20);
  assert.equal(split.length, 2);
  assert.equal(getTimelineTotalDuration(split), 54);
  assert.equal(split[0].sourceEndSec, 20);
  assert.equal(split[1].sourceStartSec, 20);

  const afterDelete = deleteSegmentById(split, split[0].id);
  assert.equal(afterDelete.length, 1);
  assert.equal(getTimelineTotalDuration(afterDelete), 34);

  const mapped = mapTimelineToSourceTime(afterDelete, 5);
  assert.equal(mapped.sourceTimeSec, 25);

  // Never delete the final remaining segment
  assert.equal(deleteSegmentById(afterDelete, afterDelete[0].id).length, 1);
});

test('formatTimecode and computeChatSpikeScore compute accurate telemetry', () => {
  assert.equal(formatTimecode(65), '01:05');
  assert.equal(formatTimecode(0), '00:00');
  const spike = computeChatSpikeScore(120, 35);
  assert.equal(spike.isSpike, true);
  assert.equal(spike.intensity, 'spike');
});

test('resolveExportSpec supports 1080p60, 720p60, and 720p30 and accent palette lookup', () => {
  const fhd60 = resolveExportSpec('1080p60');
  assert.equal(fhd60.width, 1080);
  assert.equal(fhd60.height, 1920);
  assert.equal(fhd60.fps, 60);

  const hd60 = resolveExportSpec('720p60');
  assert.equal(hd60.width, 720);
  assert.equal(hd60.height, 1280);
  assert.equal(hd60.fps, 60);

  const fallback = resolveExportSpec(undefined);
  assert.equal(fallback.preset, '720p30');
  assert.equal(fallback.fps, 30);

  assert.equal(getAccentPalette('blue').swatchHex, '#3b82f6');
  assert.equal(getAccentPalette('unknown').id, 'volt');
});

test('clampMomentRange, shiftMomentWindow, and formatPreciseTimecode enforce valid trim bounds', () => {
  assert.equal(formatPreciseTimecode(27.4), '00:27.4');
  assert.equal(formatPreciseTimecode(65.06), '01:05.1');

  // Dragging start near end enforces minimum 1.0s clip span
  const startClamped = clampMomentRange(33.6, 34.0, 54, 'start', 1.0);
  assert.deepEqual(startClamped, { startSec: 33.0, endSec: 34.0 });

  // Dragging end past duration clamps to totalDuration
  const endClamped = clampMomentRange(48.0, 62.0, 54, 'end', 1.0);
  assert.deepEqual(endClamped, { startSec: 48.0, endSec: 54.0 });

  // Sliding window preserves exact 7.0s span and clamps at edges
  const shifted = shiftMomentWindow(27.0, 34.0, 25.0, 54);
  assert.deepEqual(shifted, { startSec: 47.0, endSec: 54.0 });
});

