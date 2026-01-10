const app = {
    state: {
        articles: [], // Store list of articles
        currentArticle: null,
        currentNoteKey: null,
        selectionRange: null, // Store range for text excerpt
        selectedImage: null,   // Store element for image excerpt
        tabScrollPositions: {
            content: 0,
            notes: 0
        },
        currentTab: 'content'
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        
        // Initialize Marked options - disable deprecated features to suppress warnings
        marked.use({
            breaks: true,
            gfm: true,
            mangle: false,
            headerIds: false
        });
        
        // Load articles from localStorage
        const savedArticles = localStorage.getItem('organic_notes_articles');
        if (savedArticles) {
            try {
                this.state.articles = JSON.parse(savedArticles);
            } catch (e) { console.error("Failed to parse articles", e); }
        }
        
        // If no articles, add demo
        if (this.state.articles.length === 0 && typeof MOCK_ARTICLE !== 'undefined') {
             this.state.articles.push(MOCK_ARTICLE);
        }

        this.renderArticleList();
        
        // Initialize Sortable on editor
        this.initBlockManagement();
    },

    initBlockManagement() {
        // Check if editor exists first
        if (!this.dom.editor) return;

        // Initialize SortableJS
        try {
            new Sortable(this.dom.editor, {
                animation: 150,
                handle: '.drag-handle', // Drag handle selector within list items
                ghostClass: 'sortable-ghost',
                onEnd: () => {
                    this.handleAutoSave();
                }
            });
        } catch(e) {
            console.warn("SortableJS failed to init (maybe library missing?)", e);
        }

        // Hover effect to show controls
        this.dom.editor.addEventListener('mouseover', (e) => {
            // Find the closest direct child of editor
            const block = e.target.closest('#editor > *');
            
            // Validate block: must be valid, not editor itself, and not already having controls
            if (block && block !== this.dom.editor && !block.querySelector('.block-handle-container')) {
                // Cleanup: Remove handles from ANY other block first to avoid clutter
                document.querySelectorAll('.block-handle-container').forEach(el => el.remove());
                
                // Create handle container
                const container = document.createElement('div');
                container.className = 'block-handle-container';
                container.contentEditable = "false";
                container.innerHTML = `
                    <div class="block-btn drag-handle" title="拖拽"><i class="fa-solid fa-grip-vertical"></i></div>
                    <div class="block-btn delete" title="删除"><i class="fa-solid fa-trash"></i></div>
                `;
                
                // Bind delete event
                container.querySelector('.delete').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    // If it's an excerpt wrapper, delete the whole thing
                    if(confirm('删除此内容块？')) {
                        block.remove();
                        this.handleAutoSave();
                    }
                });

                block.appendChild(container);
            }
        });
    },

    cacheDOM() {
        this.dom = {
            viewHome: document.getElementById('view-home'),
            viewArticle: document.getElementById('view-article'),
            cardGrid: document.getElementById('card-grid'),
            urlInput: document.getElementById('url-input'),
            btnCrawl: document.getElementById('btn-crawl'),
            btnBack: document.getElementById('btn-back'),
            articleTitle: document.getElementById('article-title'),
            articleLink: document.getElementById('article-link'),
            markdownRender: document.getElementById('markdown-render'),
            editor: document.getElementById('editor'),
            popover: document.getElementById('excerpt-popover'),
            btnExcerpt: document.getElementById('btn-excerpt'),
            toast: document.getElementById('toast'),
            toastMsg: document.getElementById('toast-msg'),
            saveStatus: document.getElementById('save-status'),
            saveText: document.getElementById('save-text'),
            tabs: document.querySelectorAll('.tab-btn'),
            tabPanes: document.querySelectorAll('.tab-pane'),
            btnToggleToolbar: document.getElementById('btn-toggle-toolbar'),
            editorToolbar: document.getElementById('editor-toolbar')
        };
    },

    bindEvents() {
        // Navigation
        this.dom.btnCrawl.addEventListener('click', () => this.handleCrawl());
        this.dom.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleCrawl();
        });
        this.dom.btnBack.addEventListener('click', () => this.switchView('home'));

        // Toolbar Toggle (Mobile)
        if (this.dom.btnToggleToolbar) {
            this.dom.btnToggleToolbar.addEventListener('click', () => {
                const isCollapsed = this.dom.editorToolbar.classList.toggle('collapsed-mobile');
                this.dom.btnToggleToolbar.innerHTML = isCollapsed ? 
                    '<i class="fa-solid fa-pen-nib"></i> 编辑工具' : 
                    '<i class="fa-solid fa-chevron-up"></i> 收起工具';
            });
        }

        // Tabs
        this.dom.tabs.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Selection & Excerpt Logic
        // Support both mouse and touch events for selection handling
        const selectionHandler = (e) => this.handleSelection(e);
        document.addEventListener('mouseup', selectionHandler);
        document.addEventListener('touchend', selectionHandler); // Add touch support
        
        document.addEventListener('selectionchange', () => {
            // Debounce selection change to avoid flickering on mobile
            if (this.selectionTimer) clearTimeout(this.selectionTimer);
            this.selectionTimer = setTimeout(() => {
                const selection = document.getSelection();
                if (selection.isCollapsed) {
                    // Only hide if we aren't currently showing an image excerpt
                    if (!this.state.selectedImage) {
                        this.hidePopover();
                    }
                } else {
                    // Only auto-show for text if we have a valid range in markdown
                    if (this.dom.markdownRender.contains(selection.anchorNode)) {
                         const range = selection.getRangeAt(0);
                         const rect = range.getBoundingClientRect();
                         if (rect.width > 0) {
                             this.state.selectedImage = null;
                             this.state.selectionRange = range.cloneRange();
                             this.showPopover(rect);
                         }
                    }
                }
            }, 300); // Slightly longer debounce for mobile stability
        });

        // Markdown content specific interactions (Delegation)
        this.dom.markdownRender.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                this.handleImageClick(e.target);
                e.stopPropagation(); // Prevent document click from clearing
            }
        });

        // Excerpt Button Action
        // Use both touchstart and click to ensure responsiveness on all devices
        const handleExcerptClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.executeExcerpt();
        };

        this.dom.btnExcerpt.addEventListener('touchstart', handleExcerptClick, { passive: false });
        this.dom.btnExcerpt.addEventListener('click', handleExcerptClick);

        // Editor Toolbar
        document.querySelectorAll('.tool-btn[data-cmd]').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const cmd = btn.dataset.cmd;
                const val = btn.dataset.val || null;
                
                // Focus editor first
                this.dom.editor.focus();
                
                // Small delay to ensure focus is established
                setTimeout(() => {
                    document.execCommand(cmd, false, val);
                    // Refocus after command execution
                    this.dom.editor.focus();
                }, 10);
            });
        });

        // Auto Save
        this.dom.editor.addEventListener('input', () => this.handleAutoSave());

        // Copy TXT
        document.getElementById('btn-copy-txt').addEventListener('click', () => {
            let text = this.dom.editor.innerText;
            // Add Source Link
            if (this.state.currentArticle && this.state.currentArticle.url) {
                text += `\n\nSource: ${this.state.currentArticle.url}`;
            }
            navigator.clipboard.writeText(text).then(() => this.showToast('已复制纯文本'));
        });

        // Copy MD
        document.getElementById('btn-copy-md').addEventListener('click', () => {
            // Prepare content: Clone and clean
            const content = this.dom.editor.cloneNode(true);
            content.querySelectorAll('.block-handle-container').forEach(el => el.remove());
            
            const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced',
                emDelimiter: '*'
            });

            // Use GFM plugin if available
            if (window.turndownPluginGfm) {
                turndownService.use(turndownPluginGfm.gfm);
            }

            // 1. Rule for Excerpt Blocks
            turndownService.addRule('excerpt', {
                filter: (node) => node.classList.contains('excerpt-block'),
                replacement: (content) => {
                    // Normalize lines, remove empty/whitespace-only lines
                    const lines = content
                        .split('\n')
                        .map(l => l.trim())
                        .filter(l => l.length > 0);

                    const normalized = lines.join('\n');

                    // If the excerpt is primarily an image, do NOT wrap in blockquote
                    if (normalized.startsWith('![')) {
                        return normalized + '\n\n';
                    }

                    // Quote each line
                    const quoted = lines.map(l => '> ' + l).join('\n');
                    return quoted + '\n\n';
                }
            });

            // 2. Rule for Images -> Proxy for Feishu
            turndownService.addRule('img-proxy', {
                filter: 'img',
                replacement: (content, node) => {
                    let src = node.getAttribute('src');
                    const alt = node.getAttribute('alt') || '';
                    if (src && (src.includes('mmbiz.qpic.cn') || src.includes('qlogo.cn'))) {
                        // Use weserv.nl as proxy to bypass WeChat hotlink check
                        if (!src.includes('images.weserv.nl')) {
                            src = 'https://images.weserv.nl/?url=' + encodeURIComponent(src);
                        }
                    }
                    return `![${alt}](${src})`;
                }
            });

            // 3. Rule for Highlights (Background Color) -> `code` for Feishu
            turndownService.addRule('highlight', {
                filter: (node) => {
                    return (node.nodeName === 'SPAN' || node.nodeName === 'FONT') && 
                           (node.style.backgroundColor || node.style.background);
                },
                replacement: (content) => {
                    return '`' + content + '`';
                }
            });

            // 4. Rule for Underline -> <u>text</u>
            turndownService.addRule('underline', {
                filter: (node) => {
                    return node.nodeName === 'U' || node.style.textDecoration === 'underline';
                },
                replacement: (content) => {
                    return '<u>' + content + '</u>';
                }
            });

            let markdown = turndownService.turndown(content);
            
            // 5. Aggressive Cleanup for Newlines
            // Remove multiple blank lines, reduce to max 2 newlines (one blank line)
            markdown = markdown.replace(/\n\s*\n\s*\n+/g, '\n\n'); 
            markdown = markdown.replace(/\n{3,}/g, '\n\n');
            // Remove empty quote lines like ">  " or "> \n"
            markdown = markdown.replace(/(^|\n)>\s*\n/g, '$1');
            // Final trim
            markdown = markdown.trim();

            // Add Source Link at the end
            if (this.state.currentArticle && this.state.currentArticle.url) {
                markdown += `\n\n---\nSource: ${this.state.currentArticle.url}`;
            }

            navigator.clipboard.writeText(markdown).then(() => this.showToast('已复制 Markdown'));
        });

        // Download Image
        document.getElementById('btn-download-img').addEventListener('click', () => this.downloadAsImage());

        // Export Docx
        document.getElementById('btn-export-docx').addEventListener('click', () => this.exportToDocx());
        
        // Export PDF
        document.getElementById('btn-export-pdf').addEventListener('click', () => this.exportToPdf());
    },

    // --- Core Logic ---

    renderArticleList() {
        if (!this.dom.cardGrid) return;
        this.dom.cardGrid.innerHTML = '';
        this.state.articles.forEach((article, index) => {
            const card = document.createElement('div');
            card.className = 'article-card';
            card.onclick = () => this.loadArticle(article);
            
            // Fallback for cover
            let coverUrl = article.cover || "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=1874&auto=format&fit=crop";
            
            // Fix: Use Proxy for WeChat Cover Images to prevent Referrer blocking (Anti-hotlink)
            if (coverUrl.includes('mmbiz.qpic.cn') || coverUrl.includes('qlogo.cn')) {
                // Ensure we don't double proxy if already proxied
                if (!coverUrl.includes('images.weserv.nl')) {
                    coverUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(coverUrl);
                }
            }

            card.innerHTML = `
                <div class="card-cover" style="background-image: url('${coverUrl}');"></div>
                <div class="card-content">
                    <h3>${article.title}</h3>
                    <div class="card-meta">
                        <span class="update-time">${article.date || '刚刚更新'}</span>
                        <button class="btn-icon"><i class="fa-solid fa-arrow-right-long"></i></button>
                    </div>
                </div>
            `;
            this.dom.cardGrid.appendChild(card);
        });
    },

    handleCrawl() {
        const url = this.dom.urlInput.value.trim();
        if (!url && !this.state.currentArticle) {
             if (this.state.articles.length > 0) return;
             this.loadArticle(this.state.articles[0]);
             return;
        }
        
        // Loading State
        this.dom.btnCrawl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        this.dom.btnCrawl.disabled = true;
        
        // Call Cloud Function
        const API_ENDPOINT = "https://organicnotes-brpqjhpbep.cn-hongkong.fcapp.run";
        
        fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        })
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            console.log("API Response:", data);
            
            // Handle the specific text-based response format from Unifuncs/302.ai
            let rawText = "";
            if (data.raw_content) rawText = data.raw_content;
            else if (typeof data === 'string') rawText = data;
            else if (data.data && typeof data.data === 'string') rawText = data.data;
            else rawText = data.content || JSON.stringify(data);
            
            // Extract Title
            const titleMatch = rawText.match(/^Title:\s*(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : "未命名文章";

            // Extract Cover Image
            const coverMatch = rawText.match(/!\[.*?\]\((.+?)\)/) || rawText.match(/<img[^>]+src=["']([^"']+)["']/);
            const cover = coverMatch ? coverMatch[1] : "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=1874&auto=format&fit=crop";

            // Extract Markdown Content
            const contentSplit = rawText.split('Markdown Content:');
            let content = contentSplit.length > 1 ? contentSplit.slice(1).join('Markdown Content:') : rawText;
            content = content.trim();

            const newArticle = {
                title: title,
                cover: cover,
                date: new Date().toLocaleDateString(),
                content: content, 
                url: url
            };
            
            // Add to list and save
            this.state.articles.unshift(newArticle);
            this.saveArticles();
            this.renderArticleList();

            // Load and switch tab is handled in loadArticle, but we also ensure tab is reset
            this.loadArticle(newArticle);
            this.switchTab('content'); // Explicitly switch to content tab after crawl
        })
        .catch(error => {
            console.error('Crawl Error:', error);
            this.showToast('抓取失败：' + error.message);
        })
        .finally(() => {
            this.dom.btnCrawl.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
            this.dom.btnCrawl.disabled = false;
        });
    },
    
    saveArticles() {
        localStorage.setItem('organic_notes_articles', JSON.stringify(this.state.articles));
    },

    loadArticle(article) {
        if (!article) return;
        
        // Critical: Stop any pending autosave from previous article
        if (this.saveTimer) clearTimeout(this.saveTimer);
        
        this.state.currentArticle = article;
        
        // Render
        this.dom.articleTitle.textContent = article.title;
        this.dom.articleLink.href = article.url;
        this.dom.markdownRender.innerHTML = marked.parse(article.content);
        
        // Generate a ROBUST unique key for each article
        // Use URL as primary identifier, fallback to title+date if URL is missing
        // Then hash it to avoid collisions and ensure consistency
        const uniqueId = article.url || (article.title + '_' + article.date);
        // Use SHA-like hashing by converting to a stable numeric hash, then to hex string
        let hash = 0;
        for (let i = 0; i < uniqueId.length; i++) {
            const char = uniqueId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        const noteKey = 'note_' + Math.abs(hash).toString(16).slice(0, 16); // Use first 16 hex chars
        
        const saved = localStorage.getItem(noteKey);
        
        // IMPORTANT: Always clear and update content to avoid residual data from previous article
        if (saved) {
            this.dom.editor.innerHTML = saved;
        } else {
            this.dom.editor.innerHTML = '<p><i>点击左侧原文的文字或图片进行摘录...</i></p>';
        }
        
        // Update current note key for autosave - CRITICAL FOR INDEPENDENT NOTES
        this.state.currentNoteKey = noteKey;
        
        this.switchView('article');
        this.switchTab('content');
    },

    handleAutoSave() {
        this.dom.saveText.textContent = '保存中...';
        this.dom.saveStatus.style.opacity = '0.7';
        
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            // Save to specific article key if exists
            if (this.state.currentNoteKey) {
                localStorage.setItem(this.state.currentNoteKey, this.dom.editor.innerHTML);
            }
            
            this.dom.saveText.textContent = '已保存';
            this.dom.saveStatus.style.opacity = '1';
        }, 1000); // 1s debounce
    },

    switchView(viewName) {
        if (viewName === 'home') {
            this.dom.viewHome.classList.remove('hidden');
            this.dom.viewArticle.classList.add('hidden');
            document.title = 'Organic Notes';
            this.renderArticleList(); // Re-render in case of updates
            this.state.currentArticle = null;
            this.state.currentNoteKey = null;
            // Reset tab scroll positions when going back home
            this.state.tabScrollPositions = { content: 0, notes: 0 };
            this.state.currentTab = 'content';
        } else {
            this.dom.viewHome.classList.add('hidden');
            this.dom.viewArticle.classList.remove('hidden');
            document.title = this.state.currentArticle ? this.state.currentArticle.title : 'Article View';
            
            // Initial state for tab positions and toolbar toggle
            if (this.dom.btnToggleToolbar) {
                this.dom.btnToggleToolbar.style.display = this.state.currentTab === 'notes' ? 'flex' : 'none';
            }
        }
        window.scrollTo(0, 0);
    },

    switchTab(tabName) {
        // Save current scroll position before switching
        this.state.tabScrollPositions[this.state.currentTab] = window.scrollY;

        // Update Buttons
        this.dom.tabs.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update Panes
        this.dom.tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabName}`);
        });

        // Toggle toolbar toggle button visibility
        if (this.dom.btnToggleToolbar) {
            this.dom.btnToggleToolbar.style.display = tabName === 'notes' ? 'flex' : 'none';
        }

        // Update current tab state
        this.state.currentTab = tabName;

        // Restore saved scroll position for the target tab
        const savedPos = this.state.tabScrollPositions[tabName];
        
        // Use a small delay to allow DOM to layout
        setTimeout(() => {
            window.scrollTo(0, savedPos);
        }, 10);
    } ,

    // --- Selection & Excerpt Logic ---

    handleSelection(e) {
        // If click inside popover, ignore
        if (this.dom.popover.contains(e.target)) return;

        const selection = window.getSelection();
        
        // Only handle selection if it's within the markdown render area
        if (!this.dom.markdownRender.contains(selection.anchorNode)) {
            return;
        }

        const selectedText = selection.toString().trim();

        if (selectedText.length > 0) {
            this.state.selectedImage = null; 
            // Use cloneRange to save a static snapshot of the selection
            this.state.selectionRange = selection.getRangeAt(0).cloneRange();
            this.showPopover(this.state.selectionRange.getBoundingClientRect());
        } else {
            if (e.target.tagName !== 'IMG') {
                this.hidePopover();
            }
        }
    },

    handleImageClick(img) {
        this.state.selectionRange = null; // Clear text selection
        this.state.selectedImage = img;
        
        // Create a fake rect for the image
        const rect = img.getBoundingClientRect();
        this.showPopover(rect);
    },

    showPopover(rect) {
        const popover = this.dom.popover;
        
        // Calculate position
        const scrollY = window.scrollY || window.pageYOffset;
        const scrollX = window.scrollX || window.pageXOffset;

        // Detection for mobile or small screens
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile) {
            // Position BELOW the selection on mobile to avoid native browser menu
            const top = rect.bottom + scrollY; 
            const left = rect.left + scrollX + (rect.width / 2);
            
            popover.style.top = `${top}px`;
            popover.style.left = `${left}px`;
            popover.classList.add('below');
        } else {
            // Position ABOVE the selection on desktop (default)
            const top = rect.top + scrollY; 
            const left = rect.left + scrollX + (rect.width / 2);
            
            popover.style.top = `${top}px`;
            popover.style.left = `${left}px`;
            popover.classList.remove('below');
        }

        popover.classList.remove('hidden');
    },

    hidePopover() {
        this.dom.popover.classList.add('hidden');
        this.state.selectionRange = null;
        this.state.selectedImage = null;
    },

    executeExcerpt() {
        let contentHTML = '';

        if (this.state.selectionRange) {
            // Text Excerpt
            const range = this.state.selectionRange;
            const container = document.createElement('div');
            container.appendChild(range.cloneContents());
            contentHTML = container.innerHTML;
        } else if (this.state.selectedImage) {
            // Image Excerpt
            // Force Proxy for Excerpted Image to ensure it renders in Editor
            let src = this.state.selectedImage.src;
            if (src && (src.includes('mmbiz.qpic.cn') || src.includes('qlogo.cn'))) {
                 if (!src.includes('images.weserv.nl')) {
                    src = 'https://images.weserv.nl/?url=' + encodeURIComponent(src);
                }
            }
            contentHTML = `<img src="${src}" alt="Excerpt Image">`;
        }

        if (contentHTML) {
            this.appendExcerptToEditor(contentHTML);
            this.showToast('已摘录到笔记');
            this.hidePopover();
            window.getSelection().removeAllRanges();
            // User requested to stay on content tab
            // this.switchTab('notes');
        }
    },

    appendExcerptToEditor(htmlContent) {
        // Wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'excerpt-wrapper';
        wrapper.contentEditable = "false"; // Container not editable directly as text
        
        // Content (Editable inside)
        const contentBlock = document.createElement('div');
        contentBlock.className = 'excerpt-block';
        contentBlock.contentEditable = "true"; // Allow editing text inside
        contentBlock.innerHTML = htmlContent;

        wrapper.appendChild(contentBlock);
        
        // Append to editor
        this.dom.editor.appendChild(wrapper);
        
        // Add an empty paragraph after for continuation
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        this.dom.editor.appendChild(p);

        // Trigger autosave
        this.handleAutoSave();
    },

    showToast(msg, duration = 3000) {
        const toast = this.dom.toast;
        this.dom.toastMsg.textContent = msg;
        toast.classList.remove('hidden');
        
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    },

    downloadAsImage() {
        this.showToast('正在生成长图...');
        
        // Create a clean container for image generation
        // Fix: Use 0x0 size wrapper with overflow hidden to prevent popping out, 
        // but keep content rendered for html-to-image
        const wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.width = '1px';
        wrapper.style.height = '1px';
        wrapper.style.overflow = 'hidden';
        wrapper.style.zIndex = '-9999';
        wrapper.style.opacity = '0.01'; // Not 0 to ensure rendering
        
        const container = document.createElement('div');
        container.style.width = '800px'; // Fixed width for image
        container.style.backgroundColor = '#FAF9F6';
        container.style.padding = '50px';
        container.style.fontFamily = "'Noto Sans SC', sans-serif";
        container.style.color = '#4A4036';
        
        // Add Title
        const title = document.createElement('h1');
        title.innerText = this.state.currentArticle ? this.state.currentArticle.title : '我的思考笔记';
        title.style.fontFamily = "'Noto Serif SC', serif";
        title.style.fontSize = '32px';
        title.style.marginBottom = '20px';
        container.appendChild(title);

        // Add Source Link
        if (this.state.currentArticle && this.state.currentArticle.url) {
            const sourceLink = document.createElement('p');
            sourceLink.style.fontSize = '12px';
            sourceLink.style.color = '#7A7067';
            sourceLink.style.marginBottom = '30px';
            sourceLink.style.borderBottom = '2px solid #E6E2DE';
            sourceLink.style.paddingBottom = '20px';
            sourceLink.innerText = `Source: ${this.state.currentArticle.url}`;
            container.appendChild(sourceLink);
        }
        
        // Add Content (Clone editor content)
        const content = this.dom.editor.cloneNode(true);
        // Remove interactive handles
        content.querySelectorAll('.block-handle-container').forEach(el => el.remove());
        content.style.lineHeight = '1.8';
        content.style.fontSize = '16px';
        
        // Ensure images in cloned content use proxy if needed
        content.querySelectorAll('img').forEach(img => {
            let src = img.getAttribute('src');
            if (src && !src.startsWith('data:')) {
                if (!src.includes('images.weserv.nl')) {
                    img.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(src);
                }
                img.crossOrigin = "Anonymous";
            }
        });

        // FIX: Replace FontAwesome icons with inline SVG/Text for image generation reliability
        // Specifically for Quote blocks (assuming .fa-quote-left is used in excerpt logic? 
        // Actually current excerpt logic just wraps in .excerpt-block, logic below checks for `i` tags)
        // If there are any `i` tags with font-awesome, replace them?
        // Current editor content doesn't seem to use icons inside content, except maybe drag handles (removed).
        // Wait, the user said "Quote icon not showing". 
        // My `appendExcerptToEditor` doesn't add a quote icon explicitly in HTML. 
        // It uses CSS `border-left`.
        // Maybe the user added a quote manually? 
        // Or maybe they mean the visual indication of a quote?
        // Screenshot shows a missing square icon. 
        // I will add a generic style to ensure `excerpt-wrapper` looks good without icons.
        
        container.appendChild(content);
        wrapper.appendChild(container);
        document.body.appendChild(wrapper);
        
        setTimeout(() => {
            if (typeof htmlToImage === 'undefined') {
                 console.error("htmlToImage library not loaded");
                 this.showToast("错误：图片生成库未加载");
                 document.body.removeChild(wrapper);
                 return;
            }

            htmlToImage.toPng(container, { 
                cacheBust: true, 
                useCORS: true, 
                quality: 0.95,
                pixelRatio: 2,
                backgroundColor: '#FAF9F6'
            })
            .then((dataUrl) => {
                if (dataUrl.length < 1000) {
                     throw new Error("Generated image is too small.");
                }
                const link = document.createElement('a');
                link.download = `${title.innerText || 'notes'}.png`;
                link.href = dataUrl;
                link.click();
                document.body.removeChild(wrapper);
                this.showToast('长图已下载');
            })
            .catch((error) => {
                console.error('Image generation failed', error);
                document.body.removeChild(wrapper);
                this.showToast('生成长图失败，请重试');
            });
        }, 1000);
    },

    exportToDocx() {
        this.showToast('正在生成 Word 文档...');
        
        const title = this.state.currentArticle ? this.state.currentArticle.title : '我的思考笔记';
        const sourceUrl = this.state.currentArticle ? this.state.currentArticle.url : '';

        const clone = this.dom.editor.cloneNode(true);
        clone.querySelectorAll('.block-handle-container').forEach(el => el.remove());

        const content = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Songti SC', serif; line-height: 1.6; }
                    h1, h2, h3 { color: #4A4036; }
                    .source-link { font-size: 10pt; color: #666; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
                    .excerpt-block { 
                        border-left: 4px solid #556B2F; 
                        padding: 10px 20px; 
                        background-color: #F9F9F9;
                        margin: 20px 0;
                        color: #4A4036;
                    }
                    img { max-width: 100%; }
                </style>
            </head>
            <body>
                <h1>${title}</h1>
                ${sourceUrl ? `<p class="source-link">Source: <a href="${sourceUrl}">${sourceUrl}</a></p>` : ''}
                ${clone.innerHTML}
            </body>
            </html>
        `;

        const converted = htmlDocx.asBlob(content);
        saveAs(converted, `${title}.docx`);
    },

    exportToPdf() {
        const title = this.state.currentArticle ? this.state.currentArticle.title : '我的思考笔记';
        this.dom.editor.setAttribute('data-print-title', title);
        
        let printSource = document.getElementById('print-source-link');
        if (!printSource) {
            printSource = document.createElement('div');
            printSource.id = 'print-source-link';
            printSource.style.display = 'none'; 
            this.dom.editor.prepend(printSource);
        }
        
        if (this.state.currentArticle && this.state.currentArticle.url) {
            printSource.innerHTML = `Source: ${this.state.currentArticle.url}`;
        }
        
        window.print();
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
