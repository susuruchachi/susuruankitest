// ----------------- 画面遷移 -----------------

/**
 * 指定したページIDへ遷移する
 * @param {string} pageId - 遷移先のID
 */
function openPage(pageId) { executePageTransition(pageId, false); }

/**
 * 実際の画面切り替え処理。履歴管理とクイズタイマーのリセットを行う
 * @param {string} pageId - 遷移先
 * @param {boolean} isBackAction - ブラウザの戻る操作かどうか
 */
function executePageTransition(pageId, isBackAction) {
  clearInterval(quizTimer); clearTimeout(autoNextTimeout);
  const activeScreen = document.querySelector('.screen.active');
  const currentId = activeScreen ? activeScreen.id : 'pgHome';
  
  if (!isBackAction && currentId !== pageId) {
    pageHistory.push(currentId);
    history.pushState({ page: pageId }, '', '');
  }
  if (pageId !== 'pgFriends') closeChat();

  // 表示の切り替え
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display='none'; });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const tgt = document.getElementById(pageId);
  if(tgt) { tgt.style.display='flex'; tgt.classList.add('active'); }

  // ページごとの初期化呼び出し
  if(pageId==='pgHome') { document.getElementById('navHome').classList.add('active'); buildQuizScopeDropdown(); }
  if(pageId==='pgTree') { document.getElementById('navTree').classList.add('active'); renderTree(); }
  if(pageId==='pgBox') { document.getElementById('navBox').classList.add('active'); renderBox(); }
  if(pageId==='pgStats') { document.getElementById('navStats').classList.add('active'); renderStatsAndCharts(); }
  if(pageId==='pgPublicCategories') { loadPublicCategories(); }
}
