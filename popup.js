/**
 * Popup Script - 输入翻译面板逻辑
 * 360px × 480px 固定尺寸，Apple Design 风格
 */

(function() {
  'use strict';

  // ============================================
  // DOM 元素引用
  // ============================================
  
  const elements = {
    // 输入相关
    sourceInput: document.getElementById('source-input'),
    charCount: document.querySelector('.char-count'),
    clearButton: document.querySelector('.clear-button'),
    
    // 语言切换
    sourceLang: document.querySelector('.source-lang .lang-code'),
    sourceLangLabel: document.querySelector('.source-lang .lang-label'),
    targetLang: document.querySelector('.target-lang .lang-code'),
    targetLangLabel: document.querySelector('.target-lang .lang-label'),
    swapButton: document.querySelector('.swap-button'),
    
    // 结果区域
    resultContent: document.querySelector('.result-content'),
    copyButton: document.querySelector('.copy-button'),
    
    // 历史记录
    historyList: document.querySelector('.history-list'),
    clearHistoryButton: document.querySelector('.clear-history')
  };

  // ============================================
  // 状态管理
  // ============================================
  
  const state = {
    // 翻译方向: 'auto', 'zh-en', 'en-zh'
    direction: 'auto',
    
    // 当前输入文本
    inputText: '',
    
    // 当前翻译结果
    currentResult: null,
    
    // 防抖定时器
    debounceTimer: null,
    
    // 防抖延迟 (毫秒)
    debounceDelay: 500,
    
    // 历史记录
    history: []
  };

  // ============================================
  // 初始化
  // ============================================

  /**
   * 初始化 Popup
   */
  function init() {
    loadSettings();
    loadHistory();
    bindEvents();
    focusInput();
    
    console.log('[Translator Popup] Initialized');
  }

  /**
   * 加载用户设置
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get('settings');
      if (result.settings) {
        state.direction = result.settings.preferredDirection || 'auto';
        updateLanguageDisplay();
      }
    } catch (e) {
      console.error('[Translator Popup] Failed to load settings:', e);
    }
  }

  /**
   * 加载历史记录
   */
  async function loadHistory() {
    try {
      const response = await sendMessage({ type: 'GET_HISTORY' });
      if (response && Array.isArray(response)) {
        state.history = response;
        renderHistory();
      }
    } catch (e) {
      console.error('[Translator Popup] Failed to load history:', e);
    }
  }

  /**
   * 绑定事件监听器
   */
  function bindEvents() {
    // 输入事件（防抖处理）
    elements.sourceInput.addEventListener('input', handleInput);
    
    // 清空按钮
    elements.clearButton.addEventListener('click', clearInput);
    
    // 语言切换
    elements.swapButton.addEventListener('click', swapLanguages);
    
    // 复制按钮
    elements.copyButton.addEventListener('click', copyResult);
    
    // 清空历史
    elements.clearHistoryButton.addEventListener('click', clearHistory);
  }

  /**
   * 聚焦输入框
   */
  function focusInput() {
    setTimeout(() => {
      elements.sourceInput.focus();
    }, 100);
  }

  // ============================================
  // 事件处理
  // ============================================

  /**
   * 处理输入事件（带防抖）
   * @param {Event} e - 输入事件
   */
  function handleInput(e) {
    const text = e.target.value.trim();
    state.inputText = text;
    
    // 更新字符计数
    updateCharCount(text.length);
    
    // 清空结果
    if (!text) {
      clearResult();
      return;
    }
    
    // 防抖：延迟 500ms 后翻译
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => {
      performTranslation(text);
    }, state.debounceDelay);
  }

  /**
   * 清空输入
   */
  function clearInput() {
    elements.sourceInput.value = '';
    state.inputText = '';
    updateCharCount(0);
    clearResult();
    elements.sourceInput.focus();
  }

  /**
   * 切换翻译方向
   */
  function swapLanguages() {
    // 切换方向
    if (state.direction === 'auto') {
      state.direction = 'zh-en';
    } else if (state.direction === 'zh-en') {
      state.direction = 'en-zh';
    } else if (state.direction === 'en-zh') {
      state.direction = 'auto';
    }
    
    // 更新显示
    updateLanguageDisplay();
    
    // 保存设置
    saveSettings();
    
    // 如果有输入文本，重新翻译
    if (state.inputText) {
      performTranslation(state.inputText);
    }
  }

  /**
   * 更新语言显示
   */
  function updateLanguageDisplay() {
    const config = {
      'auto': { source: 'AUTO', sourceLabel: '自动检测', target: 'EN', targetLabel: '自动' },
      'zh-en': { source: 'ZH', sourceLabel: '中文', target: 'EN', targetLabel: '英文' },
      'en-zh': { source: 'EN', sourceLabel: '英文', target: 'ZH', targetLabel: '中文' }
    };
    
    const current = config[state.direction];
    elements.sourceLang.textContent = current.source;
    elements.sourceLangLabel.textContent = current.sourceLabel;
    elements.targetLang.textContent = current.target;
    elements.targetLangLabel.textContent = current.targetLabel;
  }

  // ============================================
  // 翻译逻辑
  // ============================================

  /**
   * 执行翻译
   * @param {string} text - 待翻译文本
   */
  async function performTranslation(text) {
    // 显示加载状态
    showLoading();
    
    // 确定源语言和目标语言
    const from = state.direction === 'auto' ? 'auto' : (state.direction === 'zh-en' ? 'zh' : 'en');
    const to = state.direction === 'auto' ? 'auto' : (state.direction === 'zh-en' ? 'en' : 'zh');
    
    try {
      const result = await sendMessage({
        type: 'TRANSLATE',
        data: { text, from, to }
      });
      
      state.currentResult = result;
      
      // 更新语言检测显示（如果是自动检测）
      if (state.direction === 'auto') {
        updateDetectedLanguage(result.source);
      }
      
      // 显示结果
      showResult(result.text);
      
      // 保存到历史
      await saveToHistory(text, result.text, result.source, result.target);
      
    } catch (error) {
      showError(error.message);
    }
  }

  /**
   * 更新检测到的语言
   * @param {string} lang - 语言代码
   */
  function updateDetectedLanguage(lang) {
    if (state.direction !== 'auto') return;
    
    const langNames = { 'zh': '中文', 'en': '英文' };
    const langCodes = { 'zh': 'ZH', 'en': 'EN' };
    
    elements.sourceLang.textContent = langCodes[lang] || 'AUTO';
    elements.sourceLangLabel.textContent = langNames[lang] || '自动检测';
    elements.targetLang.textContent = lang === 'zh' ? 'EN' : 'ZH';
    elements.targetLangLabel.textContent = lang === 'zh' ? '英文' : '中文';
  }

  // ============================================
  // UI 更新
  // ============================================

  /**
   * 更新字符计数
   * @param {number} count - 当前字符数
   */
  function updateCharCount(count) {
    elements.charCount.textContent = `${count}/1000`;
  }

  /**
   * 显示加载状态
   */
  function showLoading() {
    elements.resultContent.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <span>翻译中...</span>
      </div>
    `;
  }

  /**
   * 显示翻译结果
   * @param {string} text - 翻译结果文本
   */
  function showResult(text) {
    elements.resultContent.innerHTML = `
      <p class="result-text">${escapeHtml(text)}</p>
    `;
  }

  /**
   * 清空结果
   */
  function clearResult() {
    elements.resultContent.innerHTML = `
      <p class="result-placeholder">翻译结果将显示在这里</p>
    `;
    state.currentResult = null;
  }

  /**
   * 显示错误
   * @param {string} message - 错误消息
   */
  function showError(message) {
    elements.resultContent.innerHTML = `
      <div class="error-box">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  // ============================================
  // 历史记录管理
  // ============================================

  /**
   * 保存到历史记录
   * @param {string} source - 源文本
   * @param {string} target - 翻译结果
   * @param {string} from - 源语言
   * @param {string} to - 目标语言
   */
  async function saveToHistory(source, target, from, to) {
    try {
      await sendMessage({
        type: 'SAVE_HISTORY',
        data: { source, target, from, to }
      });
      
      // 刷新历史显示
      await loadHistory();
    } catch (e) {
      console.error('[Translator Popup] Failed to save history:', e);
    }
  }

  /**
   * 渲染历史记录
   */
  function renderHistory() {
    if (state.history.length === 0) {
      elements.historyList.innerHTML = '<p class="history-empty">暂无历史记录</p>';
      return;
    }
    
    elements.historyList.innerHTML = state.history.map((item, index) => {
      const fromLang = item.from === 'zh' ? '中' : '英';
      const toLang = item.to === 'zh' ? '中' : '英';
      
      return `
        <div class="history-item" data-index="${index}">
          <div class="history-lang">${fromLang} → ${toLang}</div>
          <div class="history-source">${escapeHtml(truncateText(item.source, 30))}</div>
          <div class="history-target">${escapeHtml(truncateText(item.target, 30))}</div>
        </div>
      `;
    }).join('');
    
    // 绑定点击事件
    elements.historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        loadFromHistory(index);
      });
    });
  }

  /**
   * 从历史记录加载
   * @param {number} index - 历史记录索引
   */
  function loadFromHistory(index) {
    const item = state.history[index];
    if (!item) return;
    
    elements.sourceInput.value = item.source;
    state.inputText = item.source;
    updateCharCount(item.source.length);
    showResult(item.target);
    
    // 设置语言方向
    if (item.from === 'zh' && item.to === 'en') {
      state.direction = 'zh-en';
    } else if (item.from === 'en' && item.to === 'zh') {
      state.direction = 'en-zh';
    }
    updateLanguageDisplay();
  }

  /**
   * 清空历史记录
   */
  async function clearHistory() {
    try {
      await chrome.storage.local.set({ translator_history: [] });
      state.history = [];
      renderHistory();
    } catch (e) {
      console.error('[Translator Popup] Failed to clear history:', e);
    }
  }

  // ============================================
  // 工具函数
  // ============================================

  /**
   * 复制翻译结果
   */
  async function copyResult() {
    if (!state.currentResult) return;
    
    try {
      await navigator.clipboard.writeText(state.currentResult.text);
      
      // 显示成功反馈
      const originalHTML = elements.copyButton.innerHTML;
      elements.copyButton.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      `;
      elements.copyButton.classList.add('success');
      
      setTimeout(() => {
        elements.copyButton.innerHTML = originalHTML;
        elements.copyButton.classList.remove('success');
      }, 1500);
    } catch (e) {
      console.error('[Translator Popup] Copy failed:', e);
    }
  }

  /**
   * 保存设置到存储
   */
  async function saveSettings() {
    try {
      await chrome.storage.local.set({
        settings: {
          preferredDirection: state.direction
        }
      });
    } catch (e) {
      console.error('[Translator Popup] Failed to save settings:', e);
    }
  }

  /**
   * 向 Background 发送消息
   * @param {Object} message - 消息对象
   * @returns {Promise} - 响应结果
   */
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * 截断文本
   * @param {string} text - 原始文本
   * @param {number} maxLength - 最大长度
   * @returns {string} - 截断后的文本
   */
  function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * HTML 转义
   * @param {string} text - 原始文本
   * @returns {string} - 转义后的文本
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // 启动
  // ============================================
  
  init();
  
})();
