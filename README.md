# 极简翻译 - Chrome 扩展

一款极简主义浏览器翻译插件，支持中英双向互译。

![版本](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## ✨ 特性

### 设计风格
- **极简界面**：纯白/浅灰背景，圆角 12-16px，微妙阴影
- **无广告、无多余按钮、充足留白**
- **流畅动效**：200ms ease-out 平滑过渡，按钮悬停缩放效果

### 双模翻译系统
1. **划词翻译**
   - 选中任意网页文本，100ms 延迟弹出悬浮按钮
   - 智能位置避让，自动调整显示位置防止溢出
   - 点击页面其他区域或按 ESC 键关闭
   - Shadow DOM 完全样式隔离，不影响原网页

2. **输入翻译**
   - 点击工具栏图标弹出 360×480px 面板
   - 50ms 极速防抖自动翻译
   - 最近 10 条翻译历史记录
   - 一键复制结果（带成功反馈动画）
   - 支持多种翻译服务切换

### 支持的翻译服务
- **Kimi (Moonshot)** - 推荐，Kimi K2.5 模型
- **OpenAI (GPT)** - GPT-3.5-turbo
- **Claude (Anthropic)** - Claude 3 Haiku
- **Google 翻译** - Google Translate API
- **Qwen (通义千问)** - 阿里云大模型
- **GLM (智谱)** - 智谱 AI 大模型

### 技术亮点
- **Manifest V3** 标准架构
- **Shadow DOM** 100% 样式隔离，不影响原网页
- **Service Worker** 后台处理，轻量高效
- 原生 JavaScript，无外部依赖，体积 < 200KB

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

## 🔧 配置翻译服务与 API Key

翻译依赖所选大模型/翻译服务的 API，需在插件内选择服务并填写对应 API Key：

1. 点击浏览器工具栏的「极简翻译」图标，打开翻译面板
2. 展开底部 **「设置 · 翻译服务与 API」**
3. 在「翻译服务」下拉框中选择服务
4. 在 **API Key** 输入框中填入该服务的密钥
5. 点击 **「保存设置」**

支持的翻译服务与获取方式：

| 服务 | 说明与获取 |
|------|------------|
| **Kimi (Moonshot)** | [Moonshot 开放平台](https://platform.moonshot.cn/) 获取 API Key，推荐 |
| **OpenAI (GPT)** | [API Keys](https://platform.openai.com/api-keys) 创建密钥，按量计费 |
| **Claude (Anthropic)** | [Console](https://console.anthropic.com/) 创建 API Key |
| **Google 翻译** | [Google Cloud Console](https://console.cloud.google.com/) 启用 Cloud Translation API 并创建密钥 |
| **Qwen (通义千问)** | [阿里云 DashScope](https://dashscope.console.aliyun.com/) 创建 API Key |
| **GLM (智谱)** | [智谱开放平台](https://open.bigmodel.cn/) 获取 API Key |

API Key 仅保存在本机扩展存储中，不会上传到任何服务器。

## 📁 文件结构

```
chrome-translator/
├── manifest.json          # 扩展配置（MV3）
├── background.js          # Service Worker，API 调用与缓存
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
2. 等待 100ms，悬浮翻译按钮出现（蓝色圆形图标）
3. 点击按钮，弹出翻译卡片
4. 查看翻译结果，点击「复制」可复制
5. 点击其他区域或按 ESC 关闭

### 输入翻译
1. 点击浏览器工具栏的「极简翻译」图标
2. 在输入框中输入要翻译的文本
3. 停止输入 50ms 后自动翻译
4. 点击语言切换按钮（🔃）可切换翻译方向：自动检测 → 中译英 → 英译中
5. 点击下方历史记录可快速复用

### 语言切换
- **自动检测**：自动识别输入语言并翻译成对应语言
- **中译英**：固定将中文翻译成英文
- **英译中**：固定将英文翻译成中文

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
3. 划词翻译日志在网页控制台，输入翻译日志在 Service Worker 控制台

### 代码规范
- 所有 DOM 操作使用 Shadow DOM 隔离
- CSS 变量统一在 `:root` 中定义
- 关键代码需包含详细中文注释

## 📝 更新日志

### v1.0.0 (2024-03)
- ✅ 初始版本发布
- ✅ 划词翻译功能（100ms 延迟）
- ✅ 输入翻译面板（50ms 防抖）
- ✅ 极简风格 UI
- ✅ 支持 6 种翻译服务（Kimi、OpenAI、Claude、Google、Qwen、GLM）
- ✅ 翻译历史记录
- ✅ 翻译结果缓存
- ✅ 语言自动检测与切换

## 🤝 贡献

欢迎提交 Issue 和 PR！

## 📄 许可证

MIT License © 2024 极简翻译
