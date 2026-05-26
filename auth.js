// ----------------- Firebase Auth -----------------

/**
 * Googleログインポップアップを表示して認証を行う
 * 依存: firebase.auth, authインスタンス
 */
function firebaseLogin() { 
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ 'prompt': 'select_account' });
  
  auth.signInWithPopup(provider)
    .catch(err => { 
      if (err.code === 'auth/popup-blocked') {
        alert("⚠️ ポップアップがブロックされました。\nブラウザの設定で許可してからお試しください。");
      } else if (err.code === 'auth/cancelled-popup-request') {
        console.log("ログインがキャンセルされました");
      } else { 
        alert("⚠️ ログインエラー: " + err.message); 
      }
    });
}

/**
 * 現在のログインユーザーをログアウトさせる
 * 依存: authインスタンス
 */
function firebaseLogout() { 
  auth.signOut()
    .then(() => alert("✅ ログアウトしました"))
    .catch(err => alert("⚠️ ログアウトエラー: " + err.message));
}

/**
 * 認証状態の変化を監視し、画面のUIを更新する
 * - ログイン時: プロフィール保存、クラウド同期、共有ドキュメントの購読
 * - ログアウト時: ログイン状態UIの初期化
 * 依存: currentUser(グローバル), firestore, ui要素(btnFbLogin等)
 */
auth.onAuthStateChanged(user => {
  currentUser = user;
  const ls = document.getElementById('fbLoginState');
  if(!ls) return;
  
  if(user) {
    ls.innerHTML = `<span style="color:var(--success);">✅ ${escapeHtml(user.displayName || user.email)}</span>`;
    const btnLogin = document.getElementById('btnFbLogin');
    const btnLogout = document.getElementById('btnFbLogout');
    if(btnLogin) btnLogin.style.display = 'none';
    if(btnLogout) btnLogout.style.display = 'inline-flex';
    
    const txtUid = document.getElementById('txtMyUid');
    if(txtUid) txtUid.value = user.uid;
    
    // プロフィール情報の保存
    firestore.collection('susuru_anki_profiles').doc(user.uid).set({ 
      displayName: user.displayName||'名無し', 
      uid: user.uid,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(e => console.error("プロフィール保存エラー:", e));
    
    syncToCloud(true);
    
    if (typeof currentSharedDocId !== 'undefined' && currentSharedDocId) {
      listenToSharedDoc(currentSharedDocId);
    }
  } else {
    ls.innerHTML = `<span style="color:var(--warn);">未ログイン</span>`;
    const btnLogin = document.getElementById('btnFbLogin');
    const btnLogout = document.getElementById('btnFbLogout');
    if(btnLogin) btnLogin.style.display = 'inline-flex';
    if(btnLogout) btnLogout.style.display = 'none';
  }
});
