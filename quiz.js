// ----------------- クイズ機能 -----------------

/**
 * ホーム画面の出題範囲選択ドロップダウンを構築する
 * 依存: DOM要素(scopeSelectors)
 */
function buildQuizScopeDropdown() {
  const container = document.getElementById('scopeSelectors'); if(!container) return;
  container.innerHTML = ''; createScopeSelect(0, getTopLevelCategories());
}

/**
 * カテゴリ階層に対応したセレクトボックスを動的に生成する
 * @param {number} depth - 階層の深さ
 * @param {Array} categoriesToShow - 表示するカテゴリリスト
 */
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
    // 子階層があれば再帰的に生成（省略）
  };
  container.appendChild(select);
}

/**
 * クイズ回答後の自動遷移処理
 * 依存: quizPhase(グローバル), autoNextTimeout
 */
function showAnswerUI() {
  document.getElementById('btnQuizPass').style.display = 'none';
  document.getElementById('btnQuizAction').style.display = 'inline-flex';
  document.getElementById('btnQuizAction').innerText = '次の問題へ';

  const mode = document.getElementById('selQuizMode').value;
  if (['choice', 'tap', 'self', 'minhaya'].includes(mode)) {
    clearTimeout(autoNextTimeout); autoNextTimeout = setTimeout(() => { if (quizPhase === 'a') submitQuizAction(); }, 3000);
  }
}

/**
 * COMBOアニメーションを再生する
 */
function showComboAnim() {
  if(currentCombo < 2) return;
  const cd = document.getElementById('comboDisplay'); cd.innerText = `${currentCombo} COMBO!`;
  cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop');
}

/**
 * 問題ごとのメモを保存する
 * @param {string} val - メモの内容
 */
function saveQuickNote(val) {
  const m = db.find(q=>q.id === quizPool[quizIndex].id); if(m) { m.note = val; saveData(); }
}

/**
 * Firebase Firestoreへ日次の学習ログを記録する
 * @param {boolean} isCorrect - 正解かどうか
 * 依存: currentUser(グローバル), firestore
 */
async function recordDailyLog(isCorrect) {
  if(!currentUser) return;
  const d = getTodayStr(); 
  const lRef = firestore.collection('susuru_anki_logs').doc(`${d}_${currentUser.uid}`);
  const sRef = firestore.collection('susuru_anki_daily_scores').doc(`${d}_${currentUser.uid}`);
  // (以降、Firestoreへの書き込み処理)
}
