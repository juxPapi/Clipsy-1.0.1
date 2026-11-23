const toggleBtn = document.getElementById('toggleBtn');
const reviewBtn = document.getElementById('reviewBtn');
const statusText = document.getElementById('statusText');

let activeMonitoring = false;
let currentAppUrl = 'http://localhost:3000';

function renderStatus() {
  chrome.storage.local.get({ clipsycutStatus: { monitoring: false }, clipsycutSavedMoments: [] }, (res) => {
    const s = res.clipsycutStatus || {};
    activeMonitoring = Boolean(s.monitoring);
    toggleBtn.textContent = activeMonitoring ? 'Stop auto clipping' : 'Start auto clipping';
    if (activeMonitoring) {
      statusText.textContent = `${(s.platform || '').toUpperCase()} · ${s.ratePerMin || 0} msg/min (baseline ${s.baseline || 0}) · ${res.clipsycutSavedMoments.length} clips`;
    } else {
      statusText.textContent = `Ready · ${res.clipsycutSavedMoments.length} captured moments`;
    }
  });
}

toggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(
      tab.id,
      { type: activeMonitoring ? 'STOP_MONITOR' : 'START_MONITOR', appBaseUrl: currentAppUrl },
      () => renderStatus()
    );
  });
});

reviewBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: `${currentAppUrl}/library` });
});

renderStatus();
