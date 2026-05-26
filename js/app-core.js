// ★Firebase 初期化 (ご自身のConfigに置き換えてください)
const firebaseConfig = {
  apiKey: "AIzaSyAGoYBRoupEFHng_cXoiHmZf9eAlX8ZCHA", authDomain: "susuruanki.firebaseapp.com",
  projectId: "susuruanki", storageBucket: "susuruanki.firebasestorage.app",
  messagingSenderId: "926791749187", appId: "1:926791749187:web:2a96a39d61cbb4d3c7cef6", measurementId: "G-Q9ZMYX8BF8"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(); const firestore = firebase.firestore();

const STORAGE_KEY = 'susuru_anki_022g';
let currentUser = null, db = [], categories = ["未分類"], categoryTree = {};
let currentViewContext = 'all', pageHistory = [];
let chartInstance = null, currentCombo = 0, todayCorrectCount = 0;
let quizPool=[], quizIndex=0, quizTimer=null, autoNextTimeout=null;
let quizTimeLimit=0, quizTimeLeft=0, quizPhase='q', selectedChoiceIdx=null, currentQuestionGradThreshold=5, selectedScopePath=[];
let syncTimeout = null;

function getTodayStr() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

// ここを置き換える
window.addEventListener('DOMContentLoaded', () => {
  loadData(); 
  ensureSystemSanity(); 
  autoMerge();
  buildQuizScopeDropdown(); 
  if(localStorage.getItem('theme_light')==='true') toggleLightMode(true);
  
  history.pushState({ page: 'pgHome' }, '', '');
  window.onpopstate = function(event) {
    if (pageHistory.length > 0) executePageTransition(pageHistory.pop(), true);
    else executePageTransition('pgHome', true);
  };

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('share_id')) { 
      openPage('pgShared'); 
      listenToSharedDoc(urlParams.get('share_id')); 
  }
});

function toggleLightMode(forceOn = false) {
  const isLight = forceOn || !document.body.classList.contains('light-mode');
  if(isLight) document.body.classList.add('light-mode'); else document.body.classList.remove('light-mode');
  localStorage.setItem('theme_light', isLight);
  if(chartInstance) renderStatsAndCharts();
}

// ----------------- データ管理 -----------------
function loadData() {
  try { const raw=localStorage.getItem(STORAGE_KEY); if(raw){ const p=JSON.parse(raw); if(p.db) db=p.db; if(p.categories) categories=p.categories; if(p.categoryTree) categoryTree=p.categoryTree; } } catch(e){}
}
function saveData() {
  ensureSystemSanity();
  const payload = { db, categories, categoryTree };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (currentUser) {
    clearTimeout(syncTimeout);
    setSyncStatus('saving', '🔄 保存中...');
    syncTimeout = setTimeout(() => backgroundCloudSave(payload), 1000);
  }
}
function setSyncStatus(state, text) {
  const el = document.getElementById('cloudSyncStatus');
  if(!el) return;
  el.className = `sync-status ${state}`;
  el.innerText = text;
  if (state === 'success' || state === 'error') setTimeout(() => el.classList.add('hidden'), 3000);
}
async function backgroundCloudSave(payload) {
  try {
    await firestore.collection("susuru_anki_users").doc(currentUser.uid).set({
      version: "0.02.03-g", db: payload.db, categories: payload.categories,
      categoryTree: payload.categoryTree, lastSync: firebase.firestore.FieldValue.serverTimestamp()
    });
    setSyncStatus('success', '✅ 保存完了');
  } catch (err) { setSyncStatus('error', '⚠️ 保存エラー'); }
}

function ensureSystemSanity() {
  for (let parent in categoryTree) { if (!categories.includes(parent)) categories.push(parent); }
  if (!categories.includes("未分類")) categories.push("未分類");
  categories = [...new Set(categories.filter(c => c && c.trim() !== ""))];

  const activeCatsInTree = new Set();
  for (let p in categoryTree) { (categoryTree[p] || []).forEach(c => activeCatsInTree.add(c)); }
  categories = categories.filter(c => activeCatsInTree.has(c) || getTopLevelCategories().includes(c));

  db = db.filter(i => i && i.question && i.question.toString().trim() !== "" && i.answer && i.answer.toString().trim() !== "");
  db.forEach(item => {
    if(!item.id) item.id = 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    if(!item.category || !categories.includes(item.category)) {
      item.category = item.group && categories.includes(item.group) ? item.group : "未分類";
    }
    if(item.level === undefined) item.level = 0;
    if(item.correct === undefined) item.correct = 0;
    if(item.incorrect === undefined) item.incorrect = 0;
    if(item.streak === undefined) item.streak = 0;
    if(item.wrongStreak === undefined) item.wrongStreak = 0;
    if(item.shikkariStreak === undefined) item.shikkariStreak = 0;
  });
}

function autoMerge() {
  let mergedMap = new Map();
  db.forEach(item => {
    let safeCat = item.category ? String(item.category).trim() : "未分類";
    let key = `${safeCat}_${String(item.question).trim()}_${String(item.answer).trim()}`;
    if (!mergedMap.has(key)) { mergedMap.set(key, JSON.parse(JSON.stringify(item))); } 
    else {
      let ext = mergedMap.get(key);
      ext.correct = (Number(ext.correct)||0) + (Number(item.correct)||0);
      ext.incorrect = (Number(ext.incorrect)||0) + (Number(item.incorrect)||0);
      ext.level = Math.max(Number(ext.level)||0, Number(item.level)||0);
      ext.streak = Math.max(Number(ext.streak)||0, Number(item.streak)||0);
      ext.wrongStreak = Math.max(Number(ext.wrongStreak)||0, Number(item.wrongStreak)||0);
      ext.shikkariStreak = Math.max(Number(ext.shikkariStreak)||0, Number(item.shikkariStreak)||0);
    }
  });
  db = Array.from(mergedMap.values());
  saveData();
}

async function syncToCloud(isSilent = false) {
  if (!currentUser) { if (!isSilent) alert("Googleアカウントでログインしてください。"); return; }
  try {
    const ref = firestore.collection("susuru_anki_users").doc(currentUser.uid);
    const snap = await ref.get();
    if (snap.exists) {
      let r = snap.data();
      if (Array.isArray(r.db)) {
        let lMap = new Map(db.map(q => [q.id, q]));
        r.db.forEach(rq => {
          if (!rq.question || !rq.answer) return;
          if (lMap.has(rq.id)) {
            let lq = lMap.get(rq.id);
            if (rq.level > lq.level || rq.correct > lq.correct || rq.streak > lq.streak) lMap.set(rq.id, rq);
          } else lMap.set(rq.id, rq);
        });
        db = Array.from(lMap.values());
      }
      let rCat = r.categories || [];
      rCat.forEach(rc => { if (rc && !categories.includes(rc)) categories.push(rc); });
      let rTree = r.categoryTree || {};
      for (let p in rTree) {
        if (!categories.includes(p)) categories.push(p);
        if (!categoryTree[p]) categoryTree[p] = [];
        rTree[p].forEach(c => { if (!categoryTree[p].includes(c)) categoryTree[p].push(c); });
      }
    }
    ensureSystemSanity();
    await ref.set({ version: "0.02.03-g", db, categories, categoryTree, lastSync: firebase.firestore.FieldValue.serverTimestamp() });
    autoMerge();
    if (document.getElementById('pgTree').classList.contains('active')) renderTree();
    if (document.getElementById('pgBox').classList.contains('active')) renderBox();
    if (!isSilent) { alert(`☁️ 同期完了！`); openPage('pgHome'); }
  } catch (err) { if (!isSilent) alert(`⚠️ 同期エラー: ${err.message}\n(Firebaseのルール設定などを確認してください)`); }
}

// ----------------- お知らせ履歴 -----------------
async function loadUpdates() {
  const area = document.getElementById('updatesListArea');
  area.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:0.9rem;">読み込み中...</p>';
  try {
    const snap = await firestore.collection('susuru_anki_updates').orderBy('date','desc').limit(30).get();
    if(snap.empty) {
      area.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:0.9rem;">まだお知らせはありません。</p>';
      return;
    }
    area.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const dateStr = d.date && d.date.toDate ? d.date.toDate().toLocaleDateString('ja-JP') : '';
      area.innerHTML += `<div class="card" style="margin-bottom:10px;">
        <div class="update-banner-title" style="margin-bottom:8px;">🎉 ${escapeHtml(d.title)} (v${escapeHtml(d.version)}) 
          <span style="font-size:0.7rem; color:var(--text3); margin-left:auto;">${dateStr}</span>
        </div>
        <div style="font-size:0.85rem; line-height:1.5; color:var(--text); white-space:pre-wrap;">${escapeHtml(d.content)}</div>
      </div>`;
    });
  } catch(e) {
    console.warn("アプデ情報の取得に失敗しました", e);
    area.innerHTML = '<p style="text-align:center; color:var(--danger); font-size:0.9rem;">取得に失敗しました</p>';
  }
}

// ----------------- Firebase Auth -----------------
function firebaseLogin() { 
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => { 
    if (err.code === 'auth/popup-blocked') {
      alert("ポップアップがブロックされました。許可してからお試しください。");
    } else { alert("ログインエラー: " + err.message); }
  });
}
function firebaseLogout() { auth.signOut().then(()=>alert("ログアウトしました")); }
auth.onAuthStateChanged(user => {
  currentUser = user;
  const ls = document.getElementById('fbLoginState');
  if(user) {
    ls.innerHTML = `<span style="color:var(--success);">✅ ${escapeHtml(user.displayName || user.email)}</span>`;
    document.getElementById('btnFbLogin').style.display = 'none'; document.getElementById('btnFbLogout').style.display = 'inline-flex';
    document.getElementById('txtMyUid').value = user.uid;
    firestore.collection('susuru_anki_profiles').doc(user.uid).set({ displayName: user.displayName||'名無し', uid: user.uid }, { merge: true });
    syncToCloud(true);
    if (currentSharedDocId) listenToSharedDoc(currentSharedDocId);
  } else {
    ls.innerHTML = `<span style="color:var(--warn);">未ログイン</span>`;
    document.getElementById('btnFbLogin').style.display = 'inline-flex'; document.getElementById('btnFbLogout').style.display = 'none';
    document.getElementById('txtMyUid').value = '';
  }
});

// ----------------- 画面遷移 -----------------
function openPage(pageId) { executePageTransition(pageId, false); }
function executePageTransition(pageId, isBackAction) {
  clearInterval(quizTimer); clearTimeout(autoNextTimeout);
  const activeScreen = document.querySelector('.screen.active');
  const currentId = activeScreen ? activeScreen.id : 'pgHome';
  if (!isBackAction && currentId !== pageId) {
    pageHistory.push(currentId);
    history.pushState({ page: pageId }, '', '');
  }
  if (pageId !== 'pgFriends') closeChat();

  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display='none'; });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const tgt = document.getElementById(pageId);
  if(tgt) { tgt.style.display='flex'; tgt.classList.add('active'); }

  if(pageId==='pgHome') { document.getElementById('navHome').classList.add('active'); buildQuizScopeDropdown(); }
  if(pageId==='pgTree') { document.getElementById('navTree').classList.add('active'); renderTree(); }
  if(pageId==='pgBox') { document.getElementById('navBox').classList.add('active'); renderBox(); }
  if(pageId==='pgStats') { document.getElementById('navStats').classList.add('active'); renderStatsAndCharts(); }
  if(pageId==='pgBackup') document.getElementById('navBackup').classList.add('active');
}

// ----------------- ツリー機能 -----------------
function getTopLevelCategories() {
  const children = new Set();
  for (const parent in categoryTree) { (categoryTree[parent] || []).forEach(c => children.add(c)); }
  return categories.filter(c => !children.has(c));
}
function getAllSubcategories(catName, result = new Set()) {
  if (result.has(catName)) return [...result];
  result.add(catName);
  if (categoryTree[catName]) categoryTree[catName].forEach(c => getAllSubcategories(c, result));
  return [...result];
}

function renderTree() {
  const root = document.getElementById('treeRoot'); root.innerHTML = '';
  getTopLevelCategories().forEach(cat => root.appendChild(createTreeNode(cat, 0)));
}

function createTreeNode(catName, depth) {
  const container = document.createElement('div');
  if (depth > 0) { container.style.marginLeft = '16px'; container.style.marginTop = '6px'; }
  const card = document.createElement('div'); card.className = 'tree-group-card';
  if (depth > 0) { card.style.borderLeft = '3px solid var(--primary)'; card.style.borderRadius = '0 8px 8px 0'; }

  const header = document.createElement('div'); header.className = 'tree-group-header';
  if (depth > 0) { header.style.background = 'var(--bg4)'; header.style.padding = '10px 14px'; }
  setupLongpress(header, () => handleCategoryLongpress(catName));

  const directCount = db.filter(q => q.category === catName).length;
  const children = categoryTree[catName] || [];
  const isExpanded = localStorage.getItem(`cat_exp_${catName}`) === 'true';
  if (isExpanded) card.classList.add('expanded');

  const titleArea = document.createElement('div'); titleArea.className = 'tree-group-title';
  titleArea.innerHTML = `<span>${depth===0?'📁':'📂'}</span> <span style="word-break:break-all;">${escapeHtml(catName)}</span> <span class="tree-cat-count">${directCount}</span>`;
  titleArea.onclick = (e) => { e.stopPropagation(); currentViewContext = { type: 'category', value: catName }; openPage('pgBox'); };
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
    children.forEach(c => childContainer.appendChild(createTreeNode(c, depth + 1)));
    card.appendChild(childContainer);
  }
  container.appendChild(card); return container;
}

function addNewRootCategory() {
  const txt = document.getElementById('txtNewRoot').value.trim();
  if(!txt) return;
  if(categories.includes(txt)) return alert("既に使用されているフォルダー名です。");
  categories.push(txt); document.getElementById('txtNewRoot').value = '';
  saveData(); renderTree();
}

// ----------------- コンテキストメニュー & 長押し -----------------
function setupLongpress(element, actionCallback) {
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
      if (!isDragging) { 
        if (navigator.vibrate) navigator.vibrate(50); 
        actionCallback(); 
      }
    }, 500);
  };
  
  const moveHandler = (e) => { 
    if(!pressTimer) return;
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    if(Math.abs(clientX - startX) > 10 || Math.abs(clientY - startY) > 10) {
      isDragging = true; 
      clearTimeout(pressTimer); 
      pressTimer = null;
    }
  };
  
  const cancelHandler = () => { 
    if(pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };
  
  element.addEventListener('mousedown', startHandler); 
  element.addEventListener('touchstart', startHandler, { passive: true });
  element.addEventListener('mousemove', moveHandler); 
  element.addEventListener('touchmove', moveHandler, { passive: true });
  element.addEventListener('mouseup', cancelHandler); 
  element.addEventListener('mouseleave', cancelHandler);
  element.addEventListener('touchend', cancelHandler); 
  element.addEventListener('touchcancel', cancelHandler);
  element.addEventListener('contextmenu', e => { e.preventDefault(); });
}

function openContextMenu(title, items) {
  document.getElementById('ctxHeader').innerText = title;
  const body = document.getElementById('ctxBody'); body.innerHTML = '';
  items.forEach(item => {
    if (item.type === 'separator') {
      const sep = document.createElement('div'); sep.className = 'menu-sep'; body.appendChild(sep);
    } else {
      const btn = document.createElement('button'); btn.className = `menu-item ${item.danger ? 'danger' : ''}`;
      btn.innerHTML = item.html; btn.onclick = () => { closeContextMenu(); item.action(); }; body.appendChild(btn);
    }
  });
  document.getElementById('ctxOverlay').style.display = 'flex';
}
function closeContextMenu() { document.getElementById('ctxOverlay').style.display = 'none'; }

function handleCategoryLongpress(catName) {
  if (catName === "未分類") return alert("基本フォルダーは変更できません。");
  const subCats = getAllSubcategories(catName);
  const validParents = categories.filter(c => c !== catName && !subCats.includes(c));
  let moveOptions = validParents.map(p => ({
    html: `📁 「${p}」の中へ移動`,
    action: () => {
      for(let g in categoryTree) { if(categoryTree[g]) categoryTree[g] = categoryTree[g].filter(c => c !== catName); }
      if(!categoryTree[p]) categoryTree[p] = []; categoryTree[p].push(catName);
      saveData(); renderTree();
    }
  }));

  openContextMenu(`フォルダー: ${catName}`, [
    { html: '🔗 このフォルダーの共有URLを発行', action: () => { shareCategory(catName); } },
    { type: 'separator' },
    { html: '➕ 中にサブフォルダーを作る', action: () => {
        const n = prompt(`「${catName}」の中に作成するフォルダー名:`);
        if(!n || n.trim() === "") return; if(categories.includes(n.trim())) return alert("既に存在します。");
        categories.push(n.trim()); if(!categoryTree[catName]) categoryTree[catName] = [];
        categoryTree[catName].push(n.trim()); saveData(); renderTree();
      } },
    { html: '📝 この直下に問題を追加', action: () => { currentViewContext = { type: 'category', value: catName }; showAddQModal(); } },
    { type: 'separator' },
    { html: '✏️ フォルダー名を変更', action: () => {
        const n = prompt("新しいフォルダー名を入力:", catName);
        if(!n || n.trim() === "" || n === catName) return; if(categories.includes(n.trim())) return alert("既に同名が存在します。");
        categories = categories.map(c => c === catName ? n.trim() : c);
        for(let p in categoryTree) { categoryTree[p] = categoryTree[p].map(c => c === catName ? n.trim() : c); }
        if(categoryTree[catName]) { categoryTree[n.trim()] = categoryTree[catName]; delete categoryTree[catName]; }
        db.forEach(q => { if(q.category === catName) q.category = n.trim(); });
        saveData(); renderTree();
      } },
    { html: '➕ 問題を一括追加 (Q,A 改行)', action: () => { showBulkAddModal(catName); } },
    { type: 'separator' }, ...moveOptions, { type: 'separator' },
    { html: '❌ 削除 (中身も全て削除)', danger: true, action: () => {
        if(!confirm(`警告: 「${catName}」と中身を全て削除しますか？`)) return;
        const toDelete = getAllSubcategories(catName);
        db = db.filter(q => !toDelete.includes(q.category)); categories = categories.filter(c => !toDelete.includes(c));
        for(let p in categoryTree) { if(toDelete.includes(p)) delete categoryTree[p]; else if(categoryTree[p]) categoryTree[p] = categoryTree[p].filter(c => !toDelete.includes(c)); }
        saveData(); renderTree();
      } }
  ]);
}

// ----------------- 一括追加 -----------------
let targetBulkCategory = "";
function showBulkAddModal(catName) {
  targetBulkCategory = catName; document.getElementById('bulkAddTitle').innerText = `一括追加: ${catName}`;
  document.getElementById('txtBulkAdd').value = ''; document.getElementById('bulkAddOverlay').style.display = 'flex';
}
function closeBulkAdd() { document.getElementById('bulkAddOverlay').style.display = 'none'; }
function submitBulkAdd() {
  const text = document.getElementById('txtBulkAdd').value.trim();
  if(!text) { closeBulkAdd(); return; }
  let count = 0;
  text.split(/\r?\n/).forEach(line => {
    let idx = line.indexOf(','); if(idx === -1) idx = line.indexOf('、');
    if(idx !== -1) {
      const q = line.substring(0, idx).trim(), a = line.substring(idx + 1).trim();
      if(q && a) {
        db.push({ id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q, answer: a, category: targetBulkCategory, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 });
        count++;
      }
    }
  });
  autoMerge(); alert(`${count}件の問題を追加しました！`); closeBulkAdd();
  if (document.getElementById('pgBox').classList.contains('active')) renderBox();
  if (document.getElementById('pgTree').classList.contains('active')) renderTree();
}

// ----------------- 問題箱機能 -----------------
let _boxAnswerCache = {};
function showAllCards() { currentViewContext = 'all'; const sb = document.getElementById('txtSearchBox'); if(sb) sb.value = ''; renderBox(); }
function filterBoxByStatus(statusType) { currentViewContext = statusType; openPage('pgBox'); }

function renderBox() {
  const container = document.getElementById('boxList'); container.innerHTML = '';
  let filtered = [...db]; let titleString = "📝 全ての問題一覧";
  const th = parseInt(document.getElementById('numGradThreshold').value) || 5;

  if (typeof currentViewContext === 'object' && currentViewContext.type === 'category') {
    const subCats = getAllSubcategories(currentViewContext.value); filtered = db.filter(q => subCats.includes(q.category));
    titleString = `🔖 ${currentViewContext.value} 内のカード`;
  } else if (typeof currentViewContext === 'string' && currentViewContext !== 'all') {
    titleString = `📊 実績抽出カードの一覧`;
    if (currentViewContext === 'grad') filtered = db.filter(q => q.correct >= th);
    if (currentViewContext === 'master') filtered = db.filter(q => q.correct < th && q.level >= 3);
    if (currentViewContext === 'normal') filtered = db.filter(q => q.correct < th && q.level >= 1 && q.level <= 2);
    if (currentViewContext === 'weak') filtered = db.filter(q => q.correct < th && q.level === 0 && (q.correct+q.incorrect)>0);
    if (currentViewContext === 'shikkari') filtered = db.filter(q => q.correct < th && q.level === -1);
    if (currentViewContext === 'unseen') filtered = db.filter(q => q.correct === 0 && q.incorrect === 0 && q.level >= 0);
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
    setupLongpress(card, () => handleQuestionLongpress(item));
    _boxAnswerCache[item.id] = item.answer;

    const lvlStr = item.level === -1 ? 'しっかり' : 'LV '+item.level;
    const badgeHTML = `<span class="badge ${isGrad ? 'badge-grad':'badge-level'}">${isGrad ? 'GRADUATE' : lvlStr}</span>`;
    card.innerHTML = `
      <div class="q-card-text">${escapeHtml(item.question)}</div>
      <div style="font-size:0.85rem; color:var(--text2); margin-bottom:8px; cursor:pointer;" data-id="${escapeHtml(item.id)}" data-shown="0" onclick="toggleCardAnswer(this)">
        A: <span style="background:var(--bg4); color:var(--text2); padding:2px 8px; border-radius:6px; border:1px solid var(--border); display:inline-block; font-size:0.75rem;">👆 タップして答えを表示</span>
      </div>
      <div class="q-card-sub">${badgeHTML}<span>正: ${item.correct} / 誤: ${item.incorrect}</span><span style="font-size:0.75rem; color:var(--text3);">📂 ${escapeHtml(item.category)}</span></div>
    `;
    container.appendChild(card);
  });
}

function toggleCardAnswer(el) {
  const itemId = el.getAttribute('data-id'); const ans = _boxAnswerCache[itemId] || '';
  const shown = el.getAttribute('data-shown') === '1';
  el.setAttribute('data-shown', shown ? '0' : '1');
  if (shown) { el.innerHTML = 'A: <span style="background:var(--bg4); color:var(--text2); padding:2px 8px; border-radius:6px; border:1px solid var(--border); display:inline-block; font-size:0.75rem;">👆 タップして答えを表示</span>'; } 
  else { el.innerHTML = 'A: <span style="color:var(--text); font-weight:500;">' + escapeHtml(ans) + '</span><span style="color:var(--text3); font-size:0.7rem; margin-left:8px;">👆 隠す</span>'; }
}

function handleQuestionLongpress(item) {
  let moveOptions = [];
  categories.forEach(cat => {
    if (cat !== item.category) { moveOptions.push({ html: `📂 フォルダー「${cat}」へ移動`, action: () => { item.category = cat; saveData(); renderBox(); } }); }
  });
  openContextMenu("カード操作", [
    { html: '✏️ 編集', action: () => {
        const newQ = prompt("問題文を編集:", item.question); if(newQ === null) return;
        const newA = prompt("答えを編集:", item.answer); if(newA === null) return;
        item.question = newQ.trim() || item.question; item.answer = newA.trim() || item.answer;
        autoMerge(); renderBox();
      } },
    { type: 'separator' }, ...moveOptions, { type: 'separator' },
    { html: '🗑️ 削除', danger: true, action: () => { if(!confirm("完全に消去しますか？")) return; db = db.filter(q => q.id !== item.id); saveData(); renderBox(); } }
  ]);
}

function showAddQModal() {
  let defaultCat = "未分類";
  if (typeof currentViewContext === 'object' && currentViewContext.type === 'category') defaultCat = currentViewContext.value;
  const q = prompt("新規追加：問題文"); if(!q || q.trim() === "") return;
  const a = prompt("新規追加：正解"); if(!a || a.trim() === "") return;
  db.push({ id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q.trim(), answer: a.trim(), category: defaultCat, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 });
  autoMerge(); renderBox();
}

// ----------------- クイズ機能 -----------------
function buildQuizScopeDropdown() {
  const container = document.getElementById('scopeSelectors'); if(!container) return;
  container.innerHTML = ''; createScopeSelect(0, getTopLevelCategories());
}
function createScopeSelect(depth, categoriesToShow) {
  if (categoriesToShow.length === 0) return;
  const select = document.createElement('select'); select.className = 'form-control';
  if (depth === 0) { const optAll = document.createElement('option'); optAll.value = "all"; optAll.innerText = "🌐 全てから出題"; select.appendChild(optAll); }
  const optDefault = document.createElement('option'); optDefault.value = ""; optDefault.innerText = depth === 0 ? "📁 トップカテゴリー..." : "📂 サブカテゴリー..."; optDefault.disabled = true; optDefault.selected = true; select.appendChild(optDefault);
  categoriesToShow.forEach(cat => { const opt = document.createElement('option'); opt.value = cat; opt.innerText = depth === 0 ? `📁 ${cat}` : `📂 ${cat}`; select.appendChild(opt); });
  select.onchange = (e) => {
    const val = e.target.value; const container = document.getElementById('scopeSelectors');
    const selects = Array.from(container.querySelectorAll('select')); selects.forEach((sel, idx) => { if (idx > depth) sel.remove(); });
    if (val === "all") { selectedScopePath = ["all"]; return; }
    selectedScopePath[depth] = val; selectedScopePath = selectedScopePath.slice(0, depth + 1);
    const children = categoryTree[val] || []; if (children.length > 0) createScopeSelect(depth + 1, children);
  };
  document.getElementById('scopeSelectors').appendChild(select);
}

// 正規化 (別解の / や | を考慮)
function normalizeAnswer(str) {
  if(!str) return '';
  let s = String(str).replace(/[Ａ-Ｚａ-ｚ０-９]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).toLowerCase().trim();
  s = s.replace(/擦/g, 'こす'); // 漢字揺れ対策
  // 別解対応: 最初の一つだけを正解のベースにする
  s = s.replace(/[、，＼＼ \u3000]+/g, ',');
  return s.split(',').map(x=>x.trim()).filter(x=>x!=='').sort().join(',');
}
function isAnswerCorrect(input, correctAnswer) {
  const norms = correctAnswer.split(/[/|]/).map(a => normalizeAnswer(a));
  const inNorm = normalizeAnswer(input);
  return norms.includes(inNorm);
}

function startQuiz(modeType = 'normal') {
  currentCombo = 0; todayCorrectCount = 0;
  let scope = "all";
  if (selectedScopePath.length > 0 && selectedScopePath[0] !== "all") scope = "cat:" + selectedScopePath[selectedScopePath.length - 1];
  
  const includeGrad = document.getElementById('chkIncludeGrad').checked;
  const limitCount = parseInt(document.getElementById('numQCount').value) || 10;
  currentQuestionGradThreshold = parseInt(document.getElementById('numGradThreshold').value) || 5;

  let subset = [...db];
  
  if (modeType === 'tokkun') subset = subset.filter(q => q.level <= 0 || q.level === -1);
  else if (modeType === 'review') subset = subset.filter(q => q.correct >= currentQuestionGradThreshold);
  else if (!includeGrad) subset = subset.filter(q => q.correct < currentQuestionGradThreshold);

  if(scope.startsWith('cat:')) {
    const cName = scope.replace('cat:', '');
    const targets = getAllSubcategories(cName);
    subset = subset.filter(q => targets.includes(q.category));
  }

  if(subset.length === 0) return alert("⚠️ 条件に合致する問題が見つかりませんでした。");
  for (let i = subset.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [subset[i], subset[j]] = [subset[j], subset[i]]; }
  quizPool = subset.slice(0, limitCount); quizIndex = 0;

  if (document.getElementById('chkSwapQA').checked) quizPool = quizPool.map(q => ({ ...q, question: q.answer, answer: q.question }));

  openPage('pgQuizPlayer'); loadQuizQuestion();
}

function loadQuizQuestion() {
  quizPhase='q'; selectedChoiceIdx=null; window.currentSelfJudge=null;
  const cur = quizPool[quizIndex];
  document.getElementById('lblQuizProgress').innerText = `Q ${quizIndex+1}/${quizPool.length}`;
  document.getElementById('lblQuizQuestion').innerText = cur.question;
  document.getElementById('quizFeedback').style.display = 'none';
  document.getElementById('txtQuickNote').value = cur.note || '';

  if(document.getElementById('chkTTS').checked) {
    window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(cur.question); u.lang='ja-JP'; window.speechSynthesis.speak(u);
  }

  const mode = document.getElementById('selQuizMode').value;
  ['boxChoiceArea','boxDescArea','boxMinhayaArea','boxSelfArea', 'boxTapArea'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('btnQuizAction').style.display='inline-flex'; document.getElementById('btnQuizPass').style.display='inline-flex';
  document.getElementById('btnQuizAction').innerText='確定する';

  if(mode==='choice') { document.getElementById('boxChoiceArea').style.display='grid'; buildFourChoices(cur); }
  else if(mode==='minhaya') { document.getElementById('boxMinhayaArea').style.display='block'; buildMinhayaMode(cur); document.getElementById('btnQuizAction').style.display='none'; }
  else if(mode==='tap') { document.getElementById('boxTapArea').style.display='block'; buildTapChoices(cur); document.getElementById('btnQuizAction').style.display='none'; }
  else if(mode==='self') { document.getElementById('boxSelfArea').style.display='block'; buildSelfMode(cur); document.getElementById('btnQuizAction').style.display='none'; document.getElementById('btnQuizPass').style.display='none'; }
  else { document.getElementById('boxDescArea').style.display='block'; document.getElementById('txtDescAnswer').value=''; document.getElementById('txtDescAnswer').disabled=false; document.getElementById('txtDescAnswer').focus(); }

  const speed = document.getElementById('selQuizSpeed').value;
  let base = 15; if(speed==='easy') base=25; else if(speed==='hard') base=10; else if(speed==='expert') base=5;
  if(cur.answer.length > 5) base += Math.min(15, (cur.answer.length - 5) * 1.5);
  if(document.getElementById('chkTimeAttack').checked) base *= 0.5;

  quizTimeLimit = base; quizTimeLeft = base;
  clearInterval(quizTimer); updateTimerUI();
  
  let hintShown = false; document.getElementById('lblQuizHint').style.display = 'none';
  quizTimer = setInterval(() => {
    quizTimeLeft -= 0.1; updateTimerUI();
    if(quizTimeLeft<=0) { clearInterval(quizTimer); evaluateRoundAnswer(false, "⏰ 時間切れ"); }
    if (speed !== 'expert' && !hintShown && quizTimeLeft < (quizTimeLimit * (speed === 'easy' ? 0.7 : 0.4))) {
      hintShown = true; const hb = document.getElementById('lblQuizHint');
      const ans1 = cur.answer.split(/[/|]/)[0].trim();
      hb.innerText = `ヒント: 先頭は「 ${ans1.charAt(0)} 」 ${ans1.length>3?`(全 ${ans1.length} 文字)`:''}`;
      hb.style.display = 'inline-block';
    }
  }, 100);
}

function updateTimerUI() {
  const pct = (quizTimeLeft/quizTimeLimit)*100;
  const bar = document.getElementById('barTimerFill'); bar.style.width=`${pct}%`;
  bar.className = `timer-bar-fill ${pct<30?'warning':''}`;
  document.getElementById('lblQuizTimerText').innerText = `${Math.max(0, quizTimeLeft).toFixed(1)}s`;
}

function getPrimaryAnswer(ans) { return ans.split(/[/|]/)[0].trim(); }

// 4択
function buildFourChoices(cur) {
  const area = document.getElementById('boxChoiceArea'); area.innerHTML = '';
  const correctPrimary = getPrimaryAnswer(cur.answer);
  
  let altCandidates = [];
  const catAnswers = db.filter(q => q.category === cur.category && getPrimaryAnswer(q.answer) !== correctPrimary).map(q => getPrimaryAnswer(q.answer));
  altCandidates = [...new Set(catAnswers)];
  if(altCandidates.length < 3) {
    const globalAnswers = db.filter(q => getPrimaryAnswer(q.answer) !== correctPrimary).map(q => getPrimaryAnswer(q.answer));
    altCandidates = [...new Set([...altCandidates, ...globalAnswers])];
  }
  altCandidates.sort(() => Math.random() - 0.5);
  let finalFour = [correctPrimary, ...altCandidates.slice(0, 3)];
  while (finalFour.length < 4) finalFour.push(`選択肢_${Math.floor(Math.random()*1000)}`);
  finalFour.sort(() => Math.random() - 0.5);

  finalFour.forEach((text, i) => {
    const btn = document.createElement('button'); btn.className = 'choice-btn';
    btn.innerHTML = `<div class="choice-idx">${i+1}</div><div style="flex:1;">${escapeHtml(text)}</div>`;
    btn.onclick = () => {
      if(quizPhase !== 'q') return;
      document.querySelectorAll('.choice-btn').forEach(b => b.style.borderColor = 'var(--border)');
      btn.style.borderColor = 'var(--primary)'; selectedChoiceIdx = text;
    };
    area.appendChild(btn);
  });
}

// みんはや
let minhayaTarget = ""; let minhayaPos = 0;
function buildMinhayaMode(cur) {
  minhayaTarget = getPrimaryAnswer(cur.answer); minhayaPos = 0; renderMinhayaDisplay(cur);
}
function renderMinhayaDisplay(cur) {
  const area = document.getElementById('boxMinhayaArea'); area.innerHTML = '';
  
  let hintType = '';
  if(/^[ぁ-ん]+$/.test(minhayaTarget)) hintType = `【${minhayaTarget.length}文字】(ひらがなのみ)`;
  else if(/^[ァ-ヶ]+$/.test(minhayaTarget)) hintType = `【${minhayaTarget.length}文字】(カタカナのみ)`;
  else if(/^[a-zA-Z]+$/.test(minhayaTarget)) hintType = `【${minhayaTarget.length}文字】(アルファベット)`;
  else hintType = `【${minhayaTarget.length}文字】(漢字など含む)`;
  
  const hintDiv = document.createElement('div');
  hintDiv.style.cssText = 'text-align:center; font-size:0.75rem; color:var(--warn); margin-bottom:10px; font-weight:bold;';
  hintDiv.innerText = `💡 ヒント: ${hintType}`;
  area.appendChild(hintDiv);

  const slotsDiv = document.createElement('div');
  slotsDiv.style.cssText = 'display:flex; flex-wrap:wrap; justify-content:center; gap:6px; margin-bottom:18px;';
  for (let i = 0; i < minhayaTarget.length; i++) {
    const slot = document.createElement('div'); const filled = i < minhayaPos; const current = i === minhayaPos;
    slot.style.cssText = `min-width:42px; height:46px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.3rem; font-weight:bold; padding:0 6px; border:2px solid ${filled ? 'var(--success)' : current ? 'var(--primary)' : 'var(--border)'}; background:${filled ? 'rgba(34,199,122,0.12)' : current ? 'rgba(79,124,255,0.1)' : 'var(--bg3)'}; color:${filled ? 'var(--success)' : current ? 'var(--primary)' : 'var(--text3)'};`;
    slot.innerText = filled ? minhayaTarget[i] : (current ? '?' : '＿');
    slotsDiv.appendChild(slot);
  }
  area.appendChild(slotsDiv);

  if (minhayaPos >= minhayaTarget.length) return;

  const correctChar = minhayaTarget[minhayaPos];
  let distChars = [];
  db.forEach(q => getPrimaryAnswer(q.answer).split('').forEach(c => { if (!/[\s,、，。・/|]/.test(c) && c !== correctChar) distChars.push(c); }));
  distChars = [...new Set(distChars)].sort(() => Math.random() - 0.5);
  
  let choices = [correctChar, ...distChars.slice(0, 3)];
  const fallbacks = 'あいうえおかきくけこさしすせそ'.split('').filter(c=>c!==correctChar);
  while(choices.length < 4) choices.push(fallbacks[Math.floor(Math.random()*fallbacks.length)]);
  choices.sort(() => Math.random() - 0.5);

  const choicesDiv = document.createElement('div'); choicesDiv.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:10px;';
  choices.forEach(c => {
    const btn = document.createElement('button'); btn.className = 'choice-btn'; btn.style.cssText = 'justify-content:center; font-size:1.6rem; font-weight:bold; height:60px;'; btn.innerText = c;
    btn.onclick = () => {
      if (quizPhase !== 'q') return;
      if (c === correctChar) {
        minhayaPos++;
        if (minhayaPos >= minhayaTarget.length) { clearInterval(quizTimer); evaluateRoundAnswer(true, "🎉 正解！"); } else renderMinhayaDisplay(cur);
      } else {
        clearInterval(quizTimer); btn.style.background = 'rgba(255,79,106,0.3)'; btn.style.borderColor = 'var(--danger)';
        setTimeout(() => evaluateRoundAnswer(false, "❌ 不正解"), 300);
      }
    };
    choicesDiv.appendChild(btn);
  });
  area.appendChild(choicesDiv);
}

// タップ
let currentTapTarget = ""; let currentTapInput = [];
function buildTapChoices(cur) {
  currentTapTarget = getPrimaryAnswer(cur.answer); currentTapInput = [];
  const inArea = document.getElementById('tapInputArea'); const chArea = document.getElementById('tapChoiceArea');
  inArea.innerHTML = ''; chArea.innerHTML = '';
  
  let chars = currentTapTarget.split('');
  let allChars = db.map(q => getPrimaryAnswer(q.answer)).join('').replace(/[、，／/ \u3000,\da-zA-Z|]/g, '').split('');
  if(allChars.length===0) allChars='あいうえおかきくけこ'.split('');
  for(let i=0;i<2;i++) chars.push(allChars[Math.floor(Math.random()*allChars.length)]);
  chars.sort(() => Math.random() - 0.5);
  
  chars.forEach((c, idx) => {
    const btn = document.createElement('button'); btn.className = 'btn btn-secondary'; btn.style.cssText = 'width:48px; height:48px; padding:0; font-size:1.3rem;'; btn.innerText = c; btn.id = 'tap_btn_' + idx;
    btn.onclick = () => {
      if (quizPhase !== 'q') return;
      currentTapInput.push({ char: c, id: btn.id }); btn.style.display = 'none'; renderTapInput();
      if (currentTapInput.length === currentTapTarget.length) {
        clearInterval(quizTimer);
        const inputStr = currentTapInput.map(x => x.char).join('');
        evaluateRoundAnswer(inputStr === currentTapTarget, inputStr === currentTapTarget ? "🎉 正解！" : "❌ 不正解");
      }
    };
    chArea.appendChild(btn);
  });
}
function renderTapInput() {
  const inArea = document.getElementById('tapInputArea'); inArea.innerHTML = '';
  if (currentTapInput.length === 0) { inArea.innerHTML = '<span style="color:var(--text3); font-size:0.85rem;">順番にタップしてください</span>'; return; }
  currentTapInput.forEach((item, index) => {
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--primary); color:#fff; width:36px; height:36px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:1.2rem; font-weight:bold; cursor:pointer;';
    box.innerText = item.char;
    box.onclick = (e) => {
      e.stopPropagation(); if (quizPhase !== 'q') return;
      const removed = currentTapInput.splice(index, 1)[0]; document.getElementById(removed.id).style.display = 'inline-flex'; renderTapInput();
    };
    inArea.appendChild(box);
  });
}

// 自己申告
function buildSelfMode(cur) { document.getElementById('btnShowAnswer').style.display = 'inline-flex'; document.getElementById('selfJudgeArea').style.display = 'none'; }
function showSelfAnswer() {
  clearInterval(quizTimer); document.getElementById('btnShowAnswer').style.display = 'none';
  document.getElementById('selfAnswerDisplay').innerText = `A: ${getPrimaryAnswer(quizPool[quizIndex].answer)}`;
  document.getElementById('selfJudgeArea').style.display = 'block';
}
function submitSelfMode(judge) {
  window.currentSelfJudge = judge;
  evaluateRoundAnswer(judge !== 'miss', judge === 'perfect' ? "🎉 完璧！" : judge === 'good' ? "👍 普通" : "❌ ミス");
}

function passQuizQuestion() { clearInterval(quizTimer); evaluateRoundAnswer(false, "🏳️ パスしました"); }

function submitQuizAction() {
  if (quizPhase === 'a') {
    clearTimeout(autoNextTimeout); quizIndex++;
    if(quizIndex < quizPool.length) loadQuizQuestion();
    else { alert("🏁 クイズ終了！実績を確認しましょう。"); openPage('pgStats'); }
    return;
  }
  clearInterval(quizTimer);
  const cur = quizPool[quizIndex]; let isCorrect = false;
  const mode = document.getElementById('selQuizMode').value;
  if (mode === 'choice') { if(!selectedChoiceIdx) return; isCorrect = isAnswerCorrect(selectedChoiceIdx, cur.answer); } 
  else { isCorrect = isAnswerCorrect(document.getElementById('txtDescAnswer').value, cur.answer); }
  evaluateRoundAnswer(isCorrect, isCorrect ? "🎉 正解！" : "❌ 不正解");
}

function evaluateRoundAnswer(isCorrect, head) {
  quizPhase = 'a'; const cur = quizPool[quizIndex];
  let m = db.find(q => q.id === cur.id);
  
  if(m) {
    if(m.wrongStreak === undefined) m.wrongStreak = 0; if(m.shikkariStreak === undefined) m.shikkariStreak = 0;
    const mode = document.getElementById('selQuizMode').value;
    const multiplier = (mode === 'choice' || mode === 'tap' || mode === 'minhaya') ? 2 : 1; 
    const th = currentQuestionGradThreshold;

    if(isCorrect) {
      m.correct++; currentCombo++; todayCorrectCount++; showComboAnim(); recordDailyLog(true);
      if (mode === 'self' && window.currentSelfJudge === 'good') m.wrongStreak = 0;
      else { m.streak++; m.wrongStreak = 0; }
      
      if (m.level === -1) {
        m.shikkariStreak++;
        if (m.shikkariStreak >= 5 * multiplier) { m.level = 0; m.shikkariStreak = 0; m.streak = 0; }
      } else if (m.correct - 1 >= th) {
      } else {
        if (m.streak >= 2 * multiplier && m.level < 5) { m.level++; m.streak = 0; }
      }
    } else {
      m.incorrect++; m.wrongStreak++; m.streak = 0; m.shikkariStreak = 0;
      currentCombo = 0; recordDailyLog(false);

      if (m.correct >= th) {
        if (m.wrongStreak >= 3 * multiplier) { m.correct = th - 1; m.level = 2; m.wrongStreak = 0; }
      } else {
        if (m.level !== -1) {
          if (m.wrongStreak >= 4 * multiplier) { m.level = -1; m.wrongStreak = 0; m.correct = 0; } 
          else if (m.wrongStreak > 0 && m.wrongStreak % (2 * multiplier) === 0 && m.level > 0) m.level--;
        }
      }
    }
    saveData();
  }
  
  const fb = document.getElementById('quizFeedback');
  document.getElementById('feedbackResultText').innerText = head;
  document.getElementById('feedbackAnswerText').innerText = `正解: ${getPrimaryAnswer(cur.answer)}`;
  fb.className = `feedback-area ${isCorrect ? 'correct':'incorrect'}`; fb.style.display = 'flex';
  
  document.getElementById('btnQuizPass').style.display = 'none';
  document.getElementById('btnQuizAction').style.display = 'inline-flex';
  document.getElementById('btnQuizAction').innerText = '次の問題へ';

  const mode = document.getElementById('selQuizMode').value;
  if (['choice', 'tap', 'self', 'minhaya'].includes(mode)) {
    clearTimeout(autoNextTimeout); autoNextTimeout = setTimeout(() => { if (quizPhase === 'a') submitQuizAction(); }, 3000);
  }
}

function showComboAnim() {
  if(currentCombo < 2) return;
  const cd = document.getElementById('comboDisplay'); cd.innerText = `${currentCombo} COMBO!`;
  cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop');
}

function saveQuickNote(val) {
  const m = db.find(q=>q.id === quizPool[quizIndex].id); if(m) { m.note = val; saveData(); }
}

async function recordDailyLog(isCorrect) {
  if(!currentUser) return;
  const d = getTodayStr(); 
  const lRef = firestore.collection('susuru_anki_logs').doc(`${d}_${currentUser.uid}`);
  const sRef = firestore.collection('susuru_anki_daily_scores').doc(`${d}_${currentUser.uid}`);
  try {
    await lRef.set({ date:d, uid:currentUser.uid, name:currentUser.displayName, answered:firebase.firestore.FieldValue.increment(1), correct:firebase.firestore.FieldValue.increment(isCorrect?1:0) }, {merge:true});
    if(isCorrect) await sRef.set({ date:d, uid:currentUser.uid, name:currentUser.displayName, score:firebase.firestore.FieldValue.increment(1) }, {merge:true});
  } catch(e){}
}

// ----------------- 実績とグラフ -----------------
function renderStatsAndCharts() {
  const th = parseInt(document.getElementById('numGradThreshold').value) || 5;
  const t = db.length;
  document.getElementById('statTotal').innerText = t;
  const cG = db.filter(q => q.correct >= th).length;
  const cM = db.filter(q => q.correct < th && q.level >= 3).length;
  const cN = db.filter(q => q.correct < th && q.level >= 1 && q.level <= 2).length;
  const cW = db.filter(q => q.correct < th && q.level === 0 && (q.correct+q.incorrect)>0).length;
  const cS = db.filter(q => q.correct < th && q.level === -1).length;
  const cU = db.filter(q => q.correct === 0 && q.incorrect === 0 && q.level >= 0).length;

  document.getElementById('cntGrad').innerText = cG;
  document.getElementById('cntMaster').innerText = cM;
  document.getElementById('cntNormal').innerText = cN;
  document.getElementById('cntWeak').innerText = cW;
  document.getElementById('cntShikkari').innerText = cS;
  document.getElementById('cntUnseen').innerText = cU;
  document.getElementById('statGradRatio').innerText = t > 0 ? `${Math.round((cG/t)*100)}%` : '0%';

  if(chartInstance) chartInstance.destroy();
  const ctx = document.getElementById('rankPieChart').getContext('2d');
  Chart.defaults.color = document.body.classList.contains('light-mode') ? '#4b5563' : '#e8edf5';
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['卒業','得意','普通','苦手','しっかり'], datasets: [{ data: [cG,cM,cN,cW,cS], backgroundColor: ['#22c77a','#4f7cff','#f5a623','#ff4f6a','#9aa0a6'], borderWidth:0 }] },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
  });

  const hc = document.getElementById('heatmapContainer'); hc.innerHTML='';
  for(let i=0; i<30; i++) {
    const c = document.createElement('div'); c.className='heatmap-cell';
    const lvl = i===29 ? (todayCorrectCount>10?4:todayCorrectCount>5?3:todayCorrectCount>0?2:0) : Math.floor(Math.random()*2);
    c.setAttribute('data-level', lvl); hc.appendChild(c);
  }
}

// ----------------- JSON / CSV 管理 -----------------
function exportJSON() {
  const blob = new Blob([JSON.stringify({ db, categories, categoryTree }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `susuru_anki_${Date.now()}.json`; a.click();
}
function importJSON(e) {
  if(!e.target.files[0]) return;
  const r = new FileReader(); r.onload = function(evt) {
    try {
      const p = JSON.parse(evt.target.result); if(p.db) db = p.db; if(p.categories) categories = p.categories; if(p.categoryTree) categoryTree = p.categoryTree;
      autoMerge(); alert("📦 インポート成功！"); openPage('pgHome');
    } catch(err) { alert("無効なJSONです。"); }
  }; r.readAsText(e.target.files[0]);
}
function exportCSV() {
  let lines = [["問題", "答え", "フォルダー", "レベル", "正解数", "不正解数"]];
  db.forEach(q => lines.push([q.question, q.answer, q.category, q.level, q.correct, q.incorrect]));
  const csv = lines.map(l => l.map(t => `"${String(t).replace(/"/g, '""')}"`).join(",")).join("\n");
  const b = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `susuru_anki_${Date.now()}.csv`; a.click();
}
function importCSV(e) {
  if(!e.target.files[0]) return;
  const r = new FileReader(); r.onload = function(evt) {
    try {
      const lines = evt.target.result.split(/\r?\n/).filter(l => l.trim() !== "");
      if(lines.length < 2) return alert("データがありません。");
      const parse = (text) => {
        let f=[], cur="", inQ=false;
        for(let i=0; i<text.length; i++) { let c = text.charAt(i); if(c === '"') { if(inQ && text.charAt(i+1)==='"') { cur+='"'; i++; } else inQ = !inQ; } else if(c === ',' && !inQ) { f.push(cur); cur = ""; } else cur += c; }
        f.push(cur); return f;
      };
      const h = parse(lines[0]).map(x=>x.trim()); let iQ = h.indexOf("問題"), iA = h.indexOf("答え"), iC = h.indexOf("フォルダー");
      if(iQ===-1) iQ=0; if(iA===-1) iA=1; if(iC===-1) iC=2; let count = 0;
      for(let i=1; i<lines.length; i++) {
        const c = parse(lines[i]); if(c.length <= Math.max(iQ, iA)) continue;
        const q = c[iQ]?.trim(), a = c[iA]?.trim(); if(!q || !a) continue;
        let cat = (iC !== -1 && c[iC]) ? c[iC].trim() : "未分類"; if(!cat) cat="未分類";
        if(!categories.includes(cat)) categories.push(cat);
        db.push({ id: 'id_'+Math.random().toString(36).slice(2)+Date.now().toString(36), question: q, answer: a, category: cat, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 }); count++;
      }
      autoMerge(); alert(`📊 ${count}件インポートしました。`); openPage('pgHome');
    } catch(err) { alert("CSV解析に失敗しました。"); }
  }; r.readAsText(e.target.files[0]);
}
function factoryReset() { if(!confirm("⚠️ 全消去します。よろしいですか？")) return; localStorage.removeItem(STORAGE_KEY); db = []; categories = ["未分類"]; categoryTree = {}; saveData(); alert("💥 初期化完了。"); openPage('pgHome'); }
function escapeHtml(s) { if(!s) return ''; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

// ----------------- ランキング & フレンド & チャット -----------------
async function loadDailyRanking() {
  const listDiv = document.getElementById('rankingList');
  if (!currentUser) { listDiv.innerHTML = 'ログインしてください'; return; }
  const d = getTodayStr();
  try {
    listDiv.innerHTML = '(読み込み中...)';
    const snap = await firestore.collection('susuru_anki_daily_scores').where('date', '==', d).get();
    
    if(snap.empty) { listDiv.innerHTML = 'まだ今日のスコアがありません。あなたが1番乗りです！'; return; }
    
    let scores = [];
    snap.forEach(doc => scores.push(doc.data()));
    scores.sort((a, b) => (b.score || 0) - (a.score || 0));
    scores = scores.slice(0, 10);
    
    listDiv.innerHTML = '';
    let rank = 1;
    scores.forEach(data => {
      listDiv.innerHTML += `<div><span style="display:inline-block; width:24px; color:var(--warn); font-weight:bold;">${rank}</span>: ${escapeHtml(data.name)} <span style="color:var(--success); font-weight:bold;">(${data.score}問)</span></div>`;
      rank++;
    });
  } catch(e) {
    console.error(e);
    listDiv.innerHTML = '<span style="color:var(--danger)">ランキング取得エラー (通信状況等をご確認ください)</span>';
  }
}

function copyMyUid() {
  const uid = document.getElementById('txtMyUid').value; if (!uid) return alert("ログインが必要です。");
  navigator.clipboard.writeText(uid).then(() => alert("✅ UIDをコピーしました！"));
}
async function addAppFriend() {
  const fUid = document.getElementById('txtAddFriendUid').value.trim();
  if (!fUid) return alert("UIDを入力してください。"); if (!currentUser) return alert("ログインが必要です。"); if (fUid === currentUser.uid) return alert("自分自身は登録できません。");
  try {
    await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).set({ friends: firebase.firestore.FieldValue.arrayUnion(fUid) }, { merge: true });
    await firestore.collection('susuru_anki_profiles').doc(fUid).set({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) }, { merge: true });
    document.getElementById('txtAddFriendUid').value = ''; alert("✅ フレンドを追加しました！"); loadAppFriends();
  } catch (e) { alert("⚠️ フレンド追加に失敗しました。ルールの確認を。"); }
}

async function loadAppFriends() {
  const listDiv = document.getElementById('appFriendsList'); listDiv.innerHTML = '<p style="color:var(--text3); font-size:0.8rem; text-align:center;">読み込み中...</p>';
  if (!currentUser) { listDiv.innerHTML = '<p style="color:var(--danger); font-size:0.85rem; text-align:center;">ログインしてください</p>'; return; }
  try {
    const myProfileSnap = await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).get();
    const friends = myProfileSnap.exists ? (myProfileSnap.data().friends || []) : [];
    if (friends.length === 0) { listDiv.innerHTML = '<p style="color:var(--text3); font-size:0.85rem; text-align:center;">フレンドはいません。</p>'; return; }
    listDiv.innerHTML = '';
    for (const fUid of friends) {
      const fProfSnap = await firestore.collection('susuru_anki_profiles').doc(fUid).get();
      const fName = fProfSnap.exists ? fProfSnap.data().displayName : '未登録ユーザー';
      const div = document.createElement('div'); div.className = 'achieve-row';
      div.innerHTML = `<div class="achieve-label">👤 ${escapeHtml(fName)}</div><button class="btn" style="width:auto; padding:6px 12px; font-size:0.8rem;" onclick="openChat('${fUid}', '${escapeHtml(fName)}')">💬</button>`;
      listDiv.appendChild(div);
    }
  } catch (e) { listDiv.innerHTML = '<p style="color:var(--danger); font-size:0.8rem; text-align:center;">エラーが発生しました。</p>'; }
}

let currentChatUnsubscribe = null, currentChatFriendUid = null;
function getChatId(uid1, uid2) { return [uid1, uid2].sort().join('_'); }
function openChat(friendUid, friendName) {
  document.getElementById('friendsListArea').style.display = 'none'; document.getElementById('chatArea').style.display = 'flex'; document.getElementById('chatWithTitle').innerText = friendName + " とのチャット";
  currentChatFriendUid = friendUid; const chatId = getChatId(currentUser.uid, friendUid); const msgBox = document.getElementById('chatMessages'); msgBox.innerHTML = '履歴を取得中...';
  if (currentChatUnsubscribe) currentChatUnsubscribe();
  currentChatUnsubscribe = firestore.collection('susuru_anki_chats').doc(chatId).collection('messages').orderBy('timestamp', 'asc').onSnapshot(snap => {
    msgBox.innerHTML = ''; if (snap.empty) { msgBox.innerHTML = '<div style="color:var(--text3); text-align:center; font-size:0.8rem;">まだメッセージがありません。</div>'; }
    snap.forEach(doc => {
      const data = doc.data(); const isMe = data.senderId === currentUser.uid;
      const wrap = document.createElement('div'); wrap.style.cssText = `display:flex; flex-direction:column; max-width:80%; ${isMe ? 'align-self:flex-end;' : 'align-self:flex-start;'}`;
      const bubble = document.createElement('div'); bubble.style.cssText = `padding:10px 14px; border-radius:14px; font-size:0.9rem; word-break:break-all; ${isMe ? 'background:var(--primary); color:#fff; border-bottom-right-radius:2px;' : 'background:var(--bg3); border:1px solid var(--border); color:var(--text); border-bottom-left-radius:2px;'}`;
      bubble.innerText = data.text; wrap.appendChild(bubble); msgBox.appendChild(wrap);
    });
    msgBox.scrollTop = msgBox.scrollHeight;
  });
}
function closeChat() { if (currentChatUnsubscribe) { currentChatUnsubscribe(); currentChatUnsubscribe = null; } document.getElementById('chatArea').style.display = 'none'; document.getElementById('friendsListArea').style.display = 'flex'; currentChatFriendUid = null; }
async function sendChatMessage() {
  const input = document.getElementById('txtChatInput'); const text = input.value.trim(); if (!text || !currentChatFriendUid) return;
  const chatId = getChatId(currentUser.uid, currentChatFriendUid);
  try { await firestore.collection('susuru_anki_chats').doc(chatId).collection('messages').add({ text: text, senderId: currentUser.uid, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); input.value = ''; } catch (e) { alert("⚠️ エラーが発生しました。"); }
}

// ----------------- 共有カテゴリー -----------------
let currentSharedDocId = null, currentSharedData = null, unsubscribeShared = null;
async function shareCategory(catName) {
  if (!currentUser) return alert("管理画面からログインしてください。");
  const allTargets = getAllSubcategories(catName); const subset = db.filter(q => allTargets.includes(q.category));
  let partialTree = {}; allTargets.forEach(t => { if(categoryTree[t]) partialTree[t] = categoryTree[t]; });
  try {
    const docRef = await firestore.collection("susuru_anki_shared").add({ catName: catName, cards: subset, categories: allTargets, categoryTree: partialTree, ownerId: currentUser.uid, ownerName: currentUser.displayName || currentUser.email || '不明', friends: [], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    const shareUrl = window.location.origin + window.location.pathname + "?share_id=" + docRef.id; await navigator.clipboard.writeText(shareUrl); alert(`✅ URLを発行・コピーしました！\nURL: ${shareUrl}`);
  } catch(err) { alert("⚠️ URLの発行に失敗しました。ルールの確認を。"); }
}

function listenToSharedDoc(docId) {
  if (unsubscribeShared) unsubscribeShared(); currentSharedDocId = docId; document.getElementById('sharedTitle').innerText = "⏳ 読み込み中...";
  unsubscribeShared = firestore.collection("susuru_anki_shared").doc(docId).onSnapshot((snap) => {
    if (!snap.exists) { alert("⚠️ 共有データが見つかりません。"); exitSharedMode(); return; }
    currentSharedData = snap.data(); renderSharedPage();
  }, err => alert("⚠️ 共有データの取得に失敗しました。"));
}

function renderSharedPage() {
  if (!currentSharedData) return; const data = currentSharedData;
  document.getElementById('sharedTitle').innerText = `🌐 ${escapeHtml(data.catName)}`; document.getElementById('sharedOwnerName').innerText = escapeHtml(data.ownerName); document.getElementById('sharedCardCount').innerText = data.cards.length;
  const isOwner = currentUser && currentUser.uid === data.ownerId; const isFriend = currentUser && data.friends && data.friends.includes(currentUser.uid); const canEdit = isOwner || isFriend;
  document.getElementById('sharedOwnerPanel').style.display = isOwner ? 'block' : 'none'; document.getElementById('sharedEditorPanel').style.display = canEdit ? 'block' : 'none';
  if (isOwner) {
    const fList = document.getElementById('sharedFriendsList'); fList.innerHTML = ''; const friendsArray = data.friends || [];
    if (friendsArray.length === 0) fList.innerHTML = '<span style="font-size:0.8rem; color:var(--text3);">許可されたフレンドはいません。</span>';
    else friendsArray.forEach(fUid => fList.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg3); padding:8px; border-radius:6px; border:1px solid var(--border);"><span style="font-size:0.8rem;">${escapeHtml(fUid)}</span><button class="btn btn-danger" style="padding:4px 10px; font-size:0.75rem;" onclick="removeFriendFromShared('${fUid}')">削除</button></div>`);
  }
  const cList = document.getElementById('sharedCardsList'); cList.innerHTML = '';
  if (data.cards.length === 0) cList.innerHTML = '<div style="color:var(--text3); font-size:0.9rem; text-align:center;">カードがありません</div>';
  else data.cards.forEach((card, idx) => cList.innerHTML += `<div class="q-card"><div class="q-card-text">${escapeHtml(card.question)}</div><div style="font-size:0.85rem; color:var(--text2); margin-top:4px;">A: <span style="color:var(--text);">${escapeHtml(getPrimaryAnswer(card.answer))}</span></div><div style="font-size:0.75rem; color:var(--text3); margin-top:8px;">📂 ${escapeHtml(card.category)}</div>${canEdit ? `<button class="btn btn-secondary" style="margin-top:10px; font-size:0.8rem;" onclick="deleteCardFromShared(${idx})">🗑️ 削除</button>` : ''}</div>`);
}

async function addFriendToShared() {
  const uid = document.getElementById('txtNewFriendUid').value.trim(); if (!uid) return;
  const newFriends = [...(currentSharedData.friends || [])]; if (!newFriends.includes(uid)) newFriends.push(uid);
  try { await firestore.collection("susuru_anki_shared").doc(currentSharedDocId).update({ friends: newFriends }); document.getElementById('txtNewFriendUid').value = ''; } catch(e) {}
}
async function removeFriendFromShared(uid) {
  if (!confirm("権限を取り消しますか？")) return;
  const newFriends = (currentSharedData.friends || []).filter(u => u !== uid);
  try { await firestore.collection("susuru_anki_shared").doc(currentSharedDocId).update({ friends: newFriends }); } catch(e) {}
}
async function addCardToShared() {
  const q = document.getElementById('txtSharedNewQ').value.trim(), a = document.getElementById('txtSharedNewA').value.trim(); if (!q || !a) return;
  const newCard = { id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q, answer: a, category: currentSharedData.catName, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 };
  try { await firestore.collection("susuru_anki_shared").doc(currentSharedDocId).update({ cards: [...currentSharedData.cards, newCard] }); document.getElementById('txtSharedNewQ').value = ''; document.getElementById('txtSharedNewA').value = ''; } catch(e) {}
}
async function deleteCardFromShared(idx) {
  if (!confirm("クラウド上から削除しますか？")) return;
  const newCards = [...currentSharedData.cards]; newCards.splice(idx, 1);
  try { await firestore.collection("susuru_anki_shared").doc(currentSharedDocId).update({ cards: newCards }); } catch(e) {}
}

function importCurrentShared() {
  const data = currentSharedData; if (!data) return;
  if (!confirm(`取り込みますか？`)) return;
  (data.categories || []).forEach(c => { if(!categories.includes(c)) categories.push(c); });
  for (let p in (data.categoryTree || {})) { if (!categoryTree[p]) categoryTree[p] = []; (data.categoryTree[p] || []).forEach(c => { if (!categoryTree[p].includes(c)) categoryTree[p].push(c); }); }
  let count = 0;
  (data.cards || []).forEach(q => {
    if (!q.question || !q.answer) return;
    if (!db.some(d => normalizeAnswer(d.question) === normalizeAnswer(q.question) && d.category === q.category)) {
      db.push({ id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q.question, answer: q.answer, category: q.category, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 }); count++;
    }
  });
  autoMerge(); alert(`✅ 取り込みました！\n新規追加: ${count}件`); exitSharedMode();
}
function exitSharedMode() {
  if (unsubscribeShared) unsubscribeShared(); currentSharedDocId = null; currentSharedData = null;
  const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname; window.history.pushState({path: cleanUrl}, '', cleanUrl); openPage('pgHome');
}
// 1. Firebaseの設定
const firebaseConfig = { ... };

// 2. 変数の定義
let db = [];
let currentUser = null;
// ...ここに他の変数や関数がズラッと並んでいる...

// 3. 関数たち
function loadData() { ... }
function ensureSystemSanity() { ... }
// ...他の関数がずっと続いている...

// 4. 【ここが一番最後！】
// さっきのコードをここに貼る！
window.addEventListener('DOMContentLoaded', () => {
    // （省略）初期化のコード
});
