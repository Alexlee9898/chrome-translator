/**
 * Content Script - 划词翻译，Shadow DOM 隔离
 */
(function() {
  'use strict';

  const CONFIG = {
    // 延迟显示时间（毫秒）- 避免干扰正常选择
    SHOW_DELAY: 100,
    
    // 最小选择文本长度
    MIN_TEXT_LENGTH: 1,
    
    // 最大选择文本长度（防止过长文本）
    MAX_TEXT_LENGTH: 500,
    
    // 悬浮按钮尺寸
    BUTTON_SIZE: 32,
    
    // 卡片最大宽度
    CARD_MAX_WIDTH: 320,
    
    // 卡片边距
    CARD_MARGIN: 16
  };

  let shadowHost = null, shadowRoot = null, isInitialized = false;

  function initShadowDOM() {
    if (isInitialized) return;
    
    // 创建 Shadow Host 元素
    shadowHost = document.createElement('div');
    shadowHost.id = 'minimal-translator-host';
    shadowHost.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
    `;
    
    // 附加到页面
    document.body.appendChild(shadowHost);
    
    // 创建 Shadow Root
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    
    // 注入样式
    injectStyles();
    
    isInitialized = true;
  }

  function injectStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      /* ============================================
         Design System Variables
         ============================================ */
      :host {
        --bg-primary: #FFFFFF;
        --bg-secondary: #F5F5F7;
        --text-primary: #1D1D1F;
        --text-secondary: #86868B;
        --accent-blue: #007AFF;
        --accent-green: #34C759;
        --border-color: rgba(0, 0, 0, 0.08);
        --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.04);
        --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.08);
        --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
        --radius-sm: 8px;
        --radius-md: 12px;
        --radius-lg: 16px;
        --font-family: system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        --transition-fast: 150ms ease-out;
        --transition-normal: 200ms ease-out;
        --transition-slow: 300ms ease-out;
      }

      /* ============================================
         Base Container
         ============================================ */
      .translator-container {
        font-family: var(--font-family);
        pointer-events: auto;
      }

      /* ============================================
         Floating Button (划词后显示的翻译按钮)
         ============================================ */
      .floating-button {
        position: absolute !important;
        width: 32px !important;
        height: 32px !important;
        background: #FFFFFF !important;
        border: none !important;
        border-radius: 50% !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1) !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: transform 150ms ease-out, box-shadow 150ms ease-out !important;
        z-index: 10000 !important;
        animation: buttonAppear 200ms ease-out !important;
      }

      .floating-button:hover {
        transform: scale(0.95);
        box-shadow: var(--shadow-lg);
      }

      .floating-button:active {
        transform: scale(0.9);
      }

      .floating-button svg {
        width: 16px !important;
        height: 16px !important;
        fill: #007AFF !important;
      }

      @keyframes buttonAppear {
        from {
          opacity: 0;
          transform: scale(0.8);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      /* ============================================
         Translation Card (翻译结果卡片)
         ============================================ */
      .translation-card {
        position: absolute;
        min-width: 200px;
        max-width: 320px;
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        padding: 16px;
        z-index: 1001;
        animation: cardAppear var(--transition-normal);
        pointer-events: auto;
      }

      @keyframes cardAppear {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .translation-card.closing {
        animation: cardDisappear var(--transition-fast) forwards;
      }

      @keyframes cardDisappear {
        to {
          opacity: 0;
          transform: translateY(-8px);
        }
      }

      /* 卡片头部 - 语言指示器 */
      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-color);
      }

      .language-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--text-secondary);
        font-weight: 500;
      }

      .language-indicator .arrow {
        opacity: 0.5;
      }

      .language-indicator .lang-code {
        color: var(--accent-blue);
        font-weight: 600;
      }

      /* 关闭按钮 */
      .close-button {
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background var(--transition-fast);
      }

      .close-button:hover {
        background: var(--bg-secondary);
      }

      .close-button svg {
        width: 12px;
        height: 12px;
        fill: var(--text-secondary);
      }

      /* 源文本 */
      .source-text {
        font-size: 14px;
        line-height: 1.5;
        color: var(--text-primary);
        margin-bottom: 12px;
        word-break: break-word;
        max-height: 100px;
        overflow-y: auto;
      }

      /* 翻译结果 */
      .translation-result {
        font-size: 15px;
        line-height: 1.6;
        color: var(--text-primary);
        font-weight: 500;
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        word-break: break-word;
      }

      /* 操作栏 */
      .action-bar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border-color);
      }

      .action-button {
        padding: 6px 12px;
        border: none;
        background: transparent;
        color: var(--accent-blue);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border-radius: var(--radius-sm);
        transition: background var(--transition-fast), transform var(--transition-fast);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .action-button:hover {
        background: rgba(0, 122, 255, 0.08);
      }

      .action-button:active {
        transform: scale(0.95);
      }

      .action-button svg {
        width: 14px;
        height: 14px;
        fill: currentColor;
      }

      .action-button.success {
        color: var(--accent-green);
      }

      /* 加载状态 */
      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        color: var(--text-secondary);
        font-size: 14px;
      }

      .loading::after {
        content: '';
        width: 16px;
        height: 16px;
        margin-left: 8px;
        border: 2px solid var(--border-color);
        border-top-color: var(--accent-blue);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* 错误状态 */
      .error-message {
        padding: 12px;
        color: #FF3B30;
        font-size: 13px;
        text-align: center;
        background: rgba(255, 59, 48, 0.05);
        border-radius: var(--radius-md);
      }

      /* 空状态提示 */
      .empty-tip {
        padding: 16px;
        text-align: center;
        color: var(--text-secondary);
        font-size: 13px;
      }
    `;
    
    shadowRoot.appendChild(styleSheet);
  }

  let currentSelection = null, floatingButton = null, translationCard = null, showButtonTimer = null;
  let lastMousePosition = { x: 0, y: 0 };

  function init() {
    // 等待页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initContentScript);
    } else initContentScript();
  }

  function initContentScript() {
    initShadowDOM();
    
    // 监听鼠标释放事件（文本选择结束）
    document.addEventListener('mouseup', handleMouseUp, { passive: true });
    
    // 监听鼠标按下事件（使用捕获阶段，确保先处理）
    document.addEventListener('mousedown', handleMouseDown, { capture: true });
    
    // 监听键盘事件（ESC 关闭）
    document.addEventListener('keydown', handleKeyDown, { passive: true });
    
    // 监听窗口滚动（隐藏悬浮元素）
    window.addEventListener('scroll', hideAllElements, { passive: true });
    
    // 监听窗口大小改变
    window.addEventListener('resize', hideAllElements, { passive: true });
  }

  function handleMouseUp(e) {
    // 如果点击在翻译元素内部，不处理
    if (isClickInsideTranslator(e.target)) {
      return;
    }
    
    lastMousePosition = { x: e.clientX, y: e.clientY };
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (!isValidText(selectedText)) {
      hideAllElements();
      return;
    }
    
    let range = null;
    try {
      if (selection.rangeCount >= 1) {
        range = selection.getRangeAt(0);
      }
    } catch (err) {
      // getRangeAt 错误，忽略
    }
    
    currentSelection = {
      text: selectedText,
      range: range
    };
    
    // 在定时器外捕获选中文本，避免用户在此前点击别处导致 currentSelection 被清空
    const capturedText = selectedText;
    clearTimeout(showButtonTimer);
    showButtonTimer = setTimeout(() => {
      showFloatingButton(lastMousePosition.x, lastMousePosition.y, capturedText);
    }, CONFIG.SHOW_DELAY);
  }

  function handleMouseDown(e) {
    // 如果点击在翻译元素内部，不处理
    if (isClickInsideTranslator(e.target)) {
      return;
    }
    // 点击页面其他区域时，隐藏所有元素并清空选择
    hideAllElements();
  }

  /**
   * 处理键盘事件
   * @param {KeyboardEvent} e - 键盘事件
   */
  function handleKeyDown(e) {
    // ESC 键关闭所有翻译元素
    if (e.key === 'Escape') {
      hideAllElements();
    }
  }

  // ============================================
  // UI 元素创建与管理
  // ============================================

  function showFloatingButton(x, y, preservedText) {
    const selectedText = preservedText ?? currentSelection?.text ?? '';
    if (!isValidText(selectedText)) {
      hideAllElements();
      return;
    }
    
    hideAllElements();
    
    // 确保 Shadow DOM 已初始化
    if (!shadowRoot) {
      initShadowDOM();
    }
    
    // 恢复 currentSelection 供后续卡片显示源文使用
    currentSelection = { text: selectedText, range: null };
    
    // 创建按钮
    floatingButton = document.createElement('div');
    floatingButton.className = 'translator-container floating-button';
    floatingButton.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
    `;
    
    floatingButton.dataset.selectedText = selectedText;
    
    // 计算位置（防止超出视窗）
    const position = calculateButtonPosition(x, y);
    floatingButton.style.left = `${position.x}px`;
    floatingButton.style.top = `${position.y}px`;
    
    // 点击事件
    floatingButton.addEventListener('click', (e) => {
      e.stopPropagation();
      // 使用按钮上保存的文本
      const text = floatingButton.dataset.selectedText;
      showTranslationCard(position.x, position.y, text);
    });
    
    shadowRoot.appendChild(floatingButton);
  }

  async function showTranslationCard(x, y, text) {
    if (floatingButton) { floatingButton.remove(); floatingButton = null; }
    translationCard = document.createElement('div');
    translationCard.className = 'translator-container translation-card';
    const position = calculateCardPosition(x, y);
    translationCard.style.left = `${position.x}px`;
    translationCard.style.top = `${position.y}px`;
    translationCard.innerHTML = `
      <div class="loading">翻译中</div>
    `;
    
    shadowRoot.appendChild(translationCard);
    
    // 执行翻译
    try {
      // 优先使用传入的文本，否则使用 currentSelection
      const textToTranslate = text || (currentSelection?.text);
      if (!textToTranslate) {
        throw new Error('未选择文本');
      }
      const result = await translateText(textToTranslate);
      renderTranslationCard(result);
    } catch (error) {
      renderError(error.message);
    }
  }

  function renderTranslationCard(result) {
    translationCard.innerHTML = `
      <div class="card-header">
        <span></span>
        <button class="close-button" title="关闭 (ESC)">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      
      <div class="source-text">${escapeHtml(currentSelection.text)}</div>
      
      <div class="translation-result">${escapeHtml(result.text)}</div>
      
      <div class="action-bar">
        <button class="action-button copy-button">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
          <span>复制</span>
        </button>
      </div>
    `;
    
    // 绑定关闭按钮事件
    const closeBtn = translationCard.querySelector('.close-button');
    closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTranslationCard();
    });
    
    // 绑定复制按钮事件
    const copyButton = translationCard.querySelector('.copy-button');
    copyButton.addEventListener('mousedown', (e) => e.stopPropagation());
    copyButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyToClipboard(result.text, copyButton);
    });
  }

  function renderError(message) {
    translationCard.innerHTML = `
      <div class="card-header">
        <div class="language-indicator">
          <span>翻译失败</span>
        </div>
        <button class="close-button">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="error-message">${escapeHtml(message)}</div>
    `;
    
    translationCard.querySelector('.close-button').addEventListener('click', (e) => {
      e.stopPropagation();
      hideTranslationCard();
    });
  }

  function calculateButtonPosition(x, y) {
    const buttonSize = CONFIG.BUTTON_SIZE;
    const margin = 8;
    
    // 默认在鼠标右下方
    let posX = x + margin;
    let posY = y + margin;
    
    // 防止超出右边界
    if (posX + buttonSize > window.innerWidth) {
      posX = x - buttonSize - margin;
    }
    
    // 防止超出下边界
    if (posY + buttonSize > window.innerHeight) {
      posY = y - buttonSize - margin;
    }
    
    return { x: posX, y: posY };
  }

  function calculateCardPosition(x, y) {
    const cardWidth = CONFIG.CARD_MAX_WIDTH;
    const cardHeight = 200; // 预估高度
    const margin = CONFIG.CARD_MARGIN;
    
    // 默认在参考位置右下方
    let posX = x;
    let posY = y + CONFIG.BUTTON_SIZE + margin;
    
    // 防止超出右边界
    if (posX + cardWidth > window.innerWidth - margin) {
      posX = window.innerWidth - cardWidth - margin;
    }
    
    // 如果会超出下边界，显示在上方
    if (posY + cardHeight > window.innerHeight - margin) {
      posY = y - cardHeight - margin;
    }
    
    // 确保不超出左边界
    posX = Math.max(margin, posX);
    
    return { x: posX, y: posY };
  }

  async function translateText(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'translate', data: { text, sourceLang: 'auto', targetLang: 'auto' } }, (r) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          reject(new Error(msg.includes('Extension context invalidated') ? '扩展已更新或已重载，请刷新当前页面后重试' : msg));
          return;
        }
        if (r?.error) { reject(new Error(r.error)); return; }
        if (r?.success && r.data) {
          const d = r.data;
          resolve({ text: d.translatedText || '', source: d.sourceLang?.startsWith('zh') ? 'zh' : 'en', target: d.targetLang?.startsWith('zh') ? 'zh' : 'en' });
          return;
        }
        reject(new Error('翻译无响应'));
      });
    });
  }

  const COPY_BTN_DEFAULT = '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg><span>复制</span>';
  const COPY_BTN_DONE = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span>已复制</span>';
  async function copyToClipboard(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      button.classList.add('success');
      button.innerHTML = COPY_BTN_DONE;
      setTimeout(() => { button.classList.remove('success'); button.innerHTML = COPY_BTN_DEFAULT; }, 1500);
    } catch (_) {}
  }

  function isValidText(text) {
    return text && text.length >= CONFIG.MIN_TEXT_LENGTH && text.length <= CONFIG.MAX_TEXT_LENGTH;
  }

  function isClickInsideTranslator(target) {
    if (!target) return false;
    const host = document.getElementById('minimal-translator-host');
    return host && (host === target || host.contains(target) || target.getRootNode() === shadowRoot);
  }

  function hideAllElements() {
    clearTimeout(showButtonTimer);
    
    if (floatingButton) {
      floatingButton.remove();
      floatingButton = null;
    }
    
    hideTranslationCard();
    
    currentSelection = null;
  }

  function hideTranslationCard() {
    if (translationCard) {
      translationCard.classList.add('closing');
      setTimeout(() => {
        if (translationCard) {
          translationCard.remove();
          translationCard = null;
        }
      }, 200);
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // 悬浮助手按钮（右下角小圆圈）
  // ============================================
  
  let assistantButton = null;
  let assistantPanel = null;
  
  /**
   * 创建悬浮助手按钮
   */
  function createAssistantButton() {
    if (assistantButton) return;
    
    assistantButton = document.createElement('div');
    assistantButton.className = 'translator-container assistant-button';
    assistantButton.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
    `;
    
    // 固定位置：右下角
    assistantButton.style.cssText = `
      position: fixed !important;
      right: 20px !important;
      bottom: 20px !important;
      width: 48px !important;
      height: 48px !important;
      background: #007AFF !important;
      border-radius: 50% !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 10001 !important;
      transition: transform 150ms ease-out, box-shadow 150ms ease-out !important;
    `;
    
    assistantButton.addEventListener('mouseenter', () => {
      assistantButton.style.transform = 'scale(1.1)';
      assistantButton.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
    });
    
    assistantButton.addEventListener('mouseleave', () => {
      assistantButton.style.transform = 'scale(1)';
      assistantButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
    
    assistantButton.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAssistantPanel();
    });
    
    shadowRoot.appendChild(assistantButton);

  }
  
  /**
   * 切换助手面板显示/隐藏
   */
  function toggleAssistantPanel() {
    if (assistantPanel) {
      hideAssistantPanel();
    } else {
      showAssistantPanel();
    }
  }
  
  /**
   * 显示助手面板
   */
  function showAssistantPanel() {
    // 隐藏其他元素
    hideAllElements();
    
    assistantPanel = document.createElement('div');
    assistantPanel.className = 'translator-container assistant-panel';
    
    // 面板位置：按钮左上方
    assistantPanel.style.cssText = `
      position: fixed !important;
      right: 20px !important;
      bottom: 80px !important;
      width: 320px !important;
      background: #FFFFFF !important;
      border-radius: 16px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2) !important;
      z-index: 10002 !important;
      overflow: hidden !important;
      animation: panelAppear 200ms ease-out !important;
    `;
    
    assistantPanel.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">极简翻译</span>
        <button class="panel-close">&times;</button>
      </div>
      <div class="panel-body">
        <textarea class="panel-input" placeholder="输入要翻译的文本..." rows="3"></textarea>
        <div class="panel-result">
          <p class="result-placeholder">翻译结果将显示在这里</p>
        </div>
      </div>
      <div class="panel-footer">
        <button class="panel-translate-btn">翻译</button>
      </div>
    `;
    
    // 添加样式
    const panelStyle = document.createElement('style');
    panelStyle.textContent = `
      .assistant-panel .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(0,0,0,0.08);
      }
      .assistant-panel .panel-title {
        font-size: 15px;
        font-weight: 600;
        color: #1D1D1F;
      }
      .assistant-panel .panel-close {
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        font-size: 20px;
        color: #86868B;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 150ms ease-out;
      }
      .assistant-panel .panel-close:hover {
        background: rgba(0,0,0,0.05);
      }
      .assistant-panel .panel-body {
        padding: 12px 16px;
      }
      .assistant-panel .panel-input {
        width: 100%;
        min-height: 60px;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 14px;
        line-height: 1.5;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
      }
      .assistant-panel .panel-input:focus {
        border-color: #007AFF;
      }
      .assistant-panel .panel-result {
        margin-top: 12px;
        min-height: 40px;
        padding: 10px 12px;
        background: #F5F5F7;
        border-radius: 8px;
      }
      .assistant-panel .result-placeholder {
        color: #86868B;
        font-size: 13px;
        margin: 0;
      }
      .assistant-panel .result-text {
        color: #1D1D1F;
        font-size: 14px;
        line-height: 1.5;
        margin: 0;
        flex: 1;
      }
      .assistant-panel .result-with-copy {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .assistant-panel .copy-result-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: transparent;
        border: none;
        color: #007AFF;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border-radius: 6px;
        transition: background 150ms ease-out;
        flex-shrink: 0;
      }
      .assistant-panel .copy-result-btn:hover {
        background: rgba(0, 122, 255, 0.1);
      }
      .assistant-panel .panel-footer {
        padding: 12px 16px;
        border-top: 1px solid rgba(0,0,0,0.08);
        display: flex;
        justify-content: flex-end;
      }
      .assistant-panel .panel-translate-btn {
        padding: 8px 20px;
        background: #007AFF;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 150ms ease-out;
      }
      .assistant-panel .panel-translate-btn:hover {
        opacity: 0.9;
      }
      @keyframes panelAppear {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    assistantPanel.appendChild(panelStyle);
    
    // 阻止面板内点击事件冒泡到 document
    assistantPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // 绑定事件
    const closeBtn = assistantPanel.querySelector('.panel-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideAssistantPanel();
    });
    
    const input = assistantPanel.querySelector('.panel-input');
    const resultDiv = assistantPanel.querySelector('.panel-result');
    const translateBtn = assistantPanel.querySelector('.panel-translate-btn');
    
    // 自动聚焦
    setTimeout(() => input.focus(), 100);
    
    // 翻译按钮点击
    translateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = input.value.trim();
      if (!text) return;
      
      resultDiv.innerHTML = '<p class="result-placeholder">翻译中...</p>';
      
      try {
        const result = await translateText(text);
        resultDiv.innerHTML = `
          <div class="result-with-copy">
            <p class="result-text">${escapeHtml(result.text)}</p>
            <button class="copy-result-btn" title="复制结果">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
              <span>复制</span>
            </button>
          </div>
        `;
        
        // 绑定复制按钮事件
        const copyBtn = resultDiv.querySelector('.copy-result-btn');
        copyBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          try {
            await navigator.clipboard.writeText(result.text);
            copyBtn.innerHTML = `
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              <span>已复制</span>
            `;
            copyBtn.style.color = '#34C759';
            setTimeout(() => {
              copyBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
                <span>复制</span>
              `;
              copyBtn.style.color = '#007AFF';
            }, 1500);
          } catch (err) {
            // 复制失败，忽略
          }
        });
      } catch (error) {
        resultDiv.innerHTML = `<p class="result-placeholder" style="color: #FF3B30;">${escapeHtml(error.message)}</p>`;
      }
    });
    
    // 回车键翻译（Shift+Enter 换行）
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        translateBtn.click();
      }
    });
    
    shadowRoot.appendChild(assistantPanel);
    
    // 点击面板外部关闭
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 100);
  }
  
  /**
   * 隐藏助手面板
   */
  function hideAssistantPanel() {
    if (assistantPanel) {
      assistantPanel.remove();
      assistantPanel = null;
    }
    document.removeEventListener('click', handleOutsideClick);
  }
  
  /**
   * 处理点击面板外部
   */
  function handleOutsideClick(e) {
    if (!assistantPanel) return;
    
    // 检查点击目标是否在面板或按钮内
    const clickPath = e.composedPath();
    const isInsidePanel = clickPath.includes(assistantPanel);
    const isInsideButton = clickPath.includes(assistantButton);
    
    if (!isInsidePanel && !isInsideButton) {
      hideAssistantPanel();
    }
  }
  
  // 初始化时创建助手按钮
  function initAssistant() {
    setTimeout(createAssistantButton, 1000);
  }

  init();
  initAssistant();
})();
