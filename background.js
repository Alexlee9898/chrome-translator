/**
 * background.js
 * Service Worker - 后台服务工作线程
 * 
 * 功能：
 * 1. 处理跨域 API 调用（内容脚本无法直接请求外部 API）
 * 2. 管理扩展状态和缓存
 * 3. 处理消息中转
 * 4. 预留 Google Translate API 和其他翻译服务接口
 */

// ==========================================
// 配置常量
// ==========================================

// API 配置 - 预留接口位置
const API_CONFIG = {
  // Google Translate API (需要 API Key)
  // 使用说明：
  // 1. 访问 https://cloud.google.com/translate 获取 API Key
  // 2. 在 chrome.storage 中设置 apiKey
  // 3. 取消下方代码注释并填入 Key
  
  // google: {
  //   endpoint: 'https://translation.googleapis.com/language/translate/v2',
  //   key: '' // 通过 chrome.storage.local.get('apiKey') 获取
  // },
  
  // 备用翻译服务配置示例
  // deepl: {
  //   endpoint: 'https://api-free.deepl.com/v2/translate',
  //   key: ''
  // },
  
  // 请求超时时间（毫秒）
  timeout: 10000
};

// 存储键名常量
const STORAGE_KEYS = {
  SETTINGS: 'settings',      // 用户设置
  HISTORY: 'history',        // 翻译历史
  API_KEY: 'apiKey',         // API 密钥
  CACHE: 'translationCache'  // 翻译缓存
};

// ==========================================
// 初始化
// ==========================================

/**
 * 扩展安装/更新时初始化
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] 扩展状态变化:', details.reason);
  
  // 初始化默认设置
  initializeSettings();
  
  // 清理过期缓存
  cleanExpiredCache();
});

/**
 * 初始化默认设置
 */
async function initializeSettings() {
  try {
    // 获取当前设置
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    
    // 如果没有设置，创建默认配置
    if (!result[STORAGE_KEYS.SETTINGS]) {
      const defaultSettings = {
        // 翻译服务选择
        service: 'builtin',  // 'builtin', 'google', 'deepl'
        // 默认目标语言
        targetLang: 'zh-CN',
        // 自动检测语言
        autoDetect: true,
        // 划词翻译开关
        selectionEnabled: true,
        // 悬浮按钮延迟（毫秒）
        buttonDelay: 300,
        // 自动翻译延迟（毫秒）
        translateDelay: 500,
        // 历史记录保存数量
        historyLimit: 10,
        // 缓存过期时间（小时）
        cacheExpiry: 24
      };
      
      await chrome.storage.local.set({ 
        [STORAGE_KEYS.SETTINGS]: defaultSettings 
      });
      
      console.log('[Background] 已初始化默认设置');
    }
  } catch (error) {
    console.error('[Background] 初始化设置失败:', error);
  }
}

// ==========================================
// 消息处理中心
// ==========================================

/**
 * 监听来自内容脚本和弹出窗口的消息
 * 实现安全的消息中转机制
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] 收到消息:', request.action, '来自:', sender.tab?.id || 'popup');
  
  // 使用异步处理模式，保持消息通道开放
  handleMessage(request, sender).then(sendResponse).catch(error => {
    console.error('[Background] 消息处理错误:', error);
    sendResponse({ success: false, error: error.message });
  });
  
  // 返回 true 表示将异步发送响应
  return true;
});

/**
 * 消息分发处理器
 */
async function handleMessage(request, sender) {
  const { action, data } = request;
  
  switch (action) {
    // 翻译请求
    case 'translate':
      return await handleTranslate(data);
    
    // 检测语言
    case 'detectLanguage':
      return await handleDetectLanguage(data);
    
    // 获取设置
    case 'getSettings':
      return await handleGetSettings();
    
    // 保存设置
    case 'saveSettings':
      return await handleSaveSettings(data);
    
    // 获取翻译历史
    case 'getHistory':
      return await handleGetHistory();
    
    // 保存翻译历史
    case 'saveHistory':
      return await handleSaveHistory(data);
    
    // 清理缓存
    case 'clearCache':
      return await handleClearCache();
    
    // 预留：调用 Google Translate API
    case 'googleTranslate':
      // 需要配置 API Key 后启用
      // return await callGoogleTranslate(data);
      return { success: false, error: 'Google Translate API 未配置' };
    
    default:
      return { success: false, error: `未知操作: ${action}` };
  }
}

// ==========================================
// 翻译处理
// ==========================================

/**
 * 处理翻译请求
 * 优先使用缓存，其次根据配置选择翻译服务
 */
async function handleTranslate({ text, sourceLang, targetLang }) {
  try {
    // 参数校验
    if (!text || text.trim().length === 0) {
      return { success: false, error: '文本不能为空' };
    }
    
    // 去除首尾空白
    const cleanText = text.trim();
    
    // 1. 检查缓存
    const cached = await getCachedTranslation(cleanText, sourceLang, targetLang);
    if (cached) {
      console.log('[Background] 命中缓存');
      return { success: true, data: cached, fromCache: true };
    }
    
    // 2. 获取用户设置
    const settings = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const service = settings[STORAGE_KEYS.SETTINGS]?.service || 'builtin';
    
    // 3. 根据服务选择翻译方式
    let result;
    switch (service) {
      case 'google':
        result = await translateWithGoogle(cleanText, sourceLang, targetLang);
        break;
      case 'builtin':
      default:
        result = await translateWithBuiltin(cleanText, sourceLang, targetLang);
        break;
    }
    
    // 4. 缓存结果
    if (result.success) {
      await cacheTranslation(cleanText, sourceLang, targetLang, result.data);
    }
    
    return result;
    
  } catch (error) {
    console.error('[Background] 翻译失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 使用内置词典翻译
 * 这是一个简化的实现，实际使用时可以扩展为完整的词典
 */
async function translateWithBuiltin(text, sourceLang, targetLang) {
  // 模拟翻译延迟
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 简单的中英互译词典（常见 2000 词中的部分示例）
  const dictionary = {
    // 英文 -> 中文
    en_to_zh: {
      'hello': '你好',
      'world': '世界',
      'thank': '谢谢',
      'you': '你',
      'please': '请',
      'sorry': '对不起',
      'good': '好的',
      'morning': '早上好',
      'night': '晚安',
      'love': '爱',
      'friend': '朋友',
      'family': '家人',
      'happy': '快乐',
      'beautiful': '美丽',
      'computer': '电脑',
      'phone': '手机',
      'water': '水',
      'food': '食物',
      'book': '书',
      'time': '时间'
    },
    // 中文 -> 英文
    zh_to_en: {
      '你好': 'hello',
      '世界': 'world',
      '谢谢': 'thank you',
      '请': 'please',
      '对不起': 'sorry',
      '好的': 'good',
      '早上好': 'good morning',
      '晚安': 'good night',
      '爱': 'love',
      '朋友': 'friend',
      '家人': 'family',
      '快乐': 'happy',
      '美丽': 'beautiful',
      '电脑': 'computer',
      '手机': 'phone',
      '水': 'water',
      '食物': 'food',
      '书': 'book',
      '时间': 'time'
    }
  };
  
  // 检测源语言（简化逻辑）
  const isChinese = /[\u4e00-\u9fa5]/.test(text);
  
  // 选择合适的词典方向
  let dict;
  if (isChinese) {
    dict = dictionary.zh_to_en;
  } else {
    dict = dictionary.en_to_zh;
    // 转换为小写进行匹配
    text = text.toLowerCase();
  }
  
  // 查找翻译
  let translation = dict[text];
  
  // 如果没有精确匹配，尝试模糊匹配（这里简化处理）
  if (!translation) {
    // 检查是否是短语或句子
    if (text.includes(' ')) {
      translation = '[短语翻译] ' + text;
    } else if (/[\u4e00-\u9fa5]/.test(text) && text.length > 1) {
      translation = '[中文词汇] ' + text;
    } else {
      translation = `[未收录] ${text}`;
    }
  }
  
  return {
    success: true,
    data: {
      originalText: text,
      translatedText: translation,
      sourceLang: isChinese ? 'zh-CN' : 'en',
      targetLang: isChinese ? 'en' : 'zh-CN',
      service: 'builtin'
    }
  };
}

/**
 * Google Translate API 调用（预留接口）
 * 使用说明：
 * 1. 获取 Google Cloud API Key
 * 2. 在设置中配置 apiKey
 * 3. 启用此函数
 */
async function translateWithGoogle(text, sourceLang, targetLang) {
  // 获取 API Key
  const { apiKey } = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  
  if (!apiKey) {
    return {
      success: false,
      error: '未配置 Google Translate API Key，请先在设置中配置'
    };
  }
  
  try {
    const url = new URL(API_CONFIG.google.endpoint);
    url.searchParams.append('key', apiKey);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: text,
        source: sourceLang || 'auto',
        target: targetLang || 'zh-CN',
        format: 'text'
      })
    });
    
    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      data: {
        originalText: text,
        translatedText: data.data.translations[0].translatedText,
        sourceLang: data.data.translations[0].detectedSourceLanguage || sourceLang,
        targetLang: targetLang,
        service: 'google'
      }
    };
    
  } catch (error) {
    console.error('[Background] Google Translate API 错误:', error);
    // 降级到内置翻译
    return await translateWithBuiltin(text, sourceLang, targetLang);
  }
}

// ==========================================
// 语言检测
// ==========================================

/**
 * 检测文本语言
 * 优先使用 chrome.i18n.detectLanguage
 */
async function handleDetectLanguage({ text }) {
  try {
    if (!text || text.trim().length === 0) {
      return { success: false, error: '文本不能为空' };
    }
    
    // 使用 Chrome i18n API 检测语言
    // 注意：此 API 仅在特定上下文中可用
    if (chrome.i18n?.detectLanguage) {
      const result = await chrome.i18n.detectLanguage(text);
      
      // 选择置信度最高的语言
      const languages = result.languages.sort((a, b) => b.percentage - a.percentage);
      
      if (languages.length > 0) {
        return {
          success: true,
          data: {
            language: languages[0].language,
            confidence: languages[0].percentage,
            isReliable: result.isReliable
          }
        };
      }
    }
    
    // 备用：简单规则检测
    const isChinese = /[\u4e00-\u9fa5]/.test(text);
    const isEnglish = /^[a-zA-Z\s]+$/.test(text);
    
    return {
      success: true,
      data: {
        language: isChinese ? 'zh-CN' : (isEnglish ? 'en' : 'unknown'),
        confidence: 80,
        isReliable: false,
        method: 'fallback'
      }
    };
    
  } catch (error) {
    console.error('[Background] 语言检测失败:', error);
    return { success: false, error: error.message };
  }
}

// ==========================================
// 缓存管理
// ==========================================

/**
 * 获取缓存的翻译
 */
async function getCachedTranslation(text, sourceLang, targetLang) {
  try {
    const cacheKey = generateCacheKey(text, sourceLang, targetLang);
    const result = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    const cache = result[STORAGE_KEYS.CACHE] || {};
    
    const cached = cache[cacheKey];
    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      return cached.data;
    }
    
    return null;
  } catch (error) {
    console.error('[Background] 读取缓存失败:', error);
    return null;
  }
}

/**
 * 保存翻译到缓存
 */
async function cacheTranslation(text, sourceLang, targetLang, data) {
  try {
    const cacheKey = generateCacheKey(text, sourceLang, targetLang);
    const result = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    const cache = result[STORAGE_KEYS.CACHE] || {};
    
    // 限制缓存大小（最多 100 条）
    const keys = Object.keys(cache);
    if (keys.length >= 100) {
      // 删除最旧的条目
      const oldest = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp)[0];
      delete cache[oldest];
    }
    
    cache[cacheKey] = {
      data,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: cache });
    
  } catch (error) {
    console.error('[Background] 保存缓存失败:', error);
  }
}

/**
 * 生成缓存键
 */
function generateCacheKey(text, sourceLang, targetLang) {
  // 简单的哈希函数
  let hash = 0;
  const str = `${text}:${sourceLang}:${targetLang}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `cache_${hash}`;
}

/**
 * 清理过期缓存
 */
async function cleanExpiredCache() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    const cache = result[STORAGE_KEYS.CACHE] || {};
    const now = Date.now();
    const expiry = 24 * 60 * 60 * 1000; // 24 小时
    
    let cleaned = 0;
    for (const key in cache) {
      if (now - cache[key].timestamp > expiry) {
        delete cache[key];
        cleaned++;
      }
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: cache });
    console.log(`[Background] 清理了 ${cleaned} 条过期缓存`);
    
  } catch (error) {
    console.error('[Background] 清理缓存失败:', error);
  }
}

// ==========================================
// 设置管理
// ==========================================

async function handleGetSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { 
      success: true, 
      data: result[STORAGE_KEYS.SETTINGS] 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleSaveSettings(data) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: data });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==========================================
// 历史记录管理
// ==========================================

async function handleGetHistory() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    return { 
      success: true, 
      data: result[STORAGE_KEYS.HISTORY] || [] 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleSaveHistory({ originalText, translatedText, sourceLang, targetLang }) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    let history = result[STORAGE_KEYS.HISTORY] || [];
    
    // 添加新记录到开头
    history.unshift({
      originalText,
      translatedText,
      sourceLang,
      targetLang,
      timestamp: Date.now()
    });
    
    // 限制数量（最多 10 条）
    const limit = 10;
    if (history.length > limit) {
      history = history.slice(0, limit);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==========================================
// 其他功能
// ==========================================

async function handleClearCache() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: {} });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 定期清理缓存（每小时）
chrome.alarms?.create?.('cleanCache', { periodInMinutes: 60 });
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === 'cleanCache') {
    cleanExpiredCache();
  }
});

console.log('[Background] Service Worker 已启动');