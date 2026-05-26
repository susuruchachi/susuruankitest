// ----------------- お知らせ履歴 -----------------

/**
 * Firebase Firestoreから更新履歴（updates）を読み込み、画面にレンダリングする
 * 依存: firestore(グローバル)
 */
async function loadUpdates() {
  const area = document.getElementById('updatesListArea');
  area.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:0.9rem;">読み込み中...</p>';
  try {
    const snap = await firestore.collection('updates').orderBy('date','desc').limit(30).get();
    if(snap.empty) {
      area.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:0.9rem;">まだお知らせはありません。</p>';
      return;
    }
    area.innerHTML = '';
    // 各更新ログをカード形式で生成
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
    console.warn("お知らせの読み込みに失敗しました:", e);
    area.innerHTML = '<p style="text-align:center; color:var(--danger);">更新情報の読み込みエラー</p>';
  }
}
