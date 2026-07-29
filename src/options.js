// src/options.js
(function () {
  const DEFAULT_SETTINGS = {
    enabled: true,
    theme: 'classic',
    fontSize: 'medium',
    compactMode: false,
    showRank: true,
    autoExpandMedia: false,
    disableAnimations: false,
  };

  const THEMES = [
    { value: 'classic', label: 'Classic (default)' },
    { value: 'dark', label: 'Dark' },
    { value: 'high-contrast', label: 'High Contrast' },
  ];

  const FONT_SIZES = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium (default)' },
    { value: 'large', label: 'Large' },
  ];

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
      // Notify any open tabs about the change
      chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', settings }).catch(() => {});
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  async function init() {
    const settings = await loadSettings();
    const form = document.getElementById('settings-form');
    if (!form) return;

    // Populate form fields
    const fields = ['enabled', 'theme', 'fontSize', 'compactMode', 'showRank', 'autoExpandMedia', 'disableAnimations'];
    for (const field of fields) {
      const el = document.getElementById(`setting-${field}`);
      if (el) {
        if (el.type === 'checkbox') {
          el.checked = !!settings[field];
        } else {
          el.value = settings[field] || '';
        }
      }
    }

    // Save button
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const newSettings = {};
        for (const field of fields) {
          const el = document.getElementById(`setting-${field}`);
          if (el) {
            newSettings[field] = el.type === 'checkbox' ? el.checked : el.value;
          }
        }
        await saveSettings(newSettings);
        const status = document.getElementById('save-status');
        if (status) {
          status.textContent = 'Settings saved!';
          status.style.display = 'block';
          setTimeout(() => { status.style.display = 'none'; }, 2000);
        }
      });
    }

    // Reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await saveSettings(DEFAULT_SETTINGS);
        location.reload();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
