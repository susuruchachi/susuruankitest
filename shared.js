// ----------------- 共有カテゴリー -----------------
let currentSharedDocId = null, currentSharedData = null, unsubscribeShared = null;

/**
 * 指定カテゴリのデータをクラウドに共有し、URLを発行する
 * @param {string} catName - 共有するトップ階層のカテゴリ名
 * 依存: currentUser(グローバル), db(グローバル)
 */
async function shareCategory(catName) {
  if (!currentUser) return alert("管理画面からログインしてください。");
  const allTargets = getAllSubcategories(catName); 
  const subset = db.filter(q => allTargets.includes(q.category));
  let partialTree = {}; 
  allTargets.forEach(t => { if(categoryTree[t]) partialTree[t] = categoryTree[t]; });
  
  try {
    const docRef = await firestore.collection("susuru_anki_shared").add({ 
      catName: catName, cards: subset, categories: allTargets, 
      categoryTree: partialTree, ownerId: currentUser.uid, 
      ownerName: currentUser.displayName || currentUser.email || '不明', 
      friends: [], createdAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
    const shareUrl = window.location.origin + window.location.pathname + "?share_id=" + docRef.id; 
    await navigator.clipboard.writeText(shareUrl); 
    alert(`✅ URLを発行・コピーしました！\nURL: ${shareUrl}`);
  } catch(err) { alert("⚠️ URLの発行に失敗しました。ルールの確認を。"); }
}

/**
 * 共有IDに基づき、クラウド上のデータを監視・取得する
 * @param {string} docId - 共有データのドキュメントID
 */
function listenToSharedDoc(docId) {
  if (unsubscribeShared) unsubscribeShared(); 
  currentSharedDocId = docId; 
  document.getElementById('sharedTitle').innerText = "⏳ 読み込み中...";
  unsubscribeShared = firestore.collection("susuru_anki_shared").doc(docId).onSnapshot((snap) => {
    if (!snap.exists) { alert("⚠️ 共有データが見つかりません。"); return; }
    // (データ描画・同期処理...)
  });
}
