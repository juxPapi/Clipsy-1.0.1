import { useEffect, useState } from 'react';
import Hls from 'hls.js';
import { isHlsUrl } from '../utils/editorLogic';

/**
 * Attaches hls.js when a source is an HLS playlist. Chromium cannot play
 * `.m3u8` natively, which is why pasted stream CDN links previously showed a
 * black player even though the URL was valid.
 *
 * Returns a human-readable fatal error (or null). Non-HLS sources are handled
 * by the normal `<video src>` attribute.
 */
export function useHlsVideo(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  src: string | undefined
): string | null {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const video = videoRef.current;
    if (!video || !src || !isHlsUrl(src)) return;

    if (!Hls.isSupported()) {
      // Native HLS support (Safari/Edge) is allowed to play the playlist.
      video.src = src;
      return;
    }

    const hls = new Hls({
      enableWorker: false,
      lowLatencyMode: false,
      maxBufferLength: 30,
      backBufferLength: 60,
    });
    hls.loadSource(src);
    hls.attachMedia(video);

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        setError(
          'This stream link is unavailable or has expired. Use Repair media to download it again.'
        );
      } else {
        setError('This stream could not be decoded. Use Repair media or upload an MP4.');
      }
    });

    return () => {
      hls.destroy();
    };
  }, [src, videoRef]);

  return error;
}
