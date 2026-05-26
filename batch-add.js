// ----------------- 一括追加 -----------------
let targetBulkCategory = ""; // 現在追加対象となっているカテゴリ名

/**
 * 一括追加モーダルを表示する
 * @param {string} catName - 対象カテゴリ名
 */
function showBulkAddModal(catName) {
  targetBulkCategory = catName; 
  document.getElementById('bulkAddTitle').innerText = `一括追加: ${catName}`;
  document.getElementById('txtBulkAdd').value = ''; 
  document.getElementById('bulkAddOverlay').style.display = 'flex';
}

/**
 * 一括追加モーダルを非表示にする
 */
function closeBulkAdd() { 
  document.getElementById('bulkAddOverlay').style.display = 'none'; 
}

/**
 * テキストエリアの入力内容をパースしてカードをdbに追加する
 * カンマまたは読点で区切られた文字列を想定
 * 依存: db(グローバル配列), autoMerge()
 */
function submitBulkAdd() {
  const text = document.getElementById('txtBulkAdd').value.trim();
  if(!text) { closeBulkAdd(); return; }
  let count = 0;
  text.split(/\r?\n/).forEach(line => {
    let idx = line.indexOf(','); if(idx === -1) idx = line.indexOf('、');
    if(idx !== -1) {
      const q = line.substring(0, idx).trim(), a = line.substring(idx + 1).trim();
      if(q && a) {
        // カードオブジェクトを生成してdbへ追加
        db.push({ id: 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36), question: q, answer: a, category: targetBulkCategory, level: 0, correct: 0, incorrect: 0, streak: 0, wrongStreak: 0, shikkariStreak: 0 });
        count++;
      }
    }
  });
  autoMerge(); 
  alert(`${count}件の問題を追加しました！`); 
  closeBulkAdd();
  // 画面が表示中ならリフレッシュ
  if (document.getElementById('pgBox').classList.contains('active')) renderBox();
}
