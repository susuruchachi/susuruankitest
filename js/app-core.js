console.log("アプリの読み込みが始まりました！");

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
let _boxAnswerCache = {}; let targetBulkCategory = "";
let minhayaTarget = ""; let minhayaPos = 0;
let currentTapTarget = ""; let currentTapInput = [];
let currentChatUnsubscribe = null, currentChatFriendUid = null;
let currentSharedDocId = null, currentSharedData = null, unsubscribeShared = null;

function getTodayStr() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

function loadData() {
  try { const raw=localStorage.getItem(STORAGE_KEY); if(raw){ const p=JSON.parse(raw); if(p.db) db=p.db; if(p.categories) categories=p.categories; if(p.categoryTree) categoryTree=p.categoryTree; } } catch(e){}
}
function saveData() {
  ensureSystemSanity(); const payload = { db, categories, categoryTree }; localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (currentUser) { clearTimeout(syncTimeout); setSyncStatus('saving', '🔄 保存中...'); syncTimeout = setTimeout(() => backgroundCloudSave(payload), 1000); }
}
function setSyncStatus(state, text) {
  const el = document.getElementById('cloudSyncStatus'); if(!el) return;
  el.className = `sync-status ${state}`; el.innerText = text;
  if (state === 'success' || state === 'error') setTimeout(() => el.classList.add('hidden'), 3000);
}
async function backgroundCloudSave(payload) {
  try {
    await firestore.collection("susuru_anki_users").doc(currentUser.uid).set({ version: "0.02.03-g", db: payload.db, categories: payload.categories, categoryTree: payload.categoryTree, lastSync: firebase.firestore.FieldValue.serverTimestamp() });
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
    if(!item.category || !categories.includes(item.category)) { item.category = item.group && categories.includes(item.group) ? item.group : "未分類"; }
    if(item.level === undefined) item.level = 0; if(item.correct === undefined) item.correct = 0; if(item.incorrect === undefined) item.incorrect = 0;
    if(item.streak === undefined) item.streak = 0; if(item.wrongStreak === undefined) item.wrongStreak = 0; if(item.shikkariStreak === undefined) item.shikkariStreak = 0;
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
      ext.correct = (Number(ext.correct)||0) + (Number(item.correct)||0); ext.incorrect = (Number(ext.incorrect)||0) + (Number(item.incorrect)||0);
      ext.level = Math.max(Number(ext.level)||0, Number(item.level)||0); ext.streak = Math.max(Number(ext.streak)||0, Number(item.streak)||0);
      ext.wrongStreak = Math.max(Number(ext.wrongStreak)||0, Number(item.wrongStreak)||0); ext.shikkariStreak = Math.max(Number(ext.shikkariStreak)||0, Number(item.shikkariStreak)||0);
    }
  });
  db = Array.from(mergedMap.values()); saveData();
}

async function syncToCloud(isSilent = false) {
  if (!currentUser) { if (!isSilent) alert("Googleアカウントでログインしてください。"); return; }
  try {
    const ref = firestore.collection("susuru_anki_users").doc(currentUser.uid); const snap = await ref.get();
    if (snap.exists) {
      let r = snap.data();
      if (Array.isArray(r.db)) {
        let lMap = new Map(db.map(q => [q.id, q]));
        r.db.forEach(rq => {
          if (!rq.question || !rq.answer) return;
          if (lMap.has(rq.id)) { let lq = lMap.get(rq.id); if (rq.level > lq.level || rq.correct > lq.correct || rq.streak > lq.streak) lMap.set(rq.id, rq); } else lMap.set(rq.id, rq);
        });
        db = Array.from(lMap.values());
      }
      let rCat = r.categories || []; rCat.forEach(rc => { if (rc && !categories.includes(rc)) categories.push(rc); });
      let rTree = r.categoryTree || {};
      for (let p in rTree) {
        if (!categories.includes(p)) categories.push(p); if (!categoryTree[p]) categoryTree[p] = [];
        rTree[p].forEach(c => { if (!categoryTree[p].includes(c)) categoryTree[p].push(c); });
      }
    }
    ensureSystemSanity(); await ref.set({ version: "0.02.03-g", db, categories, categoryTree, lastSync: firebase.firestore.FieldValue.serverTimestamp() }); autoMerge();
    if (document.getElementById('pgTree').classList.contains('active')) renderTree(); if (document.getElementById('pgBox').classList.contains('active')) renderBox();
    if (!isSilent) { alert(`☁️ 同期完了！`); openPage('pgHome'); }
  } catch (err) { if (!isSilent) alert(`⚠️ 同期エラー: ${err.message}`); }
}

async function loadUpdates() {
  const area = document.getElementById('updatesListArea'); area.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:0.9rem;">読み込み中...</p>';
  try {
    const snap = await firestore.collection('susuru_anki_updates').orderBy('date','desc').limit(30).get();
    if(snap.empty) { area.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:0.9rem;">まだお知らせはありません。</p>'; return; }
    area.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data(); const dateStr = d.date && d.date.toDate ? d.date.toDate().toLocaleDateString('ja-JP') : '';
      area.innerHTML += `<div class="card" style="margin-bottom:10px;"><div class="update-banner-title" style="margin-bottom:8px;">🎉 ${escapeHtml(d.title)} (v${escapeHtml(d.version)}) <span style="font-size:0.7rem; color:var(--text3); margin-left:auto;">${dateStr}</span></div><div style="font-size:0.85rem; line-height:1.5; color:var(--text); white-space:pre-wrap;">${escapeHtml(d.content)}</div></div>`;
    });
  } catch(e) { area.innerHTML = '<p style="text-align:center; color:var(--danger); font-size:0.9rem;">取得に失敗しました</p>'; }
}

function firebaseLogin() { 
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => { if (err.code === 'auth/popup-blocked') { alert("ポップアップがブロックされました。"); } else { alert("ログインエラー: " + err.message); } });
}
function firebaseLogout() { auth.signOut().then(()=>alert("ログアウトしました")); }
auth.onAuthStateChanged(user => {
  currentUser = user; const ls = document.getElementById('fbLoginState');
  if(user) {
    ls.innerHTML = `<span style="color:var(--success);">✅ ${escapeHtml(user.displayName || user.email)}</span>`;
    document.getElementById('btnFbLogin').style.display = 'none'; document.getElementById('btnFbLogout').style.display = 'inline-flex'; document.getElementById('txtMyUid').value = user.uid;
    firestore.collection('susuru_anki_profiles').doc(user.uid).set({ displayName: user.displayName||'名無し', uid: user.uid }, { merge: true }); syncToCloud(true);
    if (currentSharedDocId) listenToSharedDoc(currentSharedDocId);
  } else {
    ls.innerHTML = `<span style="color:var(--warn);">未ログイン</span>`; document.getElementById('btnFbLogin').style.display = 'inline-flex'; document.getElementById('btnFbLogout').style.display = 'none'; document.getElementById('txtMyUid').value = '';
  }
});

function exportJSON() {
  const blob = new Blob([JSON.stringify({ db, categories, categoryTree }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `susuru_anki_${Date.now()}.json`; a.click();
}
function importJSON(e) {
  if(!e.target.files[0]) return; const r = new FileReader();
  r.onload = function(evt) { try { const p = JSON.parse(evt.target.result); if(p.db) db = p.db; if(p.categories) categories = p.categories; if(p.categoryTree) categoryTree = p.categoryTree; autoMerge(); alert("📦 インポート成功！"); openPage('pgHome'); } catch(err) { alert("無効なJSONです。"); } }; r.readAsText(e.target.files[0]);
}
function exportCSV() {
  let lines = [["問題", "答え", "フォルダー", "レベル", "正解数", "不正解数"]]; db.forEach(q => lines.push([q.question, q.answer, q.category, q.level, q.correct, q.incorrect]));
  const csv = lines.map(l => l.map(t => `"${String(t).replace(/"/g, '""')}"`).join(",")).join("\n");
  const b = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `susuru_anki_${Date.now()}.csv`; a.click();
}
function importCSV(e) {
  if(!e.target.files[0]) return; const r = new FileReader();
  r.onload = function(evt) {
    try {
      const lines = evt.target.result.split(/\r?\n/).filter(l => l.trim() !== ""); if(lines.length < 2) return alert("データがありません。");
      const parse = (text) => { let f=[], cur="", inQ=false; for(let i=0; i<text.length; i++) { let c = text.charAt(i); if(c === '"') { if(inQ && text.charAt(i+1)==='"') { cur+='"'; i++; } else inQ = !inQ; } else if(c === ',' && !inQ) { f.push(cur); cur = ""; } else cur += c; } f.push(cur); return f; };
      const h = parse(lines[0]).map(x=>x.trim()); let iQ = h.indexOf("問題"), iA = h.indexOf("答え"), iC = h.indexOf("フォルダー");
      if(iQ===-1) iQ=0; if(iA===-1) iA=1; if(iC===-1) iC=2; let count = 0;
      for(let i=1; i<lines.length; i++) {
        const c = parse(lines[i]); if(c.length <= Math.max(iQ, iA)) continue; const q = c[iQ]?.trim(), a = c[iA]?.trim(); if(!q || !a) continue;
        let cat = (iC !== -1 && c[iC]) ? c[iC].trim() : "未分類"; if(!cat) cat="未分類"; if(!categories.includes(cat)) categories.push(cat);
        db.push({ id: 'id_'+Math.random().toString(36).slice(2)+Date.now().toString(36), question: q, answer: a, category: cat, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 }); count++;
      }
      autoMerge(); alert(`📊 ${count}件インポートしました。`); openPage('pgHome');
    } catch(err) { alert("CSV解析に失敗しました。"); }
  }; r.readAsText(e.target.files[0]);
}
function factoryReset() { if(!confirm("⚠️ 全消去します。よろしいですか？")) return; localStorage.removeItem(STORAGE_KEY); db = []; categories = ["未分類"]; categoryTree = {}; saveData(); alert("💥 初期化完了。"); openPage('pgHome'); }
function escapeHtml(s) { if(!s) return ''; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

// ランキング・フレンド・チャット機能
async function loadDailyRanking() {
  const listDiv = document.getElementById('rankingList'); if (!currentUser) { listDiv.innerHTML = 'ログインしてください'; return; }
  const d = getTodayStr();
  try {
    listDiv.innerHTML = '(読み込み中...)'; const snap = await firestore.collection('susuru_anki_daily_scores').where('date', '==', d).get();
    if(snap.empty) { listDiv.innerHTML = 'まだ今日のスコアがありません。あなたが1番乗りです！'; return; }
    let scores = []; snap.forEach(doc => scores.push(doc.data())); scores.sort((a, b) => (b.score || 0) - (a.score || 0)); scores = scores.slice(0, 10);
    listDiv.innerHTML = ''; let rank = 1;
    scores.forEach(data => { listDiv.innerHTML += `<div><span style="display:inline-block; width:24px; color:var(--warn); font-weight:bold;">${rank}</span>: ${escapeHtml(data.name)} <span style="color:var(--success); font-weight:bold;">(${data.score}問)</span></div>`; rank++; });
  } catch(e) { listDiv.innerHTML = '<span style="color:var(--danger)">ランキング取得エラー</span>'; }
}
function copyMyUid() { const uid = document.getElementById('txtMyUid').value; if (!uid) return alert("ログインが必要です。"); navigator.clipboard.writeText(uid).then(() => alert("✅ UIDをコピーしました！")); }
async function addAppFriend() {
  const fUid = document.getElementById('txtAddFriendUid').value.trim(); if (!fUid) return alert("UIDを入力してください。"); if (!currentUser) return alert("ログインが必要です。"); if (fUid === currentUser.uid) return alert("自分自身は登録できません。");
  try { await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).set({ friends: firebase.firestore.FieldValue.arrayUnion(fUid) }, { merge: true }); await firestore.collection('susuru_anki_profiles').doc(fUid).set({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) }, { merge: true }); document.getElementById('txtAddFriendUid').value = ''; alert("✅ フレンドを追加しました！"); loadAppFriends(); } catch (e) { alert("⚠️ フレンド追加に失敗しました。"); }
}
async function loadAppFriends() {
  const listDiv = document.getElementById('appFriendsList'); listDiv.innerHTML = '<p style="color:var(--text3); font-size:0.8rem; text-align:center;">読み込み中...</p>'; if (!currentUser) { listDiv.innerHTML = '<p style="color:var(--danger); font-size:0.85rem; text-align:center;">ログインしてください</p>'; return; }
  try {
    const myProfileSnap = await firestore.collection('susuru_anki_profiles').doc(currentUser.uid).get(); const friends = myProfileSnap.exists ? (myProfileSnap.data().friends || []) : [];
    if (friends.length === 0) { listDiv.innerHTML = '<p style="color:var(--text3); font-size:0.85rem; text-align:center;">フレンドはいません。</p>'; return; }
    listDiv.innerHTML = '';
    for (const fUid of friends) { const fProfSnap = await firestore.collection('susuru_anki_profiles').doc(fUid).get(); const fName = fProfSnap.exists ? fProfSnap.data().displayName : '未登録ユーザー'; const div = document.createElement('div'); div.className = 'achieve-row'; div.innerHTML = `<div class="achieve-label">👤 ${escapeHtml(fName)}</div><button class="btn" style="width:auto; padding:6px 12px; font-size:0.8rem;" onclick="openChat('${fUid}', '${escapeHtml(fName)}')">💬</button>`; listDiv.appendChild(div); }
  } catch (e) { listDiv.innerHTML = '<p style="color:var(--danger); font-size:0.8rem; text-align:center;">エラーが発生しました。</p>'; }
}
function getChatId(uid1, uid2) { return [uid1, uid2].sort().join('_'); }
function openChat(friendUid, friendName) {
  document.getElementById('friendsListArea').style.display = 'none'; document.getElementById('chatArea').style.display = 'flex'; document.getElementById('chatWithTitle').innerText = friendName + " とのチャット"; currentChatFriendUid = friendUid; const chatId = getChatId(currentUser.uid, friendUid); const msgBox = document.getElementById('chatMessages'); msgBox.innerHTML = '履歴を取得中...';
  if (currentChatUnsubscribe) currentChatUnsubscribe();
  currentChatUnsubscribe = firestore.collection('susuru_anki_chats').doc(chatId).collection('messages').orderBy('timestamp', 'asc').onSnapshot(snap => {
    msgBox.innerHTML = ''; if (snap.empty) { msgBox.innerHTML = '<div style="color:var(--text3); text-align:center; font-size:0.8rem;">まだメッセージがありません。</div>'; }
    snap.forEach(doc => { const data = doc.data(); const isMe = data.senderId === currentUser.uid; const wrap = document.createElement('div'); wrap.style.cssText = `display:flex; flex-direction:column; max-width:80%; ${isMe ? 'align-self:flex-end;' : 'align-self:flex-start;'}`; const bubble = document.createElement('div'); bubble.style.cssText = `padding:10px 14px; border-radius:14px; font-size:0.9rem; word-break:break-all; ${isMe ? 'background:var(--primary); color:#fff; border-bottom-right-radius:2px;' : 'background:var(--bg3); border:1px solid var(--border); color:var(--text); border-bottom-left-radius:2px;'}`; bubble.innerText = data.text; wrap.appendChild(bubble); msgBox.appendChild(wrap); }); msgBox.scrollTop = msgBox.scrollHeight;
  });
}
function closeChat() { if (currentChatUnsubscribe) { currentChatUnsubscribe(); currentChatUnsubscribe = null; } document.getElementById('chatArea').style.display = 'none'; document.getElementById('friendsListArea').style.display = 'flex'; currentChatFriendUid = null; }
async function sendChatMessage() {
  const input = document.getElementById('txtChatInput'); const text = input.value.trim(); if (!text || !currentChatFriendUid) return;
  const chatId = getChatId(currentUser.uid, currentChatFriendUid); try { await firestore.collection('susuru_anki_chats').doc(chatId).collection('messages').add({ text: text, senderId: currentUser.uid, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); input.value = ''; } catch (e) { alert("⚠️ エラーが発生しました。"); }
}

// 共有機能
async function shareCategory(catName) {
  if (!currentUser) return alert("管理画面からログインしてください。");
  const allTargets = getAllSubcategories(catName); const subset = db.filter(q => allTargets.includes(q.category)); let partialTree = {}; allTargets.forEach(t => { if(categoryTree[t]) partialTree[t] = categoryTree[t]; });
  try { const docRef = await firestore.collection("susuru_anki_shared").add({ catName: catName, cards: subset, categories: allTargets, categoryTree: partialTree, ownerId: currentUser.uid, ownerName: currentUser.displayName || currentUser.email || '不明', friends: [], createdAt: firebase.firestore.FieldValue.serverTimestamp() }); const shareUrl = window.location.origin + window.location.pathname + "?share_id=" + docRef.id; await navigator.clipboard.writeText(shareUrl); alert(`✅ URLを発行・コピーしました！\nURL: ${shareUrl}`); } catch(err) { alert("⚠️ URLの発行に失敗しました。"); }
}
function listenToSharedDoc(docId) {
  if (unsubscribeShared) unsubscribeShared(); currentSharedDocId = docId; document.getElementById('sharedTitle').innerText = "⏳ 読み込み中...";
  unsubscribeShared = firestore.collection("susuru_anki_shared").doc(docId).onSnapshot((snap) => { if (!snap.exists) { alert("⚠️ 共有データが見つかりません。"); exitSharedMode(); return; } currentSharedData = snap.data(); renderSharedPage(); }, err => alert("⚠️ 共有データの取得に失敗しました。"));
}
function renderSharedPage() {
  if (!currentSharedData) return; const data = currentSharedData; document.getElementById('sharedTitle').innerText = `🌐 ${escapeHtml(data.catName)}`; document.getElementById('sharedOwnerName').innerText = escapeHtml(data.ownerName); document.getElementById('sharedCardCount').innerText = data.cards.length;
  const isOwner = currentUser && currentUser.uid === data.ownerId; const isFriend = currentUser && data.friends && data.friends.includes(currentUser.uid); const canEdit = isOwner || isFriend;
  document.getElementById('sharedOwnerPanel').style.display = isOwner ? 'block' : 'none'; document.getElementById('sharedEditorPanel').style.display = canEdit ? 'block' : 'none';
  if (isOwner) { const fList = document.getElementById('sharedFriendsList'); fList.innerHTML = ''; const friendsArray = data.friends || []; if (friendsArray.length === 0) fList.innerHTML = '<span style="font-size:0.8rem; color:var(--text3);">許可されたフレンドはいません。</span>'; else friendsArray.forEach(fUid => fList.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg3); padding:8px; border-radius:6px; border:1px solid var(--border);"><span style="font-size:0.8rem;">${escapeHtml(fUid)}</span><button class="btn btn-danger" style="padding:4px 10px; font-size:0.75rem;" onclick="removeFriendFromShared('${fUid}')">削除</button></div>`); }
  const cList = document.getElementById('sharedCardsList'); cList.innerHTML = '';
  if (data.cards.length === 0) cList.innerHTML = '<div style="color:var(--text3); font-size:0.9rem; text-align:center;">カードがありません</div>'; else data.cards.forEach((card, idx) => cList.innerHTML += `<div class="q-card"><div class="q-card-text">${escapeHtml(card.question)}</div><div style="font-size:0.85rem; color:var(--text2); margin-top:4px;">A: <span style="color:var(--text);">${escapeHtml(getPrimaryAnswer(card.answer))}</span></div><div style="font-size:0.75rem; color:var(--text3); margin-top:8px;">📂 ${escapeHtml(card.category)}</div>${canEdit ? `<button class="btn btn-secondary" style="margin-top:10px; font-size:0.8rem;" onclick="deleteCardFromShared(${idx})">🗑️ 削除</button>` : ''}</div>`);
}
async function addFriendToShared() { const uid = document.getElementById('txtNewFriendUid').value.trim(); if (!uid) return; const newFriends = [...(currentSharedData.friends || [])]; if (!newFriends.includes(uid)) newFriends.push(uid); try { await firestore.collection("susuru_anki_shared").doc(currentSharedDocId).update({ friends: newFriends }); document.getElementById('txtNewFriendUid').value = ''; } catch(e) {} }
async function removeFriendFromShared(uid) { if (!confirm("権限を取り消しますか？")) return; const newFriends = (currentSharedData.friends || []).filter(u => u !== uid); try { await firestore.collection("susuru_anki_shared").doc(currentSharedDocId).update({ friends: newFriends }); } catch(e) {} }
async function addCardToShared() { const q = document.getElementById('txtSharedNewQ').value.trim(), a = document.getElementById('txtSharedNewA').value.trim(); if (!q || !a) return; const newCard = { id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q, answer: a, category: currentSharedData.catName, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 }; try { await firestore.collection("susuru_anki_shared").doc(currentSharedDocId).update({ cards: [...currentSharedData.cards, newCard] }); document.getElementById('txtSharedNewQ').value = ''; document.getElementById('txtSharedNewA').value = ''; } catch(e) {} }
async function deleteCardFromShared(idx) { if (!confirm("クラウド上から削除しますか？")) return; const newCards = [...currentSharedData.cards]; newCards.splice(idx, 1); try { await firestore.collection("susuru_anki_shared").doc(currentSharedDocId).update({ cards: newCards }); } catch(e) {} }
function importCurrentShared() { const data = currentSharedData; if (!data) return; if (!confirm(`取り込みますか？`)) return; (data.categories || []).forEach(c => { if(!categories.includes(c)) categories.push(c); }); for (let p in (data.categoryTree || {})) { if (!categoryTree[p]) categoryTree[p] = []; (data.categoryTree[p] || []).forEach(c => { if (!categoryTree[p].includes(c)) categoryTree[p].push(c); }); } let count = 0; (data.cards || []).forEach(q => { if (!q.question || !q.answer) return; if (!db.some(d => normalizeAnswer(d.question) === normalizeAnswer(q.question) && d.category === q.category)) { db.push({ id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q.question, answer: q.answer, category: q.category, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 }); count++; } }); autoMerge(); alert(`✅ 取り込みました！\n新規追加: ${count}件`); exitSharedMode(); }
function exitSharedMode() { if (unsubscribeShared) unsubscribeShared(); currentSharedDocId = null; currentSharedData = null; const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname; window.history.pushState({path: cleanUrl}, '', cleanUrl); openPage('pgHome'); }
