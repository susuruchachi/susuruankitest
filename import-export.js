// ----------------- JSON / CSV 管理 -----------------

/**
 * 現在のDB状態とカテゴリ情報をJSONファイルとしてダウンロードする
 * 依存: db(グローバル), categories(グローバル), categoryTree(グローバル)
 */
function exportJSON() {
  const blob = new Blob([JSON.stringify({ db, categories, categoryTree }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); 
  a.href = URL.createObjectURL(blob); 
  a.download = `susuru_anki_${Date.now()}.json`; 
  a.click();
}

/**
 * ファイル入力からJSONを読み込み、アプリの状態を復元する
 * @param {Event} e - ファイル入力イベント
 * 依存: db, categories, categoryTreeの更新, autoMerge(), openPage()
 */
function importJSON(e) {
  if(!e.target.files[0]) return;
  const r = new FileReader(); 
  r.onload = function(evt) {
    try {
      const p = JSON.parse(evt.target.result); 
      if(p.db) db = p.db; 
      if(p.categories) categories = p.categories; 
      if(p.categoryTree) categoryTree = p.categoryTree;
      autoMerge(); 
      alert("📦 インポート成功！"); 
      openPage('pgHome');
    } catch(err) { alert("無効なJSONです。"); }
  }; 
  r.readAsText(e.target.files[0]);
}

/**
 * DBをCSV形式（UTF-8 BOM付き）でエクスポートする
 * 依存: db(グローバル)
 */
function exportCSV() {
  let lines = [["問題", "答え", "フォルダー", "レベル", "正解数", "不正解数"]];
  db.forEach(q => lines.push([q.question, q.answer, q.category, q.level, q.correct, q.incorrect]));
  const csv = lines.map(l => l.map(t => `"${String(t).replace(/"/g, '""')}"`).join(",")).join("\n");
  const b = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv' });
  const a = document.createElement('a'); 
  a.href = URL.createObjectURL(b); 
  a.download = `susuru_anki_${Date.now()}.csv`; 
  a.click();
}
