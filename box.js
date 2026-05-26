// ----------------- 問題箱機能 -----------------
let _boxAnswerCache = {}; // 答えの表示/非表示状態を保持するキャッシュ

/**
 * 全てのカードを表示状態にして一覧をレンダリングする
 */
function showAllCards() { 
  currentViewContext = 'all'; 
  const sb = document.getElementById('txtSearchBox'); 
  if(sb) sb.value = ''; 
  renderBox(); 
}

/**
 * ステータスでフィルタリングしてBoxページを開く
 * @param {string} statusType - フィルタ種類(grad, master等)
 */
function filterBoxByStatus(statusType) { 
  currentViewContext = statusType; 
  openPage('pgBox'); 
}

/**
 * カードリストをHTML生成してDOMに挿入する
 * 依存: db, currentViewContext
 */
function renderBox() {
  const container = document.getElementById('boxList'); 
  container.innerHTML = '';
  let filtered = [...db]; 
  let titleString = "📝 全ての問題一覧";
  const th = parseInt(document.getElementById('numGradThreshold').value) || 5;

  // カテゴリによるフィルタリング
  if (typeof currentViewContext === 'object' && currentViewContext.type === 'category') {
    const subCats = getAllSubcategories(currentViewContext.value); 
    filtered = db.filter(q => subCats.includes(q.category));
    titleString = `🔖 ${currentViewContext.value} 内のカード`;
  } 
  // ステータスによるフィルタリング
  else if (typeof currentViewContext === 'string' && currentViewContext !== 'all') {
    titleString = `📊 実績抽出カードの一覧`;
    if (currentViewContext === 'grad') filtered = db.filter(q => q.correct >= th);
    if (currentViewContext === 'master') filtered = db.filter(q => q.correct < th && q.level >= 3);
    if (currentViewContext === 'normal') filtered = db.filter(q => q.correct < th && q.level >= 1 && q.level <= 2);
    if (currentViewContext === 'weak') filtered = db.filter(q => q.correct < th && q.level === 0);
  }
  
  // (以降、renderBoxのカード生成ロジックが続く想定です)
}

/**
 * カードを長押しした時の操作メニューを開く
 * @param {object} item - 操作対象のカードオブジェクト
 */
function handleQuestionLongpress(item) {
  let moveOptions = [];
  categories.forEach(cat => {
    if (cat !== item.category) { 
      moveOptions.push({ html: `📂 フォルダー「${cat}」へ移動`, action: () => { item.category = cat; saveData(); renderBox(); } }); 
    }
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
