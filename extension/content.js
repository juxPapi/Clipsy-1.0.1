(() => {
  const CHANNEL_SELECTORS = {
    twitch: '[data-test-selector="chat-scrollable-area__message-container"], .chat-scrollable-area__message-container',
    kick: '#chatroom-messages, [data-testid="chat-messages"]',
    youtube: '#items.yt-live-chat-item-list-renderer'
  };

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('twitch.tv')) return 'twitch';
    if (host.includes('kick.com')) return 'kick';
    if (host.includes('youtube.com')) return 'youtube';
    return null;
  }

  let monitoring = false;
  let msgCountWindow = 0;
  let historyRates = [];
  let lastTriggerAt = 0;
  let observer = null;
  let sampleInterval = null;

  function startMonitoring(appBaseUrl) {
    const platform = detectPlatform();
    if (!platform || monitoring) return;
    monitoring = true;
    msgCountWindow = 0;
    historyRates = [];

    const container = document.querySelector(CHANNEL_SELECTORS[platform]) || document.body;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          msgCountWindow += m.addedNodes.length;
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    sampleInterval = setInterval(() => {
      const ratePerMin = msgCountWindow * 12; // 5s bucket scaled to msgs/min
      msgCountWindow = 0;
      historyRates.push(ratePerMin);
      if (historyRates.length > 12) historyRates.shift();

      const baseline =
        historyRates.length >= 4
          ? historyRates.slice(0, -1).reduce((a, b) => a + b, 0) / (historyRates.length - 1)
          : 20;

      const now = Date.now();
      const ratio = ratePerMin / Math.max(8, baseline);

      chrome.storage.local.set({
        clipsyStatus: {
          monitoring: true,
          platform,
          url: window.location.href,
          ratePerMin,
          baseline: Math.round(baseline),
          ratio: Number(ratio.toFixed(2))
        }
      });

      if (historyRates.length >= 4 && ratio >= 2.2 && now - lastTriggerAt > 45000) {
        lastTriggerAt = now;
        const clipPayload = {
          id: `ext-${now}`,
          platform,
          sourceUrl: window.location.href,
          title: document.title.replace(/ - (Twitch|Kick|YouTube)$/, ''),
          detectedAt: new Date(now).toISOString(),
          ratePerMin,
          baseline: Math.round(baseline),
          leadInSec: 60,
          postSec: 15
        };

        chrome.storage.local.get({ clipsySavedMoments: [] }, (res) => {
          const updated = [clipPayload, ...res.clipsySavedMoments].slice(0, 30);
          chrome.storage.local.set({ clipsySavedMoments: updated });
        });

        if (appBaseUrl) {
          fetch(`${appBaseUrl}/api/extension/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clipPayload)
          }).catch(() => {});
        }
      }
    }, 5000);
  }

  function stopMonitoring() {
    monitoring = false;
    if (observer) observer.disconnect();
    if (sampleInterval) clearInterval(sampleInterval);
    chrome.storage.local.set({ clipsyStatus: { monitoring: false } });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'START_MONITOR') {
      startMonitoring(msg.appBaseUrl);
      sendResponse({ ok: true });
    } else if (msg.type === 'STOP_MONITOR') {
      stopMonitoring();
      sendResponse({ ok: true });
    }
  });
})();
