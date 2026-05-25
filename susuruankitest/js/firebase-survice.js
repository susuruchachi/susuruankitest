import { FIREBASE_CONFIG, VERSION } from './config.js';

export class FirebaseService {
  constructor(appHub) {
    this.app = appHub;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    this.auth = firebase.auth();
    this.firestore = firebase.firestore();
    this.currentUser = null;
    this.initAuthListener();
  }

  initAuthListener() {
    this.auth.onAuthStateChanged(user => {
      this.currentUser = user;
      const ls = document.getElementById('fbLoginState');
      if (user) {
        if(ls) ls.innerHTML = `<span style="color:var(--success);">✅ ${this.app.ui.escapeHtml(user.displayName || user.email)}</span>`;
        document.getElementById('btnFbLogin').style.display = 'none'; 
        document.getElementById('btnFbLogout').style.display = 'inline-flex';
        document.getElementById('txtMyUid').value = user.uid;
        
        this.firestore.collection('susuru_anki_profiles').doc(user.uid).set({ displayName: user.displayName||'名無し', uid: user.uid }, { merge: true });
        this.syncToCloud(true);
        if (this.app.currentSharedDocId) this.app.listenToSharedDoc(this.app.currentSharedDocId);
      } else {
        if(ls) ls.innerHTML = `<span style="color:var(--warn);">未ログイン</span>`;
        document.getElementById('btnFbLogin').style.display = 'inline-flex'; 
        document.getElementById('btnFbLogout').style.display = 'none';
        document.getElementById('txtMyUid').value = '';
      }
    });
  }

  login() { 
    const provider = new firebase.auth.GoogleAuthProvider();
    this.auth.signInWithPopup(provider).catch(err => { 
      if (err.code === 'auth/popup-blocked') alert("ポップアップがブロックされました。許可してからお試しください。");
      else alert("ログインエラー: " + err.message);
    });
  }

  logout() { this.auth.signOut().then(()=>alert("ログアウトしました")); }

  async backgroundCloudSave(payload, ui) {
    try {
      await this.firestore.collection("susuru_anki_users").doc(this.currentUser.uid).set({
        version: VERSION, db: payload.db, categories: payload.categories,
        categoryTree: payload.categoryTree, lastSync: firebase.firestore.FieldValue.serverTimestamp()
      });
      ui.setSyncStatus('success', '✅ 保存完了');
    } catch (err) { ui.setSyncStatus('error', '⚠️ 保存エラー'); }
  }

  async syncToCloud(isSilent = false) {
    if (!this.currentUser) { if (!isSilent) alert("Googleアカウントでログインしてください。"); return; }
    try {
      const ref = this.firestore.collection("susuru_anki_users").doc(this.currentUser.uid);
      const snap = await ref.get();
      if (snap.exists) {
        let r = snap.data();
        let dbMgr = this.app.dbManager;
        if (Array.isArray(r.db)) {
          let lMap = new Map(dbMgr.db.map(q => [q.id, q]));
          r.db.forEach(rq => {
            if (!rq.question || !rq.answer) return;
            if (lMap.has(rq.id)) {
              let lq = lMap.get(rq.id);
              if (rq.level > lq.level || rq.correct > lq.correct || rq.streak > lq.streak) lMap.set(rq.id, rq);
            } else lMap.set(rq.id, rq);
          });
          dbMgr.db = Array.from(lMap.values());
        }
        let rCat = r.categories || [];
        rCat.forEach(rc => { if (rc && !dbMgr.categories.includes(rc)) dbMgr.categories.push(rc); });
        let rTree = r.categoryTree || {};
        for (let p in rTree) {
          if (!dbMgr.categories.includes(p)) dbMgr.categories.push(p);
          if (!dbMgr.categoryTree[p]) dbMgr.categoryTree[p] = [];
          rTree[p].forEach(c => { if (!dbMgr.categoryTree[p].includes(c)) dbMgr.categoryTree[p].push(c); });
        }
      }
      this.app.dbManager.ensureSystemSanity();
      await ref.set({ version: VERSION, db: this.app.dbManager.db, categories: this.app.dbManager.categories, categoryTree: this.app.dbManager.categoryTree, lastSync: firebase.firestore.FieldValue.serverTimestamp() });
      this.app.dbManager.autoMerge();
      this.app.dbManager.saveData(this.app.ui);
      
      if (document.getElementById('pgTree').classList.contains('active')) this.app.ui.renderTree();
      if (document.getElementById('pgBox').classList.contains('active')) this.app.ui.renderBox();
      if (!isSilent) { alert(`☁️ 同期完了！`); this.app.ui.openPage('pgHome'); }
    } catch (err) { if (!isSilent) alert(`⚠️ 同期エラー: ${err.message}`); }
  }
}
