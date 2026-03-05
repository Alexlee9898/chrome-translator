/**
 * Popup - 输入翻译面板，自动中英互译
 */
(function() {
  'use strict';

  const elements = {
    sourceInput: document.getElementById('source-input'),
    charCount: document.querySelector('.char-count'),
    clearButton: document.querySelector('.clear-button'),
    resultContent: document.querySelector('.result-content'),
    copyButton: document.querySelector('.copy-button'),
    settingsToggle: document.getElementById('settings-toggle'),
    settingsPanel: document.getElementById('settings-panel'),
    settingService: document.getElementById('setting-service'),
    settingApikey: document.getElementById('setting-apikey'),
    apiKeyRow: document.getElementById('api-key-row'),
    settingsSave: document.getElementById('settings-save')
  };

  const state = { inputText: '', currentResult: null, debounceTimer: null, debounceDelay: 50 };

  function normLang(lang) { return lang?.startsWith('zh') ? 'zh' : 'en'; }
  function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (r) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (r?.error) reject(new Error(r.error));
        else resolve(r);
      });
    });
  }

  function init() {
    loadSettings();
    bindEvents();
    setTimeout(() => elements.sourceInput.focus(), 100);
  }

  async function loadSettings() {
    try {
      const res = await sendMessage({ action: 'getSettings' });
      if (res?.success && res.data) {
        const s = res.data;
        const service = s.service || 'openai';
        elements.settingService.value = service;
        elements.settingApikey.value = (s.apiKeys && s.apiKeys[service]) || '';
      }
    } catch (_) {}
  }

  function bindEvents() {
    elements.sourceInput.addEventListener('input', handleInput);
    elements.clearButton.addEventListener('click', clearInput);
    elements.copyButton.addEventListener('click', copyResult);
    elements.settingsToggle.addEventListener('click', () => {
      const open = elements.settingsToggle.getAttribute('aria-expanded') === 'true';
      elements.settingsToggle.setAttribute('aria-expanded', !open);
      elements.settingsPanel.hidden = open;
    });
    elements.settingService.addEventListener('change', async () => {
      const r = await sendMessage({ action: 'getSettings' });
      if (r?.success && r.data?.apiKeys) elements.settingApikey.value = r.data.apiKeys[elements.settingService.value] || '';
    });
    elements.settingsSave.addEventListener('click', saveSettingsFromForm);
  }

  function handleInput(e) {
    const text = e.target.value.trim();
    state.inputText = text;
    elements.charCount.textContent = `${text.length}/1000`;
    if (!text) { clearResult(); return; }
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => performTranslation(text), state.debounceDelay);
  }

  function clearInput() {
    elements.sourceInput.value = '';
    state.inputText = '';
    elements.charCount.textContent = '0/1000';
    clearResult();
    elements.sourceInput.focus();
  }

  async function performTranslation(text) {
    elements.resultContent.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>翻译中...</span></div>';
    try {
      const res = await sendMessage({ action: 'translate', data: { text, targetLang: 'auto' } });
      if (!res?.success) throw new Error(res?.error || '翻译失败');
      const d = res.data;
      state.currentResult = { text: d.translatedText, source: normLang(d.sourceLang), target: normLang(d.targetLang) };
      elements.resultContent.innerHTML = `<p class="result-text">${escapeHtml(d.translatedText)}</p>`;
    } catch (e) {
      elements.resultContent.innerHTML = `<div class="error-box"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg><span>${escapeHtml(e.message)}</span></div>`;
    }
  }

  function clearResult() {
    elements.resultContent.innerHTML = '<p class="result-placeholder">翻译结果将显示在这里</p>';
    state.currentResult = null;
  }

  async function saveSettingsFromForm() {
    const service = elements.settingService.value;
    const apiKey = elements.settingApikey.value.trim();
    if (!apiKey) { alert('请先填写 API Key'); return; }
    try {
      const res = await sendMessage({ action: 'getSettings' });
      const current = res?.success && res.data ? res.data : {};
      const apiKeys = { ...(current.apiKeys || {}), [service]: apiKey };
      const saveRes = await sendMessage({ action: 'saveSettings', data: { ...current, service, apiKeys } });
      if (saveRes?.success) { elements.settingsSave.textContent = '已保存'; setTimeout(() => { elements.settingsSave.textContent = '保存设置'; }, 1500); }
      else alert('保存失败: ' + (saveRes?.error || '未知错误'));
    } catch (e) { alert('保存失败: ' + e.message); }
  }

  async function copyResult() {
    if (!state.currentResult) return;
    try {
      await navigator.clipboard.writeText(state.currentResult.text);
      const orig = elements.copyButton.innerHTML;
      elements.copyButton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
      elements.copyButton.classList.add('success');
      setTimeout(() => { elements.copyButton.innerHTML = orig; elements.copyButton.classList.remove('success'); }, 1500);
    } catch (_) {}
  }

  init();
})();
