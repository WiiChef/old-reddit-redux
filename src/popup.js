// src/popup.js
(function () {
  const DEFAULT_SETTINGS = {
    enabled: true,
    theme: 'dark',
    fontSize: 'medium',
    compactMode: false,
    showRank: true,
    autoExpandMedia: false,
    disableAnimations: false,
  };

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS, ...result };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async function saveSettings(settings) {
    try {
      await chrome.storage.local.set(settings);
      // Notify all tabs so they can update immediately
      chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', settings }).catch(() => {});
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  async function init() {
    const settings = await loadSettings();

    // Toggle button
    const toggleBtn = document.getElementById('toggle-btn');
    if (toggleBtn) {
      toggleBtn.textContent = settings.enabled ? 'Old Reddit Redux: ON' : 'Old Reddit Redux: OFF';
      toggleBtn.addEventListener('click', async () => {
        settings.enabled = !settings.enabled;
        toggleBtn.textContent = settings.enabled ? 'Old Reddit Redux: ON' : 'Old Reddit Redux: OFF';
        await saveSettings(settings);
      });
    }

    // Status indicator
    const status = document.getElementById('status-indicator');
    if (status) {
      status.textContent = settings.enabled ? 'Active' : 'Disabled';
      status.style.color = settings.enabled ? '#4fbcff' : '#818384';
    }

    // Theme quick-select
    const themeSelect = document.getElementById('popup-theme');
    if (themeSelect) {
      themeSelect.value = settings.theme;
      themeSelect.addEventListener('change', async () => {
        settings.theme = themeSelect.value;
        await saveSettings(settings);
      });
    }

    // Font size quick-select
    const fontSizeSelect = document.getElementById('popup-fontSize');
    if (fontSizeSelect) {
      fontSizeSelect.value = settings.fontSize;
      fontSizeSelect.addEventListener('change', async () => {
        settings.fontSize = fontSizeSelect.value;
        await saveSettings(settings);
      });
    }

    // Links
    const optionsLink = document.getElementById('options-link');
    if (optionsLink) {
      optionsLink.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close();
      });
    }

    const githubLink = document.getElementById('github-link');
    if (githubLink) {
      githubLink.addEventListener('click', () => {
        window.open('https://github.com/Wii-Chef-Channel/old-reddit-redux', '_blank');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
