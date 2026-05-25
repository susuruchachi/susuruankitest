export class UiController {
  constructor(appHub) {
    this.app = appHub;
    this.pageHistory = [];
  }

  escapeHtml(s) {
    if(!s) return ''; 
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  toggleLightMode(forceOn = false) {
    const isLight = forceOn || !document.body.classList.contains('light-mode');
    if(isLight) document.body.classList.add('light-mode'); else document.body.classList.remove('light-mode');
    localStorage.setItem('theme_light', isLight);
    if(this.app.stats.chartInstance) this.app.stats.renderStatsAndCharts(this.app.dbManager.db, this.app.quiz.todayCorrectCount);
  }

  setSyncStatus(state, text) {
    const el = document.getElementById('cloudSyncStatus');
    if(!el) return;
    el.className = `sync-status ${state}`;
    el.innerText = text;
    if (state === 'success' || state === 'error') setTimeout(() => el.classList.add('hidden'), 3000);
  }

  openPage(pageId) { this.executePageTransition(pageId, false); }
  
  executePageTransition(pageId, isBackAction) {
    clearInterval(this.app.quiz.quizTimer); 
    clearTimeout(this.app.quiz.autoNextTimeout);
    
    const activeScreen = document.querySelector('.screen.active');
    const currentId = activeScreen ? activeScreen.id : 'pgHome';
    if (!isBackAction && currentId !== pageId) {
      this.pageHistory.push(currentId);
      history.pushState({ page: pageId }, '', '');
    }
    if (pageId !== 'pgFriends') this.app.closeChat();

    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display='none'; });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const tgt = document.getElementById(pageId);
    if(tgt) { tgt.style.display='flex'; tgt.classList.add('active'); }

    if(pageId==='pgHome') { document.getElementById('navHome').classList.add('active'); this.app.buildQuizScopeDropdown(); }
    if(pageId==='pgTree') { document.getElementById('navTree').classList.add('active'); this.renderTree(); }
    if(pageId==='pgBox') { document.getElementById('navBox').classList.add('active'); this.renderBox(); }
    if(pageId==='pgStats') { document.getElementById('navStats').classList.add('active'); this.app.stats.renderStatsAndCharts(this.app.dbManager.db, this.app.quiz.todayCorrectCount); }
    if(pageId==='pgBackup') document.getElementById('navBackup').classList.add('active');
  }

  // --- 描画系 ---
  renderTree() {
    const root = document.getElementById('treeRoot'); root.innerHTML = '';
    this.app.dbManager.getTopLevelCategories().forEach(cat => root.appendChild(this.createTreeNode(cat, 0)));
  }

  createTreeNode(catName, depth) {
    const container = document.createElement('div');
    if (depth > 0) { container.style.marginLeft = '16px'; container.style.marginTop = '6px'; }
    const card = document.createElement('div'); card.className = 'tree-group-card';
    if (depth > 0) { card.style.borderLeft = '3px solid var(--primary)'; card.style.borderRadius = '0 8px 8px 0'; }

    const header = document.createElement('div'); header.className = 'tree-group-header';
    if (depth > 0) { header.style.background = 'var(--bg4)'; header.style.padding = '10px 14px'; }
    this.setupLongpress(header, () => this.app.handleCategoryLongpress(catName));

    const directCount = this.app.dbManager.db.filter(q => q.category === catName).length;
    const children = this.app.dbManager.categoryTree[catName] || [];
    const isExpanded = localStorage.getItem(`cat_exp_${catName}`) === 'true';
    if (isExpanded) card.classList.add('expanded');

    const titleArea = document.createElement('div'); titleArea.className = 'tree-group-title';
    titleArea.innerHTML = `<span>${depth===0?'📁':'📂'}</span> <span style="word-break:break-all;">${this.escapeHtml(catName)}</span> <span class="tree-cat-count">${directCount}</span>`;
    titleArea.onclick = (e) => { e.stopPropagation(); this.app.currentViewContext = { type: 'category', value: catName }; this.openPage('pgBox'); };
    header.appendChild(titleArea);

    if (children.length > 0) {
      const arrow = document.createElement('div'); arrow.className = 'tree-group-arrow'; arrow.innerText = isExpanded ? '▼' : '▶';
      arrow.onclick = (e) => {
        e.stopPropagation();
        const nextState = !card.classList.contains('expanded');
        card.classList.toggle('expanded');
        arrow.innerText = nextState ? '▼' : '▶';
        localStorage.setItem(`cat_exp_${catName}`, nextState);
      };
      header.appendChild(arrow);
    }
    card.appendChild(header);

    if (children.length > 0) {
      const childContainer = document.createElement('div'); childContainer.className = 'tree-group-children';
      children.forEach(c => childContainer.appendChild(this.createTreeNode(c, depth + 1)));
      card.appendChild(childContainer);
    }
    container.appendChild(card); return container;
  }

  renderBox() {
    const container = document.getElementById('boxList'); container.innerHTML = '';
    let filtered = [...this.app.dbManager.db]; 
    let titleString = "📝 全ての問題一覧";
    const th = parseInt(document.getElementById('numGradThreshold').value) || 5;

    if (typeof this.app.currentViewContext === 'object' && this.app.currentViewContext.type === 'category') {
      const subCats = this.app.dbManager.getAllSubcategories(this.app.currentViewContext.value); 
      filtered = this.app.dbManager.db.filter(q => subCats.includes(q.category));
      titleString = `🔖 ${this.app.currentViewContext.value} 内のカード`;
    } else if (typeof this.app.currentViewContext === 'string' && this.app.currentViewContext !== 'all') {
      titleString = `📊 実績抽出カードの一覧`;
      let ctx = this.app.currentViewContext;
      if (ctx === 'grad') filtered = filtered.filter(q => q.correct >= th);
      if (ctx === 'master') filtered = filtered.filter(q => q.correct < th && q.level >= 3);
      if (ctx === 'normal') filtered = filtered.filter(q => q.correct < th && q.level >= 1 && q.level <= 2);
      if (ctx === 'weak') filtered = filtered.filter(q => q.correct < th && q.level === 0 && (q.correct+q.incorrect)>0);
      if (ctx === 'shikkari') filtered = filtered.filter(q => q.correct < th && q.level === -1);
      if (ctx === 'unseen') filtered = filtered.filter(q => q.correct === 0 && q.incorrect === 0 && q.level >= 0);
    }

    const sb = document.getElementById('txtSearchBox');
    if (sb && sb.value.trim() !== '') {
      const kw = sb.value.trim().toLowerCase();
      filtered = filtered.filter(q => q.question.toLowerCase().includes(kw) || q.answer.toLowerCase().includes(kw));
    }

    document.getElementById('boxTitle').innerText = titleString;
    document.getElementById('lblBoxCount').innerText = `${filtered.length} 件`;
    if(filtered.length === 0) { container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text3);">問題がありません</div>'; return; }

    filtered.forEach(item => {
      const isGrad = item.correct >= th;
      const card = document.createElement('div'); card.className = 'q-card';
      this.setupLongpress(card, () => this.app.handleQuestionLongpress(item));
      this.app.boxAnswerCache[item.id] = item.answer;

      const lvlStr = item.level === -1 ? 'しっかり' : 'LV '+item.level;
      const badgeHTML = `<span class="badge ${isGrad ? 'badge-grad':'badge-level'}">${isGrad ? 'GRADUATE' : lvlStr}</span>`;
      card.innerHTML = `
        <div class="q-card-text">${this.escapeHtml(item.question)}</div>
        <div style="font-size:0.85rem; color:var(--text2); margin-bottom:8px; cursor:pointer;" data-id="${this.escapeHtml(item.id)}" data-shown="0" onclick="window.anki.ui.toggleCardAnswer(this)">
          A: <span style="background:var(--bg4); color:var(--text2); padding:2px 8px; border-radius:6px; border:1px solid var(--border); display:inline-block; font-size:0.75rem;">👆 タップして答えを表示</span>
        </div>
        <div class="q-card-sub">${badgeHTML}<span>正: ${item.correct} / 誤: ${item.incorrect}</span><span style="font-size:0.75rem; color:var(--text3);">📂 ${this.escapeHtml(item.category)}</span></div>
      `;
      container.appendChild(card);
    });
  }

  toggleCardAnswer(el) {
    const itemId = el.getAttribute('data-id'); const ans = this.app.boxAnswerCache[itemId] || '';
    const shown = el.getAttribute('data-shown') === '1';
    el.setAttribute('data-shown', shown ? '0' : '1');
    if (shown) { el.innerHTML = 'A: <span style="background:var(--bg4); color:var(--text2); padding:2px 8px; border-radius:6px; border:1px solid var(--border); display:inline-block; font-size:0.75rem;">👆 タップして答えを表示</span>'; } 
    else { el.innerHTML = 'A: <span style="color:var(--text); font-weight:500;">' + this.escapeHtml(ans) + '</span><span style="color:var(--text3); font-size:0.7rem; margin-left:8px;">👆 隠す</span>'; }
  }

  // --- タッチ・イベント補助 ---
  setupLongpress(element, actionCallback) {
    let pressTimer = null; 
    let startX = 0, startY = 0;
    let isDragging = false;
    
    const startHandler = (e) => {
      if (e.type === 'contextmenu') { e.preventDefault(); return; }
      if (e.touches && e.touches.length > 1) return;
      let clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX; startY = clientY;
      isDragging = false;
      
      pressTimer = setTimeout(() => {
        if (!isDragging) { if (navigator.vibrate) navigator.vibrate(50); actionCallback(); }
      }, 500);
    };
    
    const moveHandler = (e) => { 
      if(!pressTimer) return;
      let clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let clientY = e.touches ? e.touches[0].clientY : e.clientY;
      if(Math.abs(clientX - startX) > 10 || Math.abs(clientY - startY) > 10) {
        isDragging = true; clearTimeout(pressTimer); pressTimer = null;
      }
    };
    
    const cancelHandler = () => { if(pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    
    element.addEventListener('mousedown', startHandler); element.addEventListener('touchstart', startHandler, { passive: true });
    element.addEventListener('mousemove', moveHandler); element.addEventListener('touchmove', moveHandler, { passive: true });
    element.addEventListener('mouseup', cancelHandler); element.addEventListener('mouseleave', cancelHandler);
    element.addEventListener('touchend', cancelHandler); element.addEventListener('touchcancel', cancelHandler);
    element.addEventListener('contextmenu', e => { e.preventDefault(); });
  }

  openContextMenu(title, items) {
    document.getElementById('ctxHeader').innerText = title;
    const body = document.getElementById('ctxBody'); body.innerHTML = '';
    items.forEach(item => {
      if (item.type === 'separator') {
        const sep = document.createElement('div'); sep.className = 'menu-sep'; body.appendChild(sep);
      } else {
        const btn = document.createElement('button'); btn.className = `menu-item ${item.danger ? 'danger' : ''}`;
        btn.innerHTML = item.html; btn.onclick = () => { this.closeContextMenu(); item.action(); }; body.appendChild(btn);
      }
    });
    document.getElementById('ctxOverlay').style.display = 'flex';
  }

  closeContextMenu() { document.getElementById('ctxOverlay').style.display = 'none'; }
}
