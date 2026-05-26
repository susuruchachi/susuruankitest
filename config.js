// ----------------- 設定・グローバル変数 -----------------

// ★Firebase 初期化
const firebaseConfig = {
  apiKey: "AIzaSyAGoYBRoupEFHng_cXoiHmZf9eAlX8ZCHA", 
  authDomain: "susuruanki.firebaseapp.com",
  projectId: "susuruanki", 
  storageBucket: "susuruanki.firebasestorage.app",
  messagingSenderId: "926791749187", 
  appId: "1:926791749187:web:2a96a39d61cbb4d3c7cef6", 
  measurementId: "G-Q9ZMYX8BF8"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

// Firebaseインスタンス
const auth = firebase.auth(); 
const firestore = firebase.firestore();

// アプリ用グローバル状態管理変数
const STORAGE_KEY = 'susuru_anki_022g';
let currentUser = null; 
let db = []; // メインのカードデータベース
let categories = ["未分類"]; 
let categoryTree = {}; // 階層構造管理

// 画面・UI・クイズ制御用フラグ
let currentViewContext = 'all', pageHistory = [];
let chartInstance = null, currentCombo = 0, todayCorrectCount = 0;
let quizPool=[], quizIndex=0, quizTimer=null, autoNextTimeout=null;
let quizTimeLimit=0, quizTimeLeft=0, quizPhase='q', selectedChoiceIdx=null, currentQuestionGradThreshold=5, selectedScopePath=[];
let syncTimeout = null;
let lastQuizScopePath = []; // カテゴリ絞り込みの永続化
let shareStats = false; // 成績共有用フラグ

/**
 * 現在の日付をYYYY-MM-DD形式で取得する
 * @returns {string} - YYYY-MM-DD文字列
 */
function getTodayStr() {
  const d = new Date();
  // (日付整形ロジック...)
}
