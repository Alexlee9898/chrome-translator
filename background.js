/**
 * background.js - Service Worker
 * 跨域翻译 API、存储与消息中转
 */

const API_CONFIG = {
  timeout: 12000,
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-3.5-turbo' },
  claude: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-haiku-20240307' },
  google: { endpoint: 'https://translation.googleapis.com/language/translate/v2' },
  kimi: { endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'kimi-k2.5' },
  qwen: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo' },
  glm: { endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' }
};

const STORAGE_KEYS = { SETTINGS: 'settings', HISTORY: 'history', CACHE: 'translationCache' };

// ==========================================
// 初始化
// ==========================================

/**
 * 扩展安装/更新时初始化
 */
chrome.runtime.onInstalled.addListener(() => {
  initializeSettings();
  cleanExpiredCache();
});

async function initializeSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    if (!result[STORAGE_KEYS.SETTINGS]) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.SETTINGS]: {
          service: 'kimi',
          historyLimit: 10,
          apiKeys: { openai: '', claude: '', google: '', kimi: '', qwen: '', glm: '' }
        }
      });
    }
  } catch (e) {
    console.error('[Background] 初始化设置失败:', e);
  }
}

// ==========================================
// 消息处理中心
// ==========================================

/**
 * 监听来自内容脚本和弹出窗口的消息
 * 实现安全的消息中转机制
 */
const MESSAGE_HANDLERS = {
  translate: (data) => handleTranslate(data),
  detectLanguage: (data) => handleDetectLanguage(data),
  getSettings: () => handleGetSettings(),
  saveSettings: (data) => handleSaveSettings(data),
  getHistory: () => handleGetHistory(),
  saveHistory: (data) => handleSaveHistory(data),
  clearHistory: () => handleClearHistory(),
  clearCache: () => handleClearCache()
};

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[request.action];
  const promise = handler ? handler(request.data) : Promise.resolve({ success: false, error: `未知操作: ${request.action}` });
  promise.then(sendResponse).catch((e) => {
    console.error('[Background]', e);
    sendResponse({ success: false, error: e.message });
  });
  return true;
});

async function handleTranslate({ text, sourceLang, targetLang }) {
  try {
    const cleanText = (text || '').trim();
    if (!cleanText) return { success: false, error: '文本不能为空' };

    const cached = await getCachedTranslation(cleanText, sourceLang, targetLang);
    if (cached) return { success: true, data: cached, fromCache: true };

    const { [STORAGE_KEYS.SETTINGS]: st = {} } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const service = st.service || 'kimi';
    const translators = { openai: translateWithOpenAI, claude: translateWithClaude, google: translateWithGoogle, kimi: translateWithKimi, qwen: translateWithQwen, glm: translateWithGLM };
    const fn = translators[service];
    const result = fn ? await fn(cleanText, sourceLang, targetLang, st) : { success: false, error: '请先在设置中选择翻译服务并填写 API Key' };

    if (result.success) await cacheTranslation(cleanText, sourceLang, targetLang, result.data);
    return result;
  } catch (e) {
    console.error('[Background] 翻译失败:', e);
    return { success: false, error: e.message };
  }
}

function getApiKey(settings, service) {
  return ((settings?.apiKeys || {})[service] || '').trim();
}

function buildTranslatePrompt(text, targetLang) {
  if (targetLang === 'auto') return `若以下内容为中文则翻译成英文，若为英文则翻译成中文。只输出翻译结果，不要解释。\n\n${text}`;
  const toLang = targetLang?.startsWith('zh') ? '简体中文' : '英文';
  return `请将以下内容翻译成${toLang}，只输出翻译结果，不要解释。\n\n${text}`;
}

function detectSourceLang(text) { return /\p{Script=Han}/u.test(text) ? 'zh-CN' : 'en'; }
function getTargetLangForAuto(sourceLang) { return sourceLang?.startsWith('zh') ? 'en' : 'zh-CN'; }

function makeLLMResult(text, translated, sourceLang, targetLang, service) {
  const detected = sourceLang || detectSourceLang(text);
  const resolvedTarget = targetLang === 'auto' ? getTargetLangForAuto(detected) : (targetLang || 'zh-CN');
  return { success: true, data: { originalText: text, translatedText: translated, sourceLang: detected, targetLang: resolvedTarget, service } };
}

/** OpenAI 兼容接口：POST JSON，响应为 choices[0].message.content */
async function callOpenAIStyleAPI(endpoint, model, apiKey, prompt) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1000 })
  });
  if (!res.ok) throw new Error((await res.text()) || `API ${res.status}`);
  const data = await res.json();
  const translated = data.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error('无效响应');
  return translated;
}

async function translateWithOpenAI(text, sourceLang, targetLang, settings) {
  const apiKey = getApiKey(settings, 'openai');
  if (!apiKey) return { success: false, error: '请在设置中填写 OpenAI API Key' };
  try {
    const translated = await callOpenAIStyleAPI(API_CONFIG.openai.endpoint, API_CONFIG.openai.model, apiKey, buildTranslatePrompt(text, targetLang));
    return makeLLMResult(text, translated, sourceLang, targetLang, 'openai');
  } catch (e) {
    return { success: false, error: e.message || 'OpenAI 翻译失败' };
  }
}

async function translateWithClaude(text, sourceLang, targetLang, settings) {
  const apiKey = getApiKey(settings, 'claude');
  if (!apiKey) return { success: false, error: '请在设置中填写 Claude API Key' };
  try {
    const res = await fetch(API_CONFIG.claude.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: API_CONFIG.claude.model, max_tokens: 1000, messages: [{ role: 'user', content: buildTranslatePrompt(text, targetLang) }] })
    });
    if (!res.ok) throw new Error((await res.text()) || `API ${res.status}`);
    const block = (await res.json()).content?.find(b => b.type === 'text');
    const translated = block?.text?.trim();
    if (!translated) throw new Error('无效响应');
    return makeLLMResult(text, translated, sourceLang, targetLang, 'claude');
  } catch (e) {
    return { success: false, error: e.message || 'Claude 翻译失败' };
  }
}

async function translateWithGoogle(text, sourceLang, targetLang, settings) {
  const apiKey = getApiKey(settings, 'google');
  if (!apiKey) return { success: false, error: '请在设置中填写 Google 翻译 API Key' };
  const detected = sourceLang || detectSourceLang(text);
  const resolvedTarget = targetLang === 'auto' ? getTargetLangForAuto(detected) : (targetLang || 'zh-CN');
  try {
    const url = new URL(API_CONFIG.google.endpoint);
    url.searchParams.set('key', apiKey); url.searchParams.set('q', text); url.searchParams.set('target', resolvedTarget); url.searchParams.set('format', 'text');
    if (detected) url.searchParams.set('source', detected);
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error((await res.text()) || `API ${res.status}`);
    const t = (await res.json()).data?.translations?.[0];
    if (!t) throw new Error('无效响应');
    const finalSource = t.detectedSourceLanguage || detected || 'en';
    return { success: true, data: { originalText: text, translatedText: t.translatedText, sourceLang: finalSource, targetLang: resolvedTarget, service: 'google' } };
  } catch (e) {
    return { success: false, error: e.message || 'Google 翻译失败' };
  }
}

async function translateWithKimi(text, sourceLang, targetLang, settings) {
  const cleanedKey = (getApiKey(settings, 'kimi') || '').replace(/\s/g, '');
  if (!cleanedKey) return { success: false, error: '请在设置中填写 Kimi API Key' };
  if (!cleanedKey.startsWith('sk-')) return { success: false, error: 'Kimi API Key 格式错误，应以 sk- 开头' };
  try {
    const translated = await callOpenAIStyleAPI(API_CONFIG.kimi.endpoint, API_CONFIG.kimi.model, cleanedKey, buildTranslatePrompt(text, targetLang));
    return makeLLMResult(text, translated, sourceLang, targetLang, 'kimi');
  } catch (e) {
    const msg = e.message || '';
    if (e.message && (msg.includes('401') || msg.includes('Authentication'))) return { success: false, error: 'Kimi API Key 无效，请检查 Key 是否正确或已过期' };
    if (msg.includes('429')) return { success: false, error: '请求过于频繁，请稍后再试' };
    if (msg.includes('402') || msg.includes('balance') || msg.includes('credit')) return { success: false, error: 'Kimi 账户余额不足，请前往官网充值' };
    return { success: false, error: e.message || 'Kimi 翻译失败' };
  }
}

async function translateWithQwen(text, sourceLang, targetLang, settings) {
  const apiKey = getApiKey(settings, 'qwen');
  if (!apiKey) return { success: false, error: '请在设置中填写 Qwen API Key' };
  try {
    const translated = await callOpenAIStyleAPI(API_CONFIG.qwen.endpoint, API_CONFIG.qwen.model, apiKey, buildTranslatePrompt(text, targetLang));
    return makeLLMResult(text, translated, sourceLang, targetLang, 'qwen');
  } catch (e) {
    return { success: false, error: e.message || 'Qwen 翻译失败' };
  }
}

async function translateWithGLM(text, sourceLang, targetLang, settings) {
  const apiKey = getApiKey(settings, 'glm');
  if (!apiKey) return { success: false, error: '请在设置中填写 GLM 智谱 API Key' };
  try {
    const translated = await callOpenAIStyleAPI(API_CONFIG.glm.endpoint, API_CONFIG.glm.model, apiKey, buildTranslatePrompt(text, targetLang));
    return makeLLMResult(text, translated, sourceLang, targetLang, 'glm');
  } catch (e) {
    return { success: false, error: e.message || 'GLM 翻译失败' };
  }
}

async function handleDetectLanguage({ text }) {
  try {
    if (!(text || '').trim()) return { success: false, error: '文本不能为空' };
    if (chrome.i18n?.detectLanguage) {
      const result = await chrome.i18n.detectLanguage(text);
      const top = result.languages?.sort((a, b) => b.percentage - a.percentage)[0];
      if (top) return { success: true, data: { language: top.language, confidence: top.percentage, isReliable: result.isReliable } };
    }
    const isChinese = /[\u4e00-\u9fa5]/.test(text);
    return { success: true, data: { language: isChinese ? 'zh-CN' : (/^[a-zA-Z\s]+$/.test(text) ? 'en' : 'unknown'), confidence: 80, isReliable: false } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;
function generateCacheKey(text, sourceLang, targetLang) {
  let h = 0;
  const s = `${text}:${sourceLang}:${targetLang}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `cache_${h}`;
}

async function getCachedTranslation(text, sourceLang, targetLang) {
  try {
    const { [STORAGE_KEYS.CACHE]: cache = {} } = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    const entry = cache[generateCacheKey(text, sourceLang, targetLang)];
    return entry && (Date.now() - entry.timestamp < CACHE_EXPIRY_MS) ? entry.data : null;
  } catch (_) { return null; }
}

async function cacheTranslation(text, sourceLang, targetLang, data) {
  try {
    const { [STORAGE_KEYS.CACHE]: cache = {} } = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    const keys = Object.keys(cache);
    if (keys.length >= 100) delete cache[keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp)[0]];
    cache[generateCacheKey(text, sourceLang, targetLang)] = { data, timestamp: Date.now() };
    await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: cache });
  } catch (_) {}
}

async function cleanExpiredCache() {
  try {
    const { [STORAGE_KEYS.CACHE]: cache = {} } = await chrome.storage.local.get(STORAGE_KEYS.CACHE);
    const now = Date.now();
    for (const k of Object.keys(cache)) if (now - cache[k].timestamp > CACHE_EXPIRY_MS) delete cache[k];
    await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: cache });
  } catch (_) {}
}

async function handleGetSettings() {
  try {
    const { [STORAGE_KEYS.SETTINGS]: data } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message }; }
}

async function handleSaveSettings(data) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: data });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function handleGetHistory() {
  try {
    const { [STORAGE_KEYS.HISTORY]: list = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    return { success: true, data: list };
  } catch (e) { return { success: false, error: e.message }; }
}

async function handleSaveHistory(data) {
  try {
    if (data?.clear) { await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] }); return { success: true }; }
    const { [STORAGE_KEYS.HISTORY]: history = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    history.unshift({ ...data, timestamp: Date.now() });
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history.slice(0, 10) });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function handleClearHistory() {
  try { await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] }); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
}

async function handleClearCache() {
  try { await chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: {} }); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
}

chrome.alarms?.create?.('cleanCache', { periodInMinutes: 60 });
chrome.alarms?.onAlarm?.addListener((a) => { if (a.name === 'cleanCache') cleanExpiredCache(); });