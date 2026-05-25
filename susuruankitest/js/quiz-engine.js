export class QuizEngine {
  constructor(dbManager) {
    this.dbManager = dbManager;
    this.quizPool = [];
    this.quizIndex = 0;
    this.quizTimer = null;
    this.autoNextTimeout = null;
    this.quizTimeLimit = 0;
    this.quizTimeLeft = 0;
    this.quizPhase = 'q';
    this.selectedChoiceIdx = null;
    this.currentQuestionGradThreshold = 5;
    this.currentCombo = 0;
    this.todayCorrectCount = 0;
  }

  normalizeAnswer(str) {
    if(!str) return '';
    let s = String(str).replace(/[Ａ-Ｚａ-ｚ０-９]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).toLowerCase().trim();
    s = s.replace(/擦/g, 'こす'); 
    s = s.replace(/[、，＼＼ \u3000]+/g, ',');
    return s.split(',').map(x=>x.trim()).filter(x=>x!=='').sort().join(',');
  }

  isAnswerCorrect(input, correctAnswer) {
    const norms = correctAnswer.split(/[/|]/).map(a => this.normalizeAnswer(a));
    const inNorm = this.normalizeAnswer(input);
    return norms.includes(inNorm);
  }

  getPrimaryAnswer(ans) { return ans.split(/[/|]/)[0].trim(); }

  generateFourChoices(curCard) {
    const correctPrimary = this.getPrimaryAnswer(curCard.answer);
    let altCandidates = [];
    const catAnswers = this.dbManager.db.filter(q => q.category === curCard.category && this.getPrimaryAnswer(q.answer) !== correctPrimary).map(q => this.getPrimaryAnswer(q.answer));
    altCandidates = [...new Set(catAnswers)];
    
    if(altCandidates.length < 3) {
      const globalAnswers = this.dbManager.db.filter(q => this.getPrimaryAnswer(q.answer) !== correctPrimary).map(q => this.getPrimaryAnswer(q.answer));
      altCandidates = [...new Set([...altCandidates, ...globalAnswers])];
    }
    altCandidates.sort(() => Math.random() - 0.5);
    let finalFour = [correctPrimary, ...altCandidates.slice(0, 3)];
    while (finalFour.length < 4) finalFour.push(`選択肢_${Math.floor(Math.random()*1000)}`);
    return finalFour.sort(() => Math.random() - 0.5);
  }

  generateTapChoices(curCard) {
    const target = this.getPrimaryAnswer(curCard.answer);
    let chars = target.split('');
    let allChars = this.dbManager.db.map(q => this.getPrimaryAnswer(q.answer)).join('').replace(/[、，／/ \u3000,\da-zA-Z|]/g, '').split('');
    if(allChars.length === 0) allChars = 'あいうえおかきくけこ'.split('');
    for(let i=0; i<2; i++) chars.push(allChars[Math.floor(Math.random()*allChars.length)]);
    return chars.sort(() => Math.random() - 0.5);
  }

  updateCardRank(curCard, isCorrect, mode, currentSelfJudge) {
    let m = this.dbManager.db.find(q => q.id === curCard.id);
    if (!m) return m;

    if(m.wrongStreak === undefined) m.wrongStreak = 0; 
    if(m.shikkariStreak === undefined) m.shikkariStreak = 0;
    const multiplier = (mode === 'choice' || mode === 'tap' || mode === 'minhaya') ? 2 : 1; 
    const th = this.currentQuestionGradThreshold;

    if(isCorrect) {
      m.correct++; 
      this.currentCombo++; 
      this.todayCorrectCount++;
      
      if (mode === 'self' && currentSelfJudge === 'good') m.wrongStreak = 0;
      else { m.streak++; m.wrongStreak = 0; }
      
      if (m.level === -1) {
        m.shikkariStreak++;
        if (m.shikkariStreak >= 5 * multiplier) { m.level = 0; m.shikkariStreak = 0; m.streak = 0; }
      } else if (m.correct - 1 < th) {
        if (m.streak >= 2 * multiplier && m.level < 5) { m.level++; m.streak = 0; }
      }
    } else {
      m.incorrect++; m.wrongStreak++; m.streak = 0; m.shikkariStreak = 0;
      this.currentCombo = 0;

      if (m.correct >= th) {
        if (m.wrongStreak >= 3 * multiplier) { m.correct = th - 1; m.level = 2; m.wrongStreak = 0; }
      } else {
        if (m.level !== -1) {
          if (m.wrongStreak >= 4 * multiplier) { m.level = -1; m.wrongStreak = 0; m.correct = 0; } 
          else if (m.wrongStreak > 0 && m.wrongStreak % (2 * multiplier) === 0 && m.level > 0) m.level--;
        }
      }
    }
    return m;
  }
}
