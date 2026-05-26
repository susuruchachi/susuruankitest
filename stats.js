// ----------------- 実績とグラフ -----------------

/**
 * カードの状態を集計し、グラフを再描画する
 * 依存: db(グローバル), chartInstance(グローバル)
 */
function renderStatsAndCharts() {
  const th = parseInt(document.getElementById('numGradThreshold').value) || 5;
  const t = db.length;
  document.getElementById('statTotal').innerText = t;
  
  // 各ステータスの件数集計
  const cG = db.filter(q => q.correct >= th).length;
  const cM = db.filter(q => q.correct < th && q.level >= 3).length;
  const cN = db.filter(q => q.correct < th && q.level >= 1 && q.level <= 2).length;
  const cW = db.filter(q => q.correct < th && q.level === 0 && (q.correct+q.incorrect)>0).length;
  const cS = db.filter(q => q.correct < th && q.level === -1).length;
  const cU = db.filter(q => q.correct === 0 && q.incorrect === 0 && q.level >= 0).length;

  document.getElementById('cntGrad').innerText = cG;
  document.getElementById('cntMaster').innerText = cM;
  document.getElementById('cntNormal').innerText = cN;
  document.getElementById('cntWeak').innerText = cW;
  document.getElementById('cntShikkari').innerText = cS;
  document.getElementById('cntUnseen').innerText = cU;
  document.getElementById('statGradRatio').innerText = t > 0 ? `${Math.round((cG/t)*100)}%` : '0%';

  // 既存グラフを破棄して再生成
  if(chartInstance) chartInstance.destroy();
  const ctx = document.getElementById('rankPieChart').getContext('2d');
  Chart.defaults.color = document.body.classList.contains('light-mode') ? '#4b5563' : '#e8edf5';
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['卒業','得意','普通','苦手','しっかり'], datasets: [{ data: [cG,cM,cN,cW,cS], backgroundColor: ['#22c77a','#4f7cff','#f5a623','#ff4f6a','#9aa0a6'], borderWidth:0 }] },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
  });
}
