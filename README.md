# Organic Notes

> 让阅读与思考自然生长

一个优雅的微信公众号文章摘录与思考工具，灵感来源于《Kinfolk》、《Cereal》等生活方式杂志的设计语言。

## 项目介绍

Organic Notes 是一个极简而功能强大的微信公众号文章摘录工具。它不仅仅是一个内容抓取器，更是一个让阅读与思考自然生长的空间。用户可以轻松抓取微信公众号文章，在浏览原文的同时，摘录精彩片段，记录自己的思考，并支持多种格式导出。

### 核心特性

- **智能文章抓取**：粘贴微信公众号链接，一键抓取文章内容
- **双标签页设计**：原文内容与思考记录并排，无缝切换
- **富文本编辑器**：支持标题、加粗、斜体、列表、高亮等格式化
- **智能摘录**：支持文本和图片摘录，一键添加到笔记
- **拖拽排序**：笔记块可自由拖拽排序，灵活组织内容
- **多格式导出**：支持长图、Word、PDF、Markdown（适配飞书）
- **自动保存**：笔记内容实时保存到本地存储，永不丢失
- **响应式设计**：完美适配桌面端和移动端

## 项目架构

### 技术栈

- **前端框架**：原生 JavaScript（Vanilla JS），无依赖框架
- **样式方案**：原生 CSS3，使用 CSS 变量实现主题管理
- **数据存储**：浏览器 localStorage，实现数据持久化
- **第三方库**：
  - `marked` - Markdown 解析器
  - `html-to-image` - 长图生成
  - `html-docx-js` - Word 文档导出
  - `FileSaver.js` - 文件下载
  - `turndown` - HTML 转 Markdown
  - `SortableJS` - 拖拽排序
  - `Font Awesome` - 图标库

### 目录结构

```
notes/
├── index.html          # 主页面
├── styles.css          # 主样式文件
├── print.css           # 打印样式（PDF导出）
├── script.js           # 核心逻辑
├── mock_data.js       # 模拟数据（可选）
└── README.md           # 项目文档
```

### 应用架构

采用单页面应用（SPA）架构，基于视图切换实现页面导航：

```
┌─────────────────────────────────────────┐
│         Application (app)           │
│  ┌────────────────────────────┐    │
│  │  State Management        │    │
│  │  - articles[]           │    │
│  │  - currentArticle        │    │
│  │  - currentNoteKey       │    │
│  │  - selectionRange        │    │
│  │  - selectedImage         │    │
│  └────────────────────────────┘    │
│                                   │
│  ┌────────────────────────────┐    │
│  │  View Management        │    │
│  │  - view-home            │    │
│  │  - view-article         │    │
│  └────────────────────────────┘    │
│                                   │
│  ┌────────────────────────────┐    │
│  │  Core Modules          │    │
│  │  - Crawler              │    │
│  │  - Editor               │    │
│  │  - Exporter             │    │
│  │  - Storage              │    │
│  └────────────────────────────┘    │
└─────────────────────────────────────────┘
```

## 功能流程

### 1. 文章抓取流程

```
用户输入微信链接
    ↓
点击抓取按钮
    ↓
调用云函数 API (Unifuncs/302.ai)
    ↓
解析返回内容（标题、封面、Markdown）
    ↓
保存到 localStorage
    ↓
渲染文章卡片
    ↓
自动跳转到文章详情页
```

### 2. 阅读与摘录流程

```
浏览原文内容
    ↓
选择文本或图片
    ↓
显示摘录按钮（Popover）
    ↓
点击摘录
    ↓
添加到笔记编辑器
    ↓
自动保存到 localStorage
```

### 3. 笔记编辑流程

```
在富文本编辑器中编辑
    ↓
使用工具栏格式化（H1/H2/H3/加粗/斜体/列表/高亮）
    ↓
拖拽排序笔记块
    ↓
实时自动保存（防抖 1s）
    ↓
切换到其他文章时停止保存
```

### 4. 导出流程

```
选择导出格式
    ↓
├─ 长图：使用 html-to-image 生成 PNG
├─ Word：使用 html-docx-js 生成 .docx
├─ PDF：使用 print.css + window.print()
└─ Markdown：使用 turndown 转换，适配飞书语法
    ↓
触发下载
```

## 技术亮点

### 1. 微信图片防盗链解决方案

**问题**：微信公众号图片（mmbiz.qpic.cn）有防盗链机制，直接引用会导致图片无法显示。

**解决方案**：
- 使用 `weserv.nl` 图片代理服务
- 自动检测微信图片链接并添加代理前缀
- 在导出长图、Word、Markdown 时统一处理

```javascript
// 图片代理逻辑
if (src && (src.includes('mmbiz.qpic.cn') || src.includes('qlogo.cn'))) {
    if (!src.includes('images.weserv.nl')) {
        src = 'https://images.weserv.nl/?url=' + encodeURIComponent(src);
    }
}
```

### 2. 富文本编辑器实现

使用 `contenteditable` 属性实现富文本编辑，配合 `document.execCommand` API：

```javascript
// 格式化命令
document.execCommand('bold', false, null);
document.execCommand('italic', false, null);
document.execCommand('formatBlock', false, 'H1');
document.execCommand('hiliteColor', false, '#D8E0D8');
```

**焦点管理**：在点击工具按钮时，先聚焦编辑器，延迟执行命令，确保焦点正确建立。

### 3. 拖拽排序实现

使用 `SortableJS` 库实现笔记块的拖拽排序：

```javascript
new Sortable(this.dom.editor, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    onEnd: () => {
        this.handleAutoSave();
    }
});
```

**交互优化**：悬停时显示拖拽手柄和删除按钮，保持界面整洁。

### 4. 自动保存机制

使用防抖（debounce）技术实现自动保存：

```javascript
handleAutoSave() {
    this.dom.saveText.textContent = '保存中...';
    
    if (this.saveTimer) clearTimeout(this.saveTimer);
    
    this.saveTimer = setTimeout(() => {
        localStorage.setItem(this.state.currentNoteKey, this.dom.editor.innerHTML);
        this.dom.saveText.textContent = '已保存';
    }, 1000);
}
```

**独立存储**：每篇文章使用独立的 localStorage key，通过 URL hash 生成唯一标识。

### 5. Markdown 导出优化

使用 `turndown` 库将 HTML 转换为 Markdown，并添加自定义规则：

```javascript
// 摘录块规则
turndownService.addRule('excerpt', {
    filter: (node) => node.classList.contains('excerpt-block'),
    replacement: (content) => {
        const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const normalized = lines.join('\n');
        
        if (normalized.startsWith('![')) {
            return normalized + '\n\n';
        }
        
        const quoted = lines.map(l => '> ' + l).join('\n');
        return quoted + '\n\n';
    }
});

// 图片代理规则
turndownService.addRule('img-proxy', {
    filter: 'img',
    replacement: (content, node) => {
        let src = node.getAttribute('src');
        if (src && (src.includes('mmbiz.qpic.cn') || src.includes('qlogo.cn'))) {
            if (!src.includes('images.weserv.nl')) {
                src = 'https://images.weserv.nl/?url=' + encodeURIComponent(src);
            }
        }
        return `![${alt}](${src})`;
    }
});
```

### 6. Sticky 定位实现

标签页吸顶功能的关键实现：

```css
/* 滚动容器 */
html {
    overflow-x: hidden;
    overflow-y: auto;
}

body {
    /* 不设置 overflow，使用浏览器默认值 */
}

/* Sticky 元素 */
.tabs-header {
    position: -webkit-sticky;
    position: sticky;
    top: 0;
    z-index: 200;
}

/* 父容器不能有 position: relative/absolute/fixed */
.tabs-container {
    /* 不设置 position: relative */
}
```

**关键点**：
- 滚动容器必须是 `html` 或 `body`
- Sticky 元素的父容器不能有 `position: relative/absolute/fixed`
- 父容器不能有 `overflow: hidden/scroll/auto`

### 7. 响应式设计

移动端适配策略：

```css
@media (max-width: 768px) {
    .view-container {
        padding: 20px 16px;
    }
    
    .tabs-header {
        position: sticky;
        top: 50px;
    }
    
    .toolbar {
        top: 100px;
        position: sticky;
    }
    
    .tool-btn {
        width: 40px;
        height: 40px;
    }
}
```

**触摸优化**：
- `touch-action: pan-y pan-x` - 允许触摸滚动
- `-webkit-overflow-scrolling: touch` - iOS 平滑滚动
- `-webkit-user-select: text` - 允许文本选择

## 设计亮点

### 设计理念

灵感来源于《Kinfolk》、《Cereal》等生活方式杂志，追求：

- **有机感**：自然、不做作、有生命力
- **透气感**：留白充足、呼吸感强
- **温润感**：色彩柔和、过渡自然
- **从容感**：节奏舒缓、不急不躁

### 视觉关键词

#### 1. 有机

- **色彩系统**：
  - 背景色：`#FAF9F6`（暖米色）
  - 主文字：`#4A4036`（橄榄棕）
  - 次要文字：`#7A7067`（灰褐）
  - 主强调色：`#556B2F`（苔藓绿）
  - 次强调色：`#8F9779`（抹茶绿）
  - 高亮色：`#D8E0D8`（淡绿）

- **字体选择**：
  - 衬线体：`Songti SC`、`Noto Serif SC`、`SimSun`
  - 无衬线：`PingFang SC`、`Microsoft YaHei`、`Noto Sans SC`

#### 2. 透气

- **留白设计**：
  - 卡片间距：`32px`
  - 内容内边距：`20px`
  - 章节间距：`40px`

- **圆角设计**：
  - 小圆角：`8px`
  - 中圆角：`12px`
  - 大圆角：`20px`

#### 3. 温润

- **阴影系统**：
  - 柔和阴影：`0 8px 30px rgba(74, 64, 54, 0.06)`
  - 悬停阴影：`0 12px 40px rgba(74, 64, 54, 0.12)`

- **过渡动画**：
  - 缓动函数：`cubic-bezier(0.25, 0.8, 0.25, 1)`
  - 过渡时间：`0.3s`

#### 4. 生命力

- **微交互**：
  - 卡片悬停：上移 `8px` + 阴影增强
  - 按钮悬停：颜色加深 + 轻微上移
  - 输入框聚焦：边框高亮 + 轻微放大

- **动态反馈**：
  - 保存状态：实时显示"保存中..." → "已保存"
  - Toast 通知：操作成功/失败提示
  - 摘录按钮：选中时自动显示

### 组件设计

#### 1. 卡片设计

```css
.article-card {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-soft);
    transition: var(--transition);
}

.article-card:hover {
    transform: translateY(-8px);
    box-shadow: var(--shadow-hover);
}
```

#### 2. 输入框设计

```css
.input-wrapper {
    background: var(--bg-card);
    padding: 8px;
    border-radius: 50px;
    box-shadow: var(--shadow-soft);
    border: 1px solid transparent;
    transition: var(--transition);
}

.input-wrapper:focus-within {
    border-color: var(--accent-secondary);
    transform: scale(1.01);
}
```

#### 3. 标签页设计

```css
.tabs-header {
    position: sticky;
    top: 0;
    background: var(--bg-color);
    border-bottom: 1px solid var(--border-color);
}

.tab-btn.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 3px;
    background: var(--accent-primary);
    border-radius: 3px 3px 0 0;
}
```

#### 4. 摘录块设计

```css
.excerpt-block {
    background: var(--bg-color);
    border-left: 4px solid var(--accent-primary);
    border-radius: 4px var(--radius-md) var(--radius-md) 4px;
    padding: 20px 24px;
}
```

### 响应式设计

#### 桌面端（> 768px）

- 双栏布局：文章卡片网格
- 充足空间：大字号、大间距
- 悬停效果：丰富的微交互

#### 移动端（≤ 768px）

- 单栏布局：垂直堆叠
- 触摸优化：大按钮、大间距
- Sticky 定位：标签页、工具栏吸顶

## 使用指南

### 快速开始

1. **抓取文章**：
   - 粘贴微信公众号文章链接到输入框
   - 点击右侧箭头按钮
   - 等待文章抓取完成

2. **阅读原文**：
   - 在"原文内容"标签页浏览文章
   - 选择想要摘录的文本或图片

3. **摘录内容**：
   - 选中文本或点击图片
   - 点击弹出的"摘录"按钮
   - 内容自动添加到"思考·记录"标签页

4. **编辑笔记**：
   - 使用工具栏格式化内容
   - 拖拽排序笔记块
   - 内容自动保存

5. **导出笔记**：
   - 选择导出格式（长图/Word/PDF/Markdown）
   - 文件自动下载

### 高级技巧

- **批量摘录**：连续选择多个段落，一次性摘录
- **图片摘录**：点击原文中的图片，直接添加到笔记
- **拖拽排序**：按住笔记块左侧的拖拽手柄，自由排序
- **Markdown 导出**：导出的 Markdown 格式适配飞书，可直接粘贴使用
- **离线使用**：已抓取的文章和笔记保存在本地，可离线查看

## 浏览器兼容性

| 功能 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|-------|
| 基础功能 | ✅ | ✅ | ✅ | ✅ |
| Sticky 定位 | ✅ | ✅ | ✅ | ✅ |
| contenteditable | ✅ | ✅ | ✅ | ✅ |
| LocalStorage | ✅ | ✅ | ✅ | ✅ |
| PDF 导出 | ✅ | ✅ | ✅ | ✅ |
| 长图生成 | ✅ | ⚠️ | ⚠️ | ✅ |

*注：Safari 在长图生成时可能需要手动允许跨域图片加载*

## 性能优化

1. **字体加载**：使用系统字体栈，避免网络字体加载延迟
2. **CDN 加速**：第三方库使用国内 CDN（cdn.staticfile.org）
3. **防抖保存**：自动保存使用 1s 防抖，减少频繁写入
4. **懒加载**：图片使用代理服务，按需加载
5. **CSS 优化**：使用 CSS 变量，减少重复代码

## 未来规划

- [ ] 支持更多平台（知乎、掘金等）
- [ ] 笔记标签分类
- [ ] 全文搜索功能
- [ ] 云端同步
- [ ] 协作分享
- [ ] 暗黑模式
- [ ] 导入导出 JSON
- [ ] 笔记模板

## 许可证

MIT License

## 致谢

灵感来源于《Kinfolk》、《Cereal》等生活方式杂志的优雅设计语言。

---

**Organic Notes** - 让阅读与思考自然生长
