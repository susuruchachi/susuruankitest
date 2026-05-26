// 全ての読み込みが終わった後に実行する「唯一の」起動処理
window.addEventListener('DOMContentLoaded', () => {
    console.log("初期化開始");
    
    // 1. 基本データの読み込み
    loadData(); 
    ensureSystemSanity(); 
    autoMerge();
    buildQuizScopeDropdown();
    
    // 2. 画面の初期表示
    if(localStorage.getItem('theme_light')==='true') toggleLightMode(true);
    openPage('pgHome');
    
    console.log("初期化完了！");
});

// その他のUI操作関数をここに書く
function toggleLightMode(forceOn) { ... }
function openPage(pageId) { ... }
// ...
window.onload = function() {
  loadData(); ensureSystemSanity(); autoMerge(); buildQuizScopeDropdown(); 
  if(localStorage.getItem('theme_light')==='true') toggleLightMode(true);
  history.pushState({ page: 'pgHome' }, '', '');
  window.onpopstate = function(event) { if (pageHistory.length > 0) executePageTransition(pageHistory.pop(), true); else executePageTransition('pgHome', true); };
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('share_id')) { openPage('pgShared'); listenToSharedDoc(urlParams.get('share_id')); }
};

function toggleLightMode(forceOn = false) {
  const isLight = forceOn || !document.body.classList.contains('light-mode');
  if(isLight) document.body.classList.add('light-mode'); else document.body.classList.remove('light-mode');
  localStorage.setItem('theme_light', isLight); if(chartInstance) renderStatsAndCharts();
}

function openPage(pageId) { executePageTransition(pageId, false); }
function executePageTransition(pageId, isBackAction) {
  clearInterval(quizTimer); clearTimeout(autoNextTimeout);
  const activeScreen = document.querySelector('.screen.active'); const currentId = activeScreen ? activeScreen.id : 'pgHome';
  if (!isBackAction && currentId !== pageId) { pageHistory.push(currentId); history.pushState({ page: pageId }, '', ''); }
  if (pageId !== 'pgFriends') closeChat();
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display='none'; });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const tgt = document.getElementById(pageId); if(tgt) { tgt.style.display='flex'; tgt.classList.add('active'); }
  if(pageId==='pgHome') { document.getElementById('navHome').classList.add('active'); buildQuizScopeDropdown(); }
  if(pageId==='pgTree') { document.getElementById('navTree').classList.add('active'); renderTree(); }
  if(pageId==='pgBox') { document.getElementById('navBox').classList.add('active'); renderBox(); }
  if(pageId==='pgStats') { document.getElementById('navStats').classList.add('active'); renderStatsAndCharts(); }
  if(pageId==='pgBackup') document.getElementById('navBackup').classList.add('active');
}

function getTopLevelCategories() { const children = new Set(); for (const parent in categoryTree) { (categoryTree[parent] || []).forEach(c => children.add(c)); } return categories.filter(c => !children.has(c)); }
function getAllSubcategories(catName, result = new Set()) { if (result.has(catName)) return [...result]; result.add(catName); if (categoryTree[catName]) categoryTree[catName].forEach(c => getAllSubcategories(c, result)); return [...result]; }
function renderTree() { const root = document.getElementById('treeRoot'); root.innerHTML = ''; getTopLevelCategories().forEach(cat => root.appendChild(createTreeNode(cat, 0))); }

function createTreeNode(catName, depth) {
  const container = document.createElement('div'); if (depth > 0) { container.style.marginLeft = '16px'; container.style.marginTop = '6px'; }
  const card = document.createElement('div'); card.className = 'tree-group-card'; if (depth > 0) { card.style.borderLeft = '3px solid var(--primary)'; card.style.borderRadius = '0 8px 8px 0'; }
  const header = document.createElement('div'); header.className = 'tree-group-header'; if (depth > 0) { header.style.background = 'var(--bg4)'; header.style.padding = '10px 14px'; }
  setupLongpress(header, () => handleCategoryLongpress(catName));
  const directCount = db.filter(q => q.category === catName).length; const children = categoryTree[catName] || []; const isExpanded = localStorage.getItem(`cat_exp_${catName}`) === 'true'; if (isExpanded) card.classList.add('expanded');
  const titleArea = document.createElement('div'); titleArea.className = 'tree-group-title'; titleArea.innerHTML = `<span>${depth===0?'📁':'📂'}</span> <span style="word-break:break-all;">${escapeHtml(catName)}</span> <span class="tree-cat-count">${directCount}</span>`; titleArea.onclick = (e) => { e.stopPropagation(); currentViewContext = { type: 'category', value: catName }; openPage('pgBox'); }; header.appendChild(titleArea);
  if (children.length > 0) { const arrow = document.createElement('div'); arrow.className = 'tree-group-arrow'; arrow.innerText = isExpanded ? '▼' : '▶'; arrow.onclick = (e) => { e.stopPropagation(); const nextState = !card.classList.contains('expanded'); card.classList.toggle('expanded'); arrow.innerText = nextState ? '▼' : '▶'; localStorage.setItem(`cat_exp_${catName}`, nextState); }; header.appendChild(arrow); }
  card.appendChild(header);
  if (children.length > 0) { const childContainer = document.createElement('div'); childContainer.className = 'tree-group-children'; children.forEach(c => childContainer.appendChild(createTreeNode(c, depth + 1))); card.appendChild(childContainer); }
  container.appendChild(card); return container;
}
function addNewRootCategory() { const txt = document.getElementById('txtNewRoot').value.trim(); if(!txt) return; if(categories.includes(txt)) return alert("既に使用されているフォルダー名です。"); categories.push(txt); document.getElementById('txtNewRoot').value = ''; saveData(); renderTree(); }

function setupLongpress(element, actionCallback) {
  let pressTimer = null; let startX = 0, startY = 0; let isDragging = false;
  const startHandler = (e) => { if (e.type === 'contextmenu') { e.preventDefault(); return; } if (e.touches && e.touches.length > 1) return; let clientX = e.touches ? e.touches[0].clientX : e.clientX; let clientY = e.touches ? e.touches[0].clientY : e.clientY; startX = clientX; startY = clientY; isDragging = false; pressTimer = setTimeout(() => { if (!isDragging) { if (navigator.vibrate) navigator.vibrate(50); actionCallback(); } }, 500); };
  const moveHandler = (e) => { if(!pressTimer) return; let clientX = e.touches ? e.touches[0].clientX : e.clientX; let clientY = e.touches ? e.touches[0].clientY : e.clientY; if(Math.abs(clientX - startX) > 10 || Math.abs(clientY - startY) > 10) { isDragging = true; clearTimeout(pressTimer); pressTimer = null; } };
  const cancelHandler = () => { if(pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  element.addEventListener('mousedown', startHandler); element.addEventListener('touchstart', startHandler, { passive: true }); element.addEventListener('mousemove', moveHandler); element.addEventListener('touchmove', moveHandler, { passive: true }); element.addEventListener('mouseup', cancelHandler); element.addEventListener('mouseleave', cancelHandler); element.addEventListener('touchend', cancelHandler); element.addEventListener('touchcancel', cancelHandler); element.addEventListener('contextmenu', e => { e.preventDefault(); });
}
function openContextMenu(title, items) { document.getElementById('ctxHeader').innerText = title; const body = document.getElementById('ctxBody'); body.innerHTML = ''; items.forEach(item => { if (item.type === 'separator') { const sep = document.createElement('div'); sep.className = 'menu-sep'; body.appendChild(sep); } else { const btn = document.createElement('button'); btn.className = `menu-item ${item.danger ? 'danger' : ''}`; btn.innerHTML = item.html; btn.onclick = () => { closeContextMenu(); item.action(); }; body.appendChild(btn); } }); document.getElementById('ctxOverlay').style.display = 'flex'; }
function closeContextMenu() { document.getElementById('ctxOverlay').style.display = 'none'; }
function handleCategoryLongpress(catName) {
  if (catName === "未分類") return alert("基本フォルダーは変更できません。");
  const subCats = getAllSubcategories(catName); const validParents = categories.filter(c => c !== catName && !subCats.includes(c));
  let moveOptions = validParents.map(p => ({ html: `📁 「${p}」の中へ移動`, action: () => { for(let g in categoryTree) { if(categoryTree[g]) categoryTree[g] = categoryTree[g].filter(c => c !== catName); } if(!categoryTree[p]) categoryTree[p] = []; categoryTree[p].push(catName); saveData(); renderTree(); } }));
  openContextMenu(`フォルダー: ${catName}`, [
    { html: '🔗 このフォルダーの共有URLを発行', action: () => shareCategory(catName) }, { type: 'separator' },
    { html: '➕ 中にサブフォルダーを作る', action: () => { const n = prompt(`「${catName}」の中に作成するフォルダー名:`); if(!n || n.trim() === "") return; if(categories.includes(n.trim())) return alert("既に存在します。"); categories.push(n.trim()); if(!categoryTree[catName]) categoryTree[catName] = []; categoryTree[catName].push(n.trim()); saveData(); renderTree(); } },
    { html: '📝 この直下に問題を追加', action: () => { currentViewContext = { type: 'category', value: catName }; showAddQModal(); } }, { type: 'separator' },
    { html: '✏️ フォルダー名を変更', action: () => { const n = prompt("新しいフォルダー名を入力:", catName); if(!n || n.trim() === "" || n === catName) return; if(categories.includes(n.trim())) return alert("既に同名が存在します。"); categories = categories.map(c => c === catName ? n.trim() : c); for(let p in categoryTree) { categoryTree[p] = categoryTree[p].map(c => c === catName ? n.trim() : c); } if(categoryTree[catName]) { categoryTree[n.trim()] = categoryTree[catName]; delete categoryTree[catName]; } db.forEach(q => { if(q.category === catName) q.category = n.trim(); }); saveData(); renderTree(); } },
    { html: '➕ 問題を一括追加 (Q,A 改行)', action: () => showBulkAddModal(catName) }, { type: 'separator' }, ...moveOptions, { type: 'separator' },
    { html: '❌ 削除 (中身も全て削除)', danger: true, action: () => { if(!confirm(`警告: 「${catName}」と中身を全て削除しますか？`)) return; const toDelete = getAllSubcategories(catName); db = db.filter(q => !toDelete.includes(q.category)); categories = categories.filter(c => !toDelete.includes(c)); for(let p in categoryTree) { if(toDelete.includes(p)) delete categoryTree[p]; else if(categoryTree[p]) categoryTree[p] = categoryTree[p].filter(c => !toDelete.includes(c)); } saveData(); renderTree(); } }
  ]);
}
function showBulkAddModal(catName) { targetBulkCategory = catName; document.getElementById('bulkAddTitle').innerText = `一括追加: ${catName}`; document.getElementById('txtBulkAdd').value = ''; document.getElementById('bulkAddOverlay').style.display = 'flex'; }
function closeBulkAdd() { document.getElementById('bulkAddOverlay').style.display = 'none'; }
function submitBulkAdd() {
  const text = document.getElementById('txtBulkAdd').value.trim(); if(!text) { closeBulkAdd(); return; } let count = 0;
  text.split(/\r?\n/).forEach(line => { let idx = line.indexOf(','); if(idx === -1) idx = line.indexOf('、'); if(idx !== -1) { const q = line.substring(0, idx).trim(), a = line.substring(idx + 1).trim(); if(q && a) { db.push({ id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q, answer: a, category: targetBulkCategory, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 }); count++; } } });
  autoMerge(); alert(`${count}件の問題を追加しました！`); closeBulkAdd(); if (document.getElementById('pgBox').classList.contains('active')) renderBox(); if (document.getElementById('pgTree').classList.contains('active')) renderTree();
}

function showAllCards() { currentViewContext = 'all'; const sb = document.getElementById('txtSearchBox'); if(sb) sb.value = ''; renderBox(); }
function filterBoxByStatus(statusType) { currentViewContext = statusType; openPage('pgBox'); }
function renderBox() {
  const container = document.getElementById('boxList'); container.innerHTML = ''; let filtered = [...db]; let titleString = "📝 全ての問題一覧"; const th = parseInt(document.getElementById('numGradThreshold').value) || 5;
  if (typeof currentViewContext === 'object' && currentViewContext.type === 'category') { const subCats = getAllSubcategories(currentViewContext.value); filtered = db.filter(q => subCats.includes(q.category)); titleString = `🔖 ${currentViewContext.value} 内のカード`; }
  else if (typeof currentViewContext === 'string' && currentViewContext !== 'all') {
    titleString = `📊 実績抽出カードの一覧`;
    if (currentViewContext === 'grad') filtered = db.filter(q => q.correct >= th); if (currentViewContext === 'master') filtered = db.filter(q => q.correct < th && q.level >= 3); if (currentViewContext === 'normal') filtered = db.filter(q => q.correct < th && q.level >= 1 && q.level <= 2); if (currentViewContext === 'weak') filtered = db.filter(q => q.correct < th && q.level === 0 && (q.correct+q.incorrect)>0); if (currentViewContext === 'shikkari') filtered = db.filter(q => q.correct < th && q.level === -1); if (currentViewContext === 'unseen') filtered = db.filter(q => q.correct === 0 && q.incorrect === 0 && q.level >= 0);
  }
  const sb = document.getElementById('txtSearchBox'); if (sb && sb.value.trim() !== '') { const kw = sb.value.trim().toLowerCase(); filtered = filtered.filter(q => q.question.toLowerCase().includes(kw) || q.answer.toLowerCase().includes(kw)); }
  document.getElementById('boxTitle').innerText = titleString; document.getElementById('lblBoxCount').innerText = `${filtered.length} 件`;
  if(filtered.length === 0) { container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text3);">問題がありません</div>'; return; }
  filtered.forEach(item => {
    const isGrad = item.correct >= th; const card = document.createElement('div'); card.className = 'q-card'; setupLongpress(card, () => handleQuestionLongpress(item)); _boxAnswerCache[item.id] = item.answer; const lvlStr = item.level === -1 ? 'しっかり' : 'LV '+item.level; const badgeHTML = `<span class="badge ${isGrad ? 'badge-grad':'badge-level'}">${isGrad ? 'GRADUATE' : lvlStr}</span>`;
    card.innerHTML = `<div class="q-card-text">${escapeHtml(item.question)}</div><div style="font-size:0.85rem; color:var(--text2); margin-bottom:8px; cursor:pointer;" data-id="${escapeHtml(item.id)}" data-shown="0" onclick="toggleCardAnswer(this)">A: <span style="background:var(--bg4); color:var(--text2); padding:2px 8px; border-radius:6px; border:1px solid var(--border); display:inline-block; font-size:0.75rem;">👆 タップして答えを表示</span></div><div class="q-card-sub">${badgeHTML}<span>正: ${item.correct} / 誤: ${item.incorrect}</span><span style="font-size:0.75rem; color:var(--text3);">📂 ${escapeHtml(item.category)}</span></div>`;
    container.appendChild(card);
  });
}
function toggleCardAnswer(el) {
  const itemId = el.getAttribute('data-id'); const ans = _boxAnswerCache[itemId] || ''; const shown = el.getAttribute('data-shown') === '1'; el.setAttribute('data-shown', shown ? '0' : '1');
  if (shown) { el.innerHTML = 'A: <span style="background:var(--bg4); color:var(--text2); padding:2px 8px; border-radius:6px; border:1px solid var(--border); display:inline-block; font-size:0.75rem;">👆 タップして答えを表示</span>'; } else { el.innerHTML = 'A: <span style="color:var(--text); font-weight:500;">' + escapeHtml(ans) + '</span><span style="color:var(--text3); font-size:0.7rem; margin-left:8px;">👆 隠す</span>'; }
}
function handleQuestionLongpress(item) {
  let moveOptions = []; categories.forEach(cat => { if (cat !== item.category) { moveOptions.push({ html: `📂 フォルダー「${cat}」へ移動`, action: () => { item.category = cat; saveData(); renderBox(); } }); } });
  openContextMenu("カード操作", [
    { html: '✏️ 編集', action: () => { const newQ = prompt("問題文を編集:", item.question); if(newQ === null) return; const newA = prompt("答えを編集:", item.answer); if(newA === null) return; item.question = newQ.trim() || item.question; item.answer = newA.trim() || item.answer; autoMerge(); renderBox(); } }, { type: 'separator' }, ...moveOptions, { type: 'separator' },
    { html: '🗑️ 削除', danger: true, action: () => { if(!confirm("完全に消去しますか？")) return; db = db.filter(q => q.id !== item.id); saveData(); renderBox(); } }
  ]);
}
function showAddQModal() {
  let defaultCat = "未分類"; if (typeof currentViewContext === 'object' && currentViewContext.type === 'category') defaultCat = currentViewContext.value;
  const q = prompt("新規追加：問題文"); if(!q || q.trim() === "") return; const a = prompt("新規追加：正解"); if(!a || a.trim() === "") return;
  db.push({ id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q.trim(), answer: a.trim(), category: defaultCat, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 }); autoMerge(); renderBox();
}
function buildQuizScopeDropdown() { const container = document.getElementById('scopeSelectors'); if(!container) return; container.innerHTML = ''; createScopeSelect(0, getTopLevelCategories()); }
function createScopeSelect(depth, categoriesToShow) {
  if (categoriesToShow.length === 0) return; const select = document.createElement('select'); select.className = 'form-control';
  if (depth === 0) { const optAll = document.createElement('option'); optAll.value = "all"; optAll.innerText = "🌐 全てから出題"; select.appendChild(optAll); }
  const optDefault = document.createElement('option'); optDefault.value = ""; optDefault.innerText = depth === 0 ? "📁 トップカテゴリー..." : "📂 サブカテゴリー..."; optDefault.disabled = true; optDefault.selected = true; select.appendChild(optDefault);
  categoriesToShow.forEach(cat => { const opt = document.createElement('option'); opt.value = cat; opt.innerText = depth === 0 ? `📁 ${cat}` : `📂 ${cat}`; select.appendChild(opt); });
  select.onchange = (e) => { const val = e.target.value; const container = document.getElementById('scopeSelectors'); const selects = Array.from(container.querySelectorAll('select')); selects.forEach((sel, idx) => { if (idx > depth) sel.remove(); }); if (val === "all") { selectedScopePath = ["all"]; return; } selectedScopePath[depth] = val; selectedScopePath = selectedScopePath.slice(0, depth + 1); const children = categoryTree[val] || []; if (children.length > 0) createScopeSelect(depth + 1, children); };
  document.getElementById('scopeSelectors').appendChild(select);
}
function renderStatsAndCharts() {
  const th = parseInt(document.getElementById('numGradThreshold').value) || 5; const t = db.length; document.getElementById('statTotal').innerText = t;
  const cG = db.filter(q => q.correct >= th).length, cM = db.filter(q => q.correct < th && q.level >= 3).length, cN = db.filter(q => q.correct < th && q.level >= 1 && q.level <= 2).length, cW = db.filter(q => q.correct < th && q.level === 0 && (q.correct+q.incorrect)>0).length, cS = db.filter(q => q.correct < th && q.level === -1).length, cU = db.filter(q => q.correct === 0 && q.incorrect === 0 && q.level >= 0).length;
  document.getElementById('cntGrad').innerText = cG; document.getElementById('cntMaster').innerText = cM; document.getElementById('cntNormal').innerText = cN; document.getElementById('cntWeak').innerText = cW; document.getElementById('cntShikkari').innerText = cS; document.getElementById('cntUnseen').innerText = cU; document.getElementById('statGradRatio').innerText = t > 0 ? `${Math.round((cG/t)*100)}%` : '0%';
  if(chartInstance) chartInstance.destroy(); const ctx = document.getElementById('rankPieChart').getContext('2d'); Chart.defaults.color = document.body.classList.contains('light-mode') ? '#4b5563' : '#e8edf5';
  chartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['卒業','得意','普通','苦手','しっかり'], datasets: [{ data: [cG,cM,cN,cW,cS], backgroundColor: ['#22c77a','#4f7cff','#f5a623','#ff4f6a','#9aa0a6'], borderWidth:0 }] }, options: { plugins: { legend: { position: 'bottom' } }, cutout: '70%' } });
  const hc = document.getElementById('heatmapContainer'); hc.innerHTML='';
  for(let i=0; i<30; i++) { const c = document.createElement('div'); c.className='heatmap-cell'; const lvl = i===29 ? (todayCorrectCount>10?4:todayCorrectCount>5?3:todayCorrectCount>0?2:0) : Math.floor(Math.random()*2); c.setAttribute('data-level', lvl); hc.appendChild(c); }
}
