/**
 * Content Script - 划词翻译模块
 * 注入到每个网页，负责文本选择检测和悬浮卡片显示
 * 使用 Shadow DOM 实现完全的样式隔离
 */

(function() {
  'use strict';

  // ============================================
  // 配置常量
  // ============================================
  
  const CONFIG = {
    // 延迟显示时间（毫秒）- 避免干扰正常选择
    SHOW_DELAY: 300,
    
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

  // ============================================
  // Shadow DOM 容器
  // ============================================
  
  let shadowHost = null;
  let shadowRoot = null;
  let isInitialized = false;

  /**
   * 初始化 Shadow DOM
   * 创建一个完全隔离的 DOM 环境，避免与宿主网页样式冲突
   */
  function initShadowDOM() {
    if (isInitialized) return;
    
    // 创建 Shadow Host 元素
    shadowHost = document.createElement('div');
    shadowHost.id = 'minimal-translator-host';
    shadowHost.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 0 !important;
      height: 0 !important;
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
    console.log('[Translator Content] Shadow DOM initialized');
  }

  /**
   * 注入 CSS 样式到 Shadow DOM
   */
  function injectStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      /* ============================================
         Apple Design System Variables
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
        --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
        position: absolute;
        width: 32px;
        height: 32px;
        background: var(--bg-primary);
        border: none;
        border-radius: 50%;
        box-shadow: var(--shadow-md);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform var(--transition-fast), box-shadow var(--transition-fast);
        z-index: 1000;
        animation: buttonAppear var(--transition-normal);
      }

      .floating-button:hover {
        transform: scale(0.95);
        box-shadow: var(--shadow-lg);
      }

      .floating-button:active {
        transform: scale(0.9);
      }

      .floating-button svg {
        width: 16px;
        height: 16px;
        fill: var(--accent-blue);
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

  // ============================================
  // 状态管理
  // ============================================
  
  let currentSelection = null;      // 当前选中的文本
  let floatingButton = null;        // 悬浮按钮元素
  let translationCard = null;       // 翻译卡片元素
  let showButtonTimer = null;       // 显示按钮的定时器
  let lastMousePosition = { x: 0, y: 0 };  // 最后鼠标位置

  // ============================================
  // 事件监听
  // ============================================

  /**
   * 初始化内容脚本
   */
  function init() {
    // 等待页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initContentScript);
    } else {
      initContentScript();
    }
  }

  /**
   * 初始化内容脚本核心功能
   */
  function initContentScript() {
    initShadowDOM();
    
    // 监听鼠标释放事件（文本选择结束）
    document.addEventListener('mouseup', handleMouseUp, { passive: true });
    
    // 监听鼠标按下事件（开始新选择时隐藏旧元素）
    document.addEventListener('mousedown', handleMouseDown, { passive: true });
    
    // 监听键盘事件（ESC 关闭）
    document.addEventListener('keydown', handleKeyDown, { passive: true });
    
    // 监听窗口滚动（隐藏悬浮元素）
    window.addEventListener('scroll', hideAllElements, { passive: true });
    
    // 监听窗口大小改变
    window.addEventListener('resize', hideAllElements, { passive: true });
    
    console.log('[Translator Content] Initialized');
  }

  /**
   * 处理鼠标释放事件
   * @param {MouseEvent} e - 鼠标事件
   */
  function handleMouseUp(e) {
    // 如果点击在翻译元素内部，不处理
    if (isClickInsideTranslator(e.target)) {
      return;
    }
    
    // 保存鼠标位置
    lastMousePosition = { x: e.clientX, y: e.clientY };
    
    // 获取选中的文本
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // 检查文本是否有效
    if (!isValidText(selectedText)) {
      hideAllElements();
      return;
    }
    
    // 保存当前选择
    currentSelection = {
      text: selectedText,
      range: selection.getRangeAt(0)
    };
    
    // 延迟显示悬浮按钮（避免干扰正常选择操作）
    clearTimeout(showButtonTimer);
    showButtonTimer = setTimeout(() => {
      showFloatingButton(e.clientX, e.clientY);
    }, CONFIG.SHOW_DELAY);
  }

  /**
   * 处理鼠标按下事件
   * @param {MouseEvent} e - 鼠标事件
   */
  function handleMouseDown(e) {
    // 如果点击在翻译元素外部，隐藏所有元素
    if (!isClickInsideTranslator(e.target)) {
      hideAllElements();
    }
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

  /**
   * 显示悬浮翻译按钮
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   */
  function showFloatingButton(x, y) {
    // 先隐藏现有元素
    hideAllElements();
    
    // 创建按钮
    floatingButton = document.createElement('div');
    floatingButton.className = 'translator-container floating-button';
    floatingButton.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
    `;
    
    // 计算位置（防止超出视窗）
    const position = calculateButtonPosition(x, y);
    floatingButton.style.left = `${position.x}px`;
    floatingButton.style.top = `${position.y}px`;
    
    // 点击事件
    floatingButton.addEventListener('click', (e) => {
      e.stopPropagation();
      showTranslationCard(position.x, position.y);
    });
    
    shadowRoot.appendChild(floatingButton);
  }

  /**
   * 显示翻译结果卡片
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   */
  async function showTranslationCard(x, y) {
    // 隐藏按钮
    if (floatingButton) {
      floatingButton.remove();
      floatingButton = null;
    }
    
    // 创建卡片
    translationCard = document.createElement('div');
    translationCard.className = 'translator-container translation-card';
    
    // 计算位置
    const position = calculateCardPosition(x, y);
    translationCard.style.left = `${position.x}px`;
    translationCard.style.top = `${position.y}px`;
    
    // 初始显示加载状态
    translationCard.innerHTML = `
      <div class="loading">翻译中</div>
    `;
    
    shadowRoot.appendChild(translationCard);
    
    // 执行翻译
    try {
      const result = await translateText(currentSelection.text);
      renderTranslationCard(result);
    } catch (error) {
      renderError(error.message);
    }
  }

  /**
   * 渲染翻译结果卡片
   * @param {Object} result - 翻译结果
   */
  function renderTranslationCard(result) {
    const fromLang = result.source === 'zh' ? '中文' : 'English';
    const toLang = result.target === 'zh' ? '中文' : 'English';
    const fromCode = result.source === 'zh' ? 'ZH' : 'EN';
    const toCode = result.target === 'zh' ? 'ZH' : 'EN';
    
    translationCard.innerHTML = `
      <div class="card-header">
        <div class="language-indicator">
          <span class="lang-code">${fromCode}</span>
          <span class="arrow">→</span>
          <span class="lang-code">${toCode}</span>
        </div>
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
    translationCard.querySelector('.close-button').addEventListener('click', (e) => {
      e.stopPropagation();
      hideTranslationCard();
    });
    
    // 绑定复制按钮事件
    const copyButton = translationCard.querySelector('.copy-button');
    copyButton.addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyToClipboard(result.text, copyButton);
    });
  }

  /**
   * 渲染错误信息
   * @param {string} message - 错误消息
   */
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

  // ============================================
  // 位置计算
  // ============================================

  /**
   * 计算悬浮按钮位置（防止超出视窗）
   * @param {number} x - 鼠标 X 坐标
   * @param {number} y - 鼠标 Y 坐标
   * @returns {Object} - { x, y }
   */
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

  /**
   * 计算卡片位置（智能避让）
   * @param {number} x - 参考 X 坐标
   * @param {number} y - 参考 Y 坐标
   * @returns {Object} - { x, y }
   */
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

  // ============================================
  // 工具函数
  // ============================================

  /**
   * 翻译文本
   * @param {string} text - 待翻译文本
   * @returns {Promise} - 翻译结果
   */
  async function translateText(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'TRANSLATE',
          data: { text, from: 'auto', to: 'auto' }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * 复制文本到剪贴板
   * @param {string} text - 要复制的文本
   * @param {HTMLElement} button - 按钮元素（用于显示成功状态）
   */
  async function copyToClipboard(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      
      // 显示成功状态
      button.classList.add('success');
      button.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span>已复制</span>
      `;
      
      // 1.5 秒后恢复
      setTimeout(() => {
        button.classList.remove('success');
        button.innerHTML = `
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
          <span>复制</span>
        `;
      }, 1500);
    } catch (e) {
      console.error('[Translator] Copy failed:', e);
    }
  }

  /**
   * 检查文本是否有效
   * @param {string} text - 待检查文本
   * @returns {boolean} - 是否有效
   */
  function isValidText(text) {
    if (!text) return false;
    if (text.length < CONFIG.MIN_TEXT_LENGTH) return false;
    if (text.length > CONFIG.MAX_TEXT_LENGTH) return false;
    return true;
  }

  /**
   * 检查点击是否在翻译元素内部
   * @param {HTMLElement} target - 点击目标
   * @returns {boolean} - 是否在内部
   */
  function isClickInsideTranslator(target) {
    // 检查是否在 Shadow DOM 内
    const host = document.getElementById('minimal-translator-host');
    if (!host) return false;
    
    // 检查点击目标是否是 host 本身或是 host 内的元素
    return target === host || host.contains(target);
  }

  /**
   * 隐藏所有翻译元素
   */
  function hideAllElements() {
    clearTimeout(showButtonTimer);
    
    if (floatingButton) {
      floatingButton.remove();
      floatingButton = null;
    }
    
    hideTranslationCard();
    
    currentSelection = null;
  }

  /**
   * 隐藏翻译卡片（带动画）
   */
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

  /**
   * HTML 转义，防止 XSS
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
