'use strict';

/* ========================================
   龙族答题网站 - 核心逻辑
   ======================================== */

// ===== 全局状态 =====
let allQuestions = [];      // 所有题目（从 JSON 加载）
let quizQuestions = [];     // 本次答题的题目列表
let userAnswers = {};       // 用户答案 { 题目索引: 选项索引（单选）或数组（多选） }
let currentIndex = 0;       // 当前题目索引

// 题型标签映射
const TYPE_LABELS = {
  'single': '单选题',
  'multi': '多选题',
  'subjective': '主观题'
};


// ===== 工具函数 =====

/**
 * Fisher-Yates 洗牌算法 - 打乱数组顺序
 * @param {Array} array - 原始数组
 * @returns {Array} 打乱后的新数组
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


// ===== 数据加载 =====

/**
 * 从 3EQA.json 加载所有题目
 */
async function loadQuestions() {
  try {
    const response = await fetch('3EQA.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    allQuestions = data.questions;
  } catch (error) {
    console.error('题目加载失败：', error);
    const homeContent = document.getElementById('home-content');
    if (homeContent) {
      homeContent.innerHTML = '<p class="error-msg">题目数据加载失败<br><br>请通过本地服务器访问：<br>python -m http.server 8000<br><br>然后打开 http://localhost:8000</p>';
    }
  }
}

/**
 * 抽取本次答题的题目：
 * - 单选题：从全部单选随机抽取15道，并打乱题目顺序
 * - 多选题：随机抽取3道（内部打乱）
 * - 主观题：固定1道
 * 顺序固定：单选（1-15题） → 多选（16-18题） → 主观（19题）
 * 三大部分之间不打乱
 */
function pickQuestions() {
  const singles = allQuestions.filter(q => q.type === 'single');
  const multis = allQuestions.filter(q => q.type === 'multi');
  const subjectives = allQuestions.filter(q => q.type === 'subjective');

  // 单选题：先打乱再取前15道，保证随机抽取且题目顺序打乱
  const selectedSingles = shuffle(singles).slice(0, 15);
  // 多选题随机抽取3道（内部打乱）
  const selectedMultis = shuffle(multis).slice(0, 3);

  // 顺序固定，不整体打乱
  quizQuestions = [...selectedSingles, ...selectedMultis, ...subjectives];
}


// ===== 视图切换 =====

/**
 * 切换显示的视图
 * @param {string} viewId - 视图元素 ID
 */
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  window.scrollTo(0, 0);
}


// ===== 首页 =====

/**
 * 开始答题：重置状态、抽题、渲染第一题
 */
function startQuiz() {
  if (allQuestions.length === 0) {
    alert('题目数据未加载，请通过本地服务器访问：python -m http.server 8000');
    return;
  }
  userAnswers = {};
  currentIndex = 0;
  pickQuestions();
  showView('quiz-view');
  renderQuestion();
}


// ===== 答题页 =====

/**
 * 渲染当前题目
 */
function renderQuestion() {
  const q = quizQuestions[currentIndex];
  const content = document.getElementById('quiz-content');

  // 更新题号
  document.getElementById('question-counter').textContent =
    `第 ${currentIndex + 1} / ${quizQuestions.length} 题`;

  let html = '<div class="question-card">';

  // 题型标签
  html += `<span class="question-type ${q.type}">${TYPE_LABELS[q.type] || '题目'}</span>`;

  // 题干
  html += `<p class="question-text">${q.question}</p>`;

  if (q.type === 'subjective') {
    // 主观题：显示音频播放器，无选项，无输入框
    html += generateAudioHTML(q.audios);
    html += '<p class="subjective-hint">（主观题不计分，请欣赏音频）</p>';
  } else {
    // 选择题：渲染选项
    const isMulti = q.type === 'multi';
    const userAns = userAnswers[currentIndex];

    html += '<div class="options">';
    q.options.forEach((opt, i) => {
      const isSelected = isMulti
        ? (Array.isArray(userAns) && userAns.includes(i))
        : (userAns === i);
      html += `
        <div class="option ${q.type}-option ${isSelected ? 'selected' : ''}" data-index="${i}">
          <span class="option-indicator"></span>
          <span class="option-text">${opt}</span>
        </div>
      `;
    });
    html += '</div>';

    if (isMulti) {
      html += '<p class="multi-hint">（多选题，可选择多个选项）</p>';
    }
  }

  html += '</div>';
  content.innerHTML = html;

  // 为音频播放器添加错误处理
  if (q.type === 'subjective') {
    setupAudioErrors(content);
  }

  // 更新进度圆点和按钮
  renderProgressDots();
  updateNavButtons();
}

/**
 * 渲染底部进度圆点
 */
function renderProgressDots() {
  const container = document.getElementById('progress-dots');
  container.innerHTML = '';
  quizQuestions.forEach((q, i) => {
    const dot = document.createElement('span');
    dot.className = 'dot';
    // 主观题视为已答（无需选择）
    if (q.type === 'subjective' || userAnswers[i] !== undefined) {
      dot.classList.add('answered');
    }
    if (i === currentIndex) {
      dot.classList.add('current');
    }
    dot.addEventListener('click', () => goToQuestion(i));
    container.appendChild(dot);
  });
}

/**
 * 选择/取消选项
 * @param {number} qIdx - 题目索引
 * @param {number} optIdx - 选项索引
 */
function selectOption(qIdx, optIdx) {
  const q = quizQuestions[qIdx];

  if (q.type === 'single') {
    // 单选：直接替换选择
    userAnswers[qIdx] = optIdx;
  } else if (q.type === 'multi') {
    // 多选：切换选择状态
    if (!Array.isArray(userAnswers[qIdx])) {
      userAnswers[qIdx] = [];
    }
    const arr = userAnswers[qIdx];
    const pos = arr.indexOf(optIdx);
    if (pos > -1) {
      arr.splice(pos, 1);
    } else {
      arr.push(optIdx);
    }
  }

  // 重新渲染当前题（更新选中状态）
  renderQuestion();
}

/**
 * 跳转到指定题目
 * @param {number} index - 目标题目索引
 */
function goToQuestion(index) {
  if (index < 0 || index >= quizQuestions.length) return;
  currentIndex = index;
  renderQuestion();
}

/**
 * 下一题 / 提交
 */
function nextQuestion() {
  if (currentIndex === quizQuestions.length - 1) {
    submitQuiz();
  } else {
    currentIndex++;
    renderQuestion();
  }
}

/**
 * 上一题
 */
function prevQuestion() {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion();
  }
}

/**
 * 更新导航按钮状态
 */
function updateNavButtons() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  prevBtn.disabled = currentIndex === 0;

  if (currentIndex === quizQuestions.length - 1) {
    nextBtn.textContent = '提交答卷';
    nextBtn.classList.add('submit');
  } else {
    nextBtn.textContent = '下一题';
    nextBtn.classList.remove('submit');
  }
}

/**
 * 提交答卷：检查未答题目，跳转结果页
 */
function submitQuiz() {
  // 统计未答的选择题（主观题不计）
  const unanswered = [];
  quizQuestions.forEach((q, i) => {
    if (q.type !== 'subjective' && userAnswers[i] === undefined) {
      unanswered.push(i + 1);
    }
  });

  if (unanswered.length > 0) {
    if (!confirm(`还有 ${unanswered.length} 道题未作答（第 ${unanswered.join('、')} 题），确定要提交吗？`)) {
      return;
    }
  }

  showResult();
}


// ===== 结果页 =====

/**
 * 计分口径（单一权威来源）：
 * 单选题：15 题 × 3 分 = 45 分
 * 多选题： 3 题 × 5 分 = 15 分
 * 合计：60 分（主观题 40 分，网站不参与打分）
 * @returns {{
 *   totalScore: number,          // 单选+多选 合计得分
 *   singleScore: number,         // 单选得分
 *   multiScore: number,          // 多选得分
 *   singleCorrect: number,       // 单选答对题数
 *   multiCorrect: number,        // 多选答对题数
 *   wrongAnswers: Array          // 错题列表
 * }}
 */
function calculateScore() {
  let singleCorrect = 0;
  let multiCorrect = 0;
  const wrongAnswers = [];

  quizQuestions.forEach((q, i) => {
    // 主观题不计分
    if (q.type === 'subjective') return;

    const userAns = userAnswers[i];

    if (q.type === 'single') {
      // 单选：比较索引
      if (userAns === q.answer) {
        singleCorrect++;
      } else {
        wrongAnswers.push({
          question: q,
          userAnswer: userAns !== undefined ? [userAns] : null
        });
      }
    } else if (q.type === 'multi') {
      // 多选：排序后比较数组
      const sortedUser = Array.isArray(userAns) ? [...userAns].sort((a, b) => a - b) : [];
      const sortedCorrect = [...q.answer].sort((a, b) => a - b);
      if (JSON.stringify(sortedUser) === JSON.stringify(sortedCorrect)) {
        multiCorrect++;
      } else {
        wrongAnswers.push({
          question: q,
          userAnswer: Array.isArray(userAns) ? userAns : []
        });
      }
    }
  });

  const singleScore = singleCorrect * 3;
  const multiScore = multiCorrect * 5;

  return {
    singleScore,
    multiScore,
    totalScore: singleScore + multiScore,
    singleCorrect,
    multiCorrect,
    wrongAnswers
  };
}

/**
 * 根据得分率返回评语文案
 * 满分基准：60 分（单选 45 + 多选 15），不含主观题
 * S ≥ 58, A ≥ 51, B ≥ 39, C ≥ 27, D ≥ 15, E < 15
 * @param {number} score - 得分（含主观题补加的 fullSubjectiveScore）
 * @param {number} total - 满分（含主观题）
 * @param {number} scoreNoSubjective - 不含主观题的客观得分
 * @returns {string} 评语文案（评价仅基于客观题 60 分）
 */
function getScoreComment(score, total, scoreNoSubjective) {
  const objectiveMax = 60;
  const s = typeof scoreNoSubjective === 'number' ? scoreNoSubjective : score;
  const pct = s / objectiveMax;
  if (pct >= 55 / 60) return 'S级评估——你就是真正的屠龙者';
  if (pct >= 50 / 60) return 'A级学员，你的血脉正在觉醒';
  if (pct >= 39 / 60) return 'B级学员，狮心会欢迎你的加入';
  if (pct >= 27 / 60) return 'C级学员，初入卡塞尔学院的新生';
  if (pct >= 9 / 60) return 'D级学员，看来你需要重温龙族的故事';
  return 'F级评估——芬格尔师兄，是你吗？';
}

/**
 * 渲染单道错题
 * @param {Object} wa - { question, userAnswer }
 * @returns {string} HTML 字符串
 */
function renderWrongAnswer(wa) {
  const q = wa.question;
  const userAns = wa.userAnswer || [];
  const correctAns = Array.isArray(q.answer) ? q.answer : [q.answer];

  let html = '<div class="wrong-card">';
  html += `<span class="question-type ${q.type}">${TYPE_LABELS[q.type]}</span>`;
  html += `<p class="wrong-question-text">${q.question}</p>`;

  q.options.forEach((opt, i) => {
    const isCorrect = correctAns.includes(i);
    const isUserSelected = userAns.includes(i);
    let cls = 'wrong-option';
    let label = '';

    if (isCorrect) {
      cls += ' correct-answer';
      label = '<span class="answer-label correct-label">正确答案</span>';
    }
    if (isUserSelected && !isCorrect) {
      cls += ' wrong-answer';
      label = '<span class="answer-label wrong-label">你的选择</span>';
    }

    html += `<div class="${cls}"><span>${opt}</span>${label}</div>`;
  });

  html += '</div>';
  return html;
}

/**
 * 渲染结果页
 * 展示口径（与 calculateScore 保持一致，避免分项与总分不一致）：
 * - 客观总分（单选+多选）：60 分（网站打分）
 * - 主观题：40 分（需上交试卷由老师打分，网站不参与）
 */
function showResult() {
  const result = calculateScore();
  const objectiveTotal = 60;        // 客观题满分（单选45 + 多选15）

  // 主得分区：展示客观题得分 / 60
  document.getElementById('score-number').textContent = result.totalScore;
  document.getElementById('total-score').textContent = objectiveTotal;
  document.getElementById('score-comment').textContent =
    getScoreComment(result.totalScore, objectiveTotal, result.totalScore);

  // 分项得分：单选题/多选题
  const breakdownEl = document.getElementById('score-breakdown');
  if (breakdownEl) {
    breakdownEl.innerHTML = `
      <div class="score-breakdown">
        <div class="breakdown-item">
          <span class="breakdown-label">单选题（15题 × 3分）</span>
          <span class="breakdown-value">${result.singleScore} / 45 分</span>
        </div>
        <div class="breakdown-item">
          <span class="breakdown-label">多选题（ 3题 × 5分）</span>
          <span class="breakdown-value">${result.multiScore} / 15 分</span>
        </div>
        <div class="breakdown-item">
          <span class="breakdown-label">客观题总分</span>
          <span class="breakdown-value gold">${result.totalScore} / ${objectiveTotal} 分</span>
        </div>
        <div class="breakdown-item subjective">
          <span class="breakdown-label">主观题（满分 40 分）</span>
          <span class="breakdown-value">请上交试卷，由老师打分</span>
        </div>
      </div>
    `;
  }

  // 错题回顾按钮：有错题才显示，全对则显示祝贺
  const wrongReviewBtn = document.getElementById('wrong-review-btn');
  if (wrongReviewBtn) {
    if (result.wrongAnswers.length === 0) {
      wrongReviewBtn.textContent = '全部答对，无需回顾';
      wrongReviewBtn.disabled = true;
      wrongReviewBtn.classList.add('disabled-correct');
    } else {
      wrongReviewBtn.textContent = `回顾错题（${result.wrongAnswers.length} 题）`;
      wrongReviewBtn.disabled = false;
      wrongReviewBtn.classList.remove('disabled-correct');
    }
  }

  // 主观题展示
  const subjectiveQ = quizQuestions.find(q => q.type === 'subjective');
  const subjectiveContainer = document.getElementById('subjective-content');
  if (subjectiveContainer) {
    if (subjectiveQ) {
      subjectiveContainer.innerHTML = `
        <p class="subjective-question-text">${subjectiveQ.question}</p>
        ${generateAudioHTML(subjectiveQ.audios)}
        <p class="subjective-hint">（主观题满分 40 分，请上交试卷由老师打分）</p>
      `;
      setupAudioErrors(subjectiveContainer);
    } else {
      subjectiveContainer.innerHTML = '<p class="subjective-hint">暂无主观题</p>';
    }
  }

  showView('result-view');
}

/**
 * 渲染错题回顾页并跳转
 */
function showWrongReview() {
  const result = calculateScore();
  const container = document.getElementById('wrong-content');

  if (result.wrongAnswers.length === 0) {
    container.innerHTML = '<p class="all-correct">全部答对，真正的屠龙者！</p>';
  } else {
    container.innerHTML = result.wrongAnswers.map(renderWrongAnswer).join('');
  }

  showView('wrong-view');
}


// ===== 音频处理 =====

/**
 * 生成音频播放器 HTML
 * @param {Array} audios - 音频信息数组 [{ title, src }]
 * @returns {string} HTML 字符串
 */
function generateAudioHTML(audios) {
  if (!audios || audios.length === 0) return '';

  let html = '<div class="audio-section">';
  audios.forEach(audio => {
    // 对路径进行 URL 编码，处理空格和中文字符
    const encodedSrc = encodeURI(audio.src);
    html += `
      <div class="audio-card">
        <p class="audio-title">${audio.title}</p>
        <div class="audio-player-wrapper">
          <audio controls controlsList="nodownload" preload="none">
            <source src="${encodedSrc}" type="audio/mpeg">
          </audio>
          <p class="audio-missing-msg">音频文件缺失，请检查 audio/ 文件夹</p>
        </div>
      </div>
    `;
  });
  html += '</div>';
  return html;
}

/**
 * 为容器内的音频元素添加错误处理
 * 音频文件缺失时显示友好提示
 * @param {HTMLElement} container - 包含音频的容器
 */
function setupAudioErrors(container) {
  container.querySelectorAll('audio').forEach(audio => {
    audio.addEventListener('error', () => {
      const wrapper = audio.closest('.audio-player-wrapper');
      if (wrapper) {
        audio.style.display = 'none';
        const msg = wrapper.querySelector('.audio-missing-msg');
        if (msg) msg.style.display = 'block';
      }
    });
  });
}


// ===== 初始化 =====

/**
 * 页面加载完成后初始化
 */
function init() {
  // 加载题目数据
  loadQuestions();

  // 绑定按钮事件
  document.getElementById('start-btn').addEventListener('click', startQuiz);
  document.getElementById('prev-btn').addEventListener('click', prevQuestion);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('restart-btn').addEventListener('click', startQuiz);

  // 返回首页按钮（带确认）
  document.getElementById('quiz-back-btn').addEventListener('click', () => {
    if (confirm('确定要返回首页吗？当前答题进度将丢失。')) {
      showView('home-view');
    }
  });

  // 错题回顾按钮 → 跳转错题页
  document.getElementById('wrong-review-btn').addEventListener('click', showWrongReview);

  // 错题页返回按钮 → 回到结果页
  document.getElementById('wrong-back-btn').addEventListener('click', () => {
    showView('result-view');
  });

  // 选项点击事件委托（支持动态生成的选项）
  document.getElementById('quiz-content').addEventListener('click', (e) => {
    const option = e.target.closest('.option');
    if (option) {
      const optIdx = parseInt(option.dataset.index);
      selectOption(currentIndex, optIdx);
    }
  });
}

// DOM 加载完成后执行初始化
document.addEventListener('DOMContentLoaded', init);
