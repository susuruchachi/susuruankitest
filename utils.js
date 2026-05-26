// ★ ユーティリティ関数

/**
 * 文字列をHTMLエスケープしてXSSを防ぐ
 * @param {string} text - エスケープ対象の文字列
 * @returns {string} - 安全なHTML文字列
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * ライトモード/ダークモードの切り替え処理
 * @param {boolean} forceOn - 強制的にライトモードにするか
 */
function toggleLightMode(forceOn = false) {
  const isLight = forceOn || !document.body.classList.contains('light-mode');
  if(isLight) document.body.classList.add('light-mode'); else document.body.classList.remove('light-mode');
  localStorage.setItem('theme_light', isLight);
  // グラフの色味も自動的に追従させる
  if(chartInstance) renderStatsAndCharts();
}
