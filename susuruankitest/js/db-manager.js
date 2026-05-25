import { STORAGE_KEY } from './config.js';

export class DbManager {
  constructor() {
    this.db = [];
    this.categories = ["未分類"];
    this.categoryTree = {};
    this.syncTimeout = null;
    this.firebaseService = null; // app.jsでセット
  }

  loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.db) this.db = p.db;
        if (p.categories) this.categories = p.categories;
        if (p.categoryTree) this.categoryTree = p.categoryTree;
      }
    } catch(e){}
    this.ensureSystemSanity();
  }

  saveData(uiController) {
    this.ensureSystemSanity();
    const payload = { db: this.db, categories: this.categories, categoryTree: this.categoryTree };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    
    if (this.firebaseService && this.firebaseService.currentUser) {
      clearTimeout(this.syncTimeout);
      if(uiController) uiController.setSyncStatus('saving', '🔄 保存中...');
      this.syncTimeout = setTimeout(() => {
        this.firebaseService.backgroundCloudSave(payload, uiController);
      }, 1000);
    }
  }

  ensureSystemSanity() {
    for (let parent in this.categoryTree) { if (!this.categories.includes(parent)) this.categories.push(parent); }
    if (!this.categories.includes("未分類")) this.categories.push("未分類");
    this.categories = [...new Set(this.categories.filter(c => c && c.trim() !== ""))];

    const activeCatsInTree = new Set();
    for (let p in this.categoryTree) { (this.categoryTree[p] || []).forEach(c => activeCatsInTree.add(c)); }
    this.categories = this.categories.filter(c => activeCatsInTree.has(c) || this.getTopLevelCategories().includes(c));

    this.db = this.db.filter(i => i && i.question && i.question.toString().trim() !== "" && i.answer && i.answer.toString().trim() !== "");
    this.db.forEach(item => {
      if(!item.id) item.id = 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      if(!item.category || !this.categories.includes(item.category)) {
        item.category = item.group && this.categories.includes(item.group) ? item.group : "未分類";
      }
      if(item.level === undefined) item.level = 0;
      if(item.correct === undefined) item.correct = 0;
      if(item.incorrect === undefined) item.incorrect = 0;
      if(item.streak === undefined) item.streak = 0;
      if(item.wrongStreak === undefined) item.wrongStreak = 0;
      if(item.shikkariStreak === undefined) item.shikkariStreak = 0;
    });
  }

  autoMerge() {
    let mergedMap = new Map();
    this.db.forEach(item => {
      let safeCat = item.category ? String(item.category).trim() : "未分類";
      let key = `${safeCat}_${String(item.question).trim()}_${String(item.answer).trim()}`;
      if (!mergedMap.has(key)) { mergedMap.set(key, JSON.parse(JSON.stringify(item))); } 
      else {
        let ext = mergedMap.get(key);
        ext.correct = (Number(ext.correct)||0) + (Number(item.correct)||0);
        ext.incorrect = (Number(ext.incorrect)||0) + (Number(item.incorrect)||0);
        ext.level = Math.max(Number(ext.level)||0, Number(item.level)||0);
        ext.streak = Math.max(Number(ext.streak)||0, Number(item.streak)||0);
        ext.wrongStreak = Math.max(Number(ext.wrongStreak)||0, Number(item.wrongStreak)||0);
        ext.shikkariStreak = Math.max(Number(ext.shikkariStreak)||0, Number(item.shikkariStreak)||0);
      }
    });
    this.db = Array.from(mergedMap.values());
  }

  getTopLevelCategories() {
    const children = new Set();
    for (const parent in this.categoryTree) { (this.categoryTree[parent] || []).forEach(c => children.add(c)); }
    return this.categories.filter(c => !children.has(c));
  }

  getAllSubcategories(catName, result = new Set()) {
    if (result.has(catName)) return [...result];
    result.add(catName);
    if (this.categoryTree[catName]) this.categoryTree[catName].forEach(c => this.getAllSubcategories(c, result));
    return [...result];
  }
}
