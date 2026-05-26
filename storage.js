// ----------------- データ管理 -----------------

/**
 * ローカルストレージからデータを読み込む
 * 依存: db, categories, categoryTree
 */
function loadData() {
  try { 
    const raw = localStorage.getItem(STORAGE_KEY); 
    if(raw) { 
      const p = JSON.parse(raw); 
      if(p.db) db = p.db; 
      if(p.categories) categories = p.categories; 
      if(p.categoryTree) categoryTree = p.categoryTree; 
    } 
  } catch(e){}
}

/**
 * データをローカルストレージに保存し、バックグラウンドでクラウドへ同期する
 * 依存: firestore, currentUser
 */
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

/**
 * Firebase Firestoreへデータをアップロードする
 * @param {object} payload - 保存するデータ一式
 */
async function backgroundCloudSave(payload) {
  try {
    await firestore.collection("susuru_anki_users").doc(currentUser.uid).set({
      version: "0.02.03.000α.4-c", 
      db: payload.db, 
      categories: payload.categories,
      categoryTree: payload.categoryTree, 
      lastSync: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    setSyncStatus('success', '✅ クラウド保存完了');
  } catch(e) { setSyncStatus('error', '⚠️ 保存失敗'); }
}
