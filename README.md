# 极简翻译 - Chrome 扩展

一款采用 Apple Design 风格的极简主义浏览器翻译插件，支持中英双向互译。

![版本](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## ✨ 特性

### 设计风格
- **Apple Design Philosophy**：纯白/浅灰背景，圆角 12-16px，微妙阴影
- **极简主义**：无广告、无多余按钮、充足留白
- **流畅动效**：200ms ease-out 平滑过渡，按钮悬停缩放效果

### 双模翻译系统
1. **划词翻译**
   - 选中任意网页文本，300ms 延迟弹出悬浮按钮
   - 智能位置避让，自动调整显示位置防止溢出
   - 点击页面其他区域或按 ESC 键关闭
   - 内置 500+ 常用词词典

2. **输入翻译**
   - 点击工具栏图标弹出 360×480px 面板
   - 500ms 防抖自动翻译
   - 最近 10 条翻译历史记录
   - 一键复制结果（带成功反馈动画）

### 技术亮点
- **Manifest V3** 标准架构
- **Shadow DOM** 100% 样式隔离，不影响原网页
- **Service Worker** 后台处理，轻量高效
- 原生 JavaScript，无外部依赖，体积 &lt; 200KB

## 📦 安装

### 方法一：开发者模式加载（推荐测试）

1. 下载本项目代码
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `chrome-translator` 文件夹
6. 安装完成！🎉

### 方法二：Chrome Web Store（待发布）

即将上架 Chrome Web Store，敬请期待。

## 🔧 配置外部翻译 API（可选）

本插件内置简易词典（约 500 常用词），如需更精准翻译，可配置外部 API：

### Google Translate API

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建项目并启用 **Cloud Translation API**
3. 创建 API Key
4. 打开 `background.js`，找到以下代码：

```javascript
const GOOGLE_API_KEY = ''; // 填入您的 API Key
```

5. 填入 API Key，并取消注释 `translateWithGoogle` 函数调用

### DeepL API

1. 访问 [DeepL Pro](https://www.deepl.com/pro-api) 获取 API Key
2. 打开 `background.js`，找到以下代码：

```javascript
const DEEPL_API_KEY = ''; // 填入您的 API Key
```

3. 填入 API Key，并取消注释 `translateWithDeepL` 函数调用

## 📁 文件结构

```
chrome-translator/
├── manifest.json          # 扩展配置（MV3）
├── background.js          # Service Worker，API 调用
├── content.js             # 划词翻译逻辑，Shadow DOM
├── content.css            # 全局样式覆盖
├── popup.html             # 输入翻译面板
├── popup.js               # 面板逻辑，防抖处理
├── popup.css              # 面板样式
├── icons/                 # 图标资源
│   ├── icon16.svg         # 工具栏图标
│   ├── icon48.svg         # 扩展页面图标
│   └── icon128.svg        # Chrome Store 图标
└── README.md              # 本文件
```

## 🎯 使用指南

### 划词翻译
1. 在任意网页选中需要翻译的文本
2. 等待 300ms，悬浮翻译按钮出现
3. 点击按钮，弹出翻译卡片
4. 查看翻译结果，点击「复制」可复制
5. 点击其他区域或按 ESC 关闭

### 输入翻译
1. 点击浏览器工具栏的「极简翻译」图标
2. 在输入框中输入要翻译的文本
3. 停止输入 500ms 后自动翻译
4. 点击语言切换按钮可切换翻译方向
5. 点击下方历史记录可快速复用

## ⚙️ 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 获取当前标签页内容进行翻译 |
| `storage` | 保存翻译历史记录和用户设置 |
| `scripting` | 在网页中注入翻译 UI |

## 🛠️ 开发

### 本地调试
1. 修改代码后，在 `chrome://extensions/` 点击刷新按钮
2. 查看 Console 获取调试信息

### 代码规范
- 所有 DOM 操作使用 Shadow DOM 隔离
- CSS 变量统一在 `:root` 中定义
- 关键代码需包含详细中文注释

## 📝 更新日志

### v1.0.0 (2024-03)
- ✅ 初始版本发布
- ✅ 划词翻译功能
- ✅ 输入翻译面板
- ✅ Apple Design 风格 UI
- ✅ 内置简易词典
- ✅ 翻译历史记录

## 🤝 贡献

欢迎提交 Issue 和 PR！

## 📄 许可证

MIT License © 2024 极简翻译
