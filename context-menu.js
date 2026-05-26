// ----------------- コンテキストメニュー & 長押し -----------------

/**
 * 指定要素に長押し検知とアクションを登録する
 * @param {HTMLElement} element - 長押し対象のDOM要素
 * @param {Function} actionCallback - 長押し時に実行する関数
 */
function setupLongpress(element, actionCallback) {
  let pressTimer = null; 
  let startX = 0, startY = 0;
  let isDragging = false;
  
  const startHandler = (e) => {
    if (e.type === 'contextmenu') { e.preventDefault(); return; }
    if (e.touches && e.touches.length > 1) return;
    
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX; startY = clientY;
    isDragging = false;
    
    pressTimer = setTimeout(() => {
      if (!isDragging) { 
        if (navigator.vibrate) navigator.vibrate(50); 
        actionCallback(); 
      }
    }, 500);
  };
  
  const moveHandler = (e) => { 
    if(!pressTimer) return;
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    if(Math.abs(clientX - startX) > 10 || Math.abs(clientY - startY) > 10) {
      isDragging = true; 
      clearTimeout(pressTimer); 
      pressTimer = null;
    }
  };
  
  const cancelHandler = () => { if(pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  
  // イベントリスナーの登録（タップとマウス両対応）
  element.addEventListener('touchstart', startHandler);
  element.addEventListener('touchmove', moveHandler);
  element.addEventListener('touchend', cancelHandler);
  element.addEventListener('mousedown', startHandler);
  element.addEventListener('mousemove', moveHandler);
  element.addEventListener('mouseup', cancelHandler);
  element.addEventListener('mouseleave', cancelHandler);
}

// （以下、openContextMenuやrenderTreeなど、メニュー生成・描画ロジックが続く想定）
