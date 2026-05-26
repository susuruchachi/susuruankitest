// ★ すするanki 初期化処理

/**
 * アプリ起動時のメイン処理
 * - データ読み込み、整合性チェック、初回UI表示
 */
window.onload = function() {
  loadData(); ensureSystemSanity(); autoMerge();
  buildQuizScopeDropdown(); 
  
  // ライトモード設定反映
  if(localStorage.getItem('theme_light')==='true') toggleLightMode(true);
  
  // 成績共有設定をUIに反映
  const chkShareStats = document.getElementById('chkShareStats');
  if(chkShareStats) chkShareStats.checked = shareStats;
  
  // 履歴管理の初期化
  history.pushState({ page: 'pgHome' }, '', '');
  window.onpopstate = function(event) {
    if (pageHistory.length > 0) executePageTransition(pageHistory.pop(), true);
    else executePageTransition('pgHome', true);
  };

  // URLパラメータによる共有リンク対応
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('share_id')) { 
    openPage('pgShared'); 
    listenToSharedDoc(urlParams.get('share_id')); 
  }
};
