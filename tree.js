// ----------------- ツリー機能 -----------------

/**
 * ツリーの最上位にある（他のカテゴリに含まれない）カテゴリを取得する
 * 依存: categoryTree(グローバル)
 */
function getTopLevelCategories() {
  const children = new Set();
  for (const parent in categoryTree) { (categoryTree[parent] || []).forEach(c => children.add(c)); }
  return categories.filter(c => !children.has(c));
}

/**
 * 特定のカテゴリ以下の全サブカテゴリを再帰的に取得する
 * @param {string} catName - 起点となるカテゴリ名
 * @param {Set} result - 収集用セット
 * @returns {Array} - 全サブカテゴリの配列
 */
function getAllSubcategories(catName, result = new Set()) {
  if (result.has(catName)) return [...result];
  result.add(catName);
  if (categoryTree[catName]) categoryTree[catName].forEach(c => getAllSubcategories(c, result));
  return [...result];
}

/**
 * フォルダ一覧ツリーをレンダリングする
 * 依存: DOM要素(treeRoot)
 */
function renderTree() {
  const root = document.getElementById('treeRoot'); root.innerHTML = '';
  getTopLevelCategories().forEach(cat => root.appendChild(createTreeNode(cat, 0)));
}

/**
 * 階層構造に基づいてノードのHTML要素を作成する（再帰処理）
 * @param {string} catName - カテゴリ名
 * @param {number} depth - 現在の階層深さ
 */
function createTreeNode(catName, depth) {
  const container = document.createElement('div');
  if (depth > 0) { container.style.marginLeft = '16px'; container.style.marginTop = '6px'; }
  
  const card = document.createElement('div'); card.className = 'tree-group-card';
  // (階層のスタイル設定とsetupLongpressでの長押し操作登録)
  // ...
  return container;
}
