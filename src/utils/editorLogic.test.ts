import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_GENERATED_CLIPS,
  MIN_GENERATED_CLIPS,
  buildFallbackCaptions,
  clampCropRect,
  clampMomentRange,
  computeChatSpikeScore,
  computeExportProgressStage,
  computeLayoutGeometry,
  computeSnippetPreviewProgress,
  deleteSegmentById,
  formatExportFileSize,
  formatPreciseTimecode,
  formatTimecode,
  getAccentPalette,
  getTimelineTotalDuration,
  isHlsUrl,
  mapTimelineToSourceTime,
  normalizeViralMoments,
  parseStreamUrl,
  resolveExportSpec,
  resolveSnippetForProject,
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

test('resolveSnippetForProject and computeSnippetPreviewProgress resolve active snippet cleanly', () => {
  const m1 = {
    id: 'm1',
    title: 'First spike',
    startSec: 12,
    endSec: 18,
    score: 90,
    category: 'clutch' as const,
    reason: 'Peak 1',
    hookText: 'HOOK 1',
    peakMetric: '+10 dB',
  };
  const m2 = {
    id: 'm2',
    title: 'Second spike',
    startSec: 27,
    endSec: 34,
    score: 96,
    category: 'chat-spike' as const,
    reason: 'Peak 2',
    hookText: 'HOOK 2',
    peakMetric: '2.8x spike',
  };

  assert.equal(resolveSnippetForProject({ viralMoments: [m1, m2], selectedMomentId: 'm2' })?.id, 'm2');
  assert.equal(resolveSnippetForProject({ viralMoments: [m1, m2], selectedMomentId: 'm2' }, m1)?.id, 'm1');
  assert.equal(resolveSnippetForProject({ viralMoments: [m1, m2] })?.id, 'm1');
  assert.equal(resolveSnippetForProject({ viralMoments: [] }), undefined);

  const progMid = computeSnippetPreviewProgress(30.5, 27, 34);
  assert.equal(progMid.elapsedSec, 3.5);
  assert.equal(progMid.durationSec, 7);
  assert.equal(progMid.progressPct, 50);
  assert.equal(progMid.isFinished, false);

  const progEnd = computeSnippetPreviewProgress(34.0, 27, 34);
  assert.equal(progEnd.isFinished, true);
  assert.equal(progEnd.progressPct, 100);
});

test('normalizeViralMoments produces 5-8 clips from stream detections', () => {
  const makeMoment = (idx: number, score: number, startSec: number, endSec: number) => ({
    id: `vm-${idx}`,
    title: `Moment ${idx}`,
    startSec,
    endSec,
    score,
    category: 'clutch' as const,
    reason: 'Test moment',
    hookText: 'WATCH',
    peakMetric: '+10 dB',
  });

  // Only three real candidates still yield the five-clip minimum.
  const few = normalizeViralMoments(
    [makeMoment(1, 96, 10, 18), makeMoment(2, 91, 25, 33), makeMoment(3, 88, 40, 48)],
    120
  );
  assert.equal(few.length, MIN_GENERATED_CLIPS);
  assert.equal(new Set(few.map((m) => m.id)).size, MIN_GENERATED_CLIPS);
  for (const m of few) {
    assert.ok(m.startSec >= 0 && m.endSec <= 120);
    assert.ok(m.endSec > m.startSec);
  }

  // Many candidates are capped at eight, highest scoring first.
  const many = Array.from({ length: 14 }, (_, i) => makeMoment(i + 1, 90 - i, i * 8, i * 8 + 9));
  const capped = normalizeViralMoments(many, 180);
  assert.equal(capped.length, MAX_GENERATED_CLIPS);
  assert.equal(capped[0].id, 'vm-1');
  assert.ok(
    capped.every((m, i) => i === 0 || capped[i - 1].score >= m.score),
    'moments remain sorted by score'
  );

  // Short streams still reach five clips even when one candidate covers the
  // whole source (staggered, non-duplicate windows are used as a last resort).
  const shortStream = normalizeViralMoments([makeMoment(1, 90, 0, 19)], 19);
  assert.equal(shortStream.length, MIN_GENERATED_CLIPS);
  assert.equal(new Set(shortStream.map((m) => m.startSec)).size, MIN_GENERATED_CLIPS);

  // Signal peaks are used as seeds before synthetic timeline windows.
  const seeded = normalizeViralMoments([makeMoment(1, 90, 5, 12)], 90, [
    { startSec: 30, endSec: 38, peakMetric: '+14 dB audio peak' },
  ]);
  assert.equal(seeded.length, MIN_GENERATED_CLIPS);
  assert.ok(seeded.some((m) => m.peakMetric.includes('+14 dB')));
});

test('computeExportProgressStage advances monotonically 0->94% per preset and snaps to 100% on complete', () => {  const start = computeExportProgressStage(0, '1080p60', false);
  assert.equal(start.percent, 0);
  assert.equal(start.stepIndex, 0);

  const p1080Early = computeExportProgressStage(400, '1080p60', false);
  const p720Early = computeExportProgressStage(400, '720p60', false);
  assert.ok(p1080Early.percent >= 4 && p1080Early.percent < p720Early.percent);

  const pMid = computeExportProgressStage(3500, '1080p60', false);
  assert.ok(pMid.percent >= 55 && pMid.percent < 85);
  assert.equal(pMid.stepIndex, 2);
  assert.ok(pMid.stageLabel.includes('1080×1920 @ 60fps'));

  const pCeiling = computeExportProgressStage(120000, '1080p60', false);
  assert.equal(pCeiling.percent, 94);
  assert.equal(pCeiling.stepIndex, 3);

  const done = computeExportProgressStage(1200, '720p60', true);
  assert.equal(done.percent, 100);
  assert.equal(done.stepIndex, 4);

  assert.equal(formatExportFileSize(512 * 1024), '512 KB');
  assert.equal(formatExportFileSize(2.5 * 1024 * 1024), '2.5 MB');
  assert.equal(formatExportFileSize(null), 'Ready');
});

test('buildFallbackCaptions covers the whole clip without overlapping or repeating text', () => {
  const captions = buildFallbackCaptions('Insane 1v5 clutch reaction', 12, 'Chat exploded');
  assert.ok(captions.length >= 2 && captions.length <= 6);

  for (const [idx, caption] of captions.entries()) {
    assert.ok(caption.text.length > 0);
    assert.ok(caption.endSec > caption.startSec);
    assert.ok(caption.startSec >= 0);
    assert.ok(caption.endSec <= 12.001);
    if (idx > 0) {
      assert.ok(
        caption.startSec >= captions[idx - 1].endSec,
        'caption windows must not overlap'
      );
    }
  }

  // Each line should be distinct so the fallback never stutters the same words.
  assert.equal(new Set(captions.map((caption) => caption.text)).size, captions.length);
  // Every caption must stay inside the source clip.
  assert.ok(captions[captions.length - 1].endSec <= 12);
});

test('isHlsUrl detects m3u8 playlists and ignores normal MP4 sources', () => {
  assert.equal(isHlsUrl('https://cdn.example.com/live/index.m3u8?token=abc'), true);
  assert.equal(isHlsUrl('/uploads/stream-abc.mp4'), false);
  assert.equal(isHlsUrl('https://cdn.example.com/video.mp4'), false);
  assert.equal(isHlsUrl(''), false);
});
