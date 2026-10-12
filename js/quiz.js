/**
 * QuizRoom - Quiz Engine (Builder & Player)
 * Manages:
 * 1. Host Quiz Builder (create, edit, reorder, duplicate, auto-save drafts)
 * 2. Student Quiz Runner (lobby, active question timers, speed bonuses, session resilience, results screen)
 */

const QuizEngine = (function () {
  // =========================================================================
  // HOST BUILDER STATE & LOGIC
  // =========================================================================
  let currentQuiz = createEmptyQuiz();
  let draftSaveTimeout = null;

  function createEmptyQuiz() {
    return {
      id: 'quiz_' + Date.now(),
      title: 'Untitled Quiz',
      description: 'Test your knowledge and challenge your peers!',
      settings: {
        overallTimerMinutes: 0, // 0 = off, per-question timers only
        defaultQuestionTime: 20, // seconds
        shuffleQuestions: false,
        shuffleOptions: false,
        showCorrectAnswers: true,
        passingScore: 70, // percentage
      },
      questions: [
        {
          id: 'q_' + Math.random().toString(36).substring(2, 8),
          type: 'mcq',
          text: 'What is the primary language used for web page structure?',
          options: ['HTML', 'CSS', 'JavaScript', 'Python'],
          correctIndex: 0,
          timeLimit: 20,
          points: 100,
          explanation: 'HTML (HyperText Markup Language) defines the fundamental layout and content structure of web documents.',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // --- Auto-Save Draft Trigger ---
  function triggerDraftSave() {
    const statusEl = document.getElementById('draftStatusText');
    if (statusEl) statusEl.textContent = 'Saving changes...';

    clearTimeout(draftSaveTimeout);
    draftSaveTimeout = setTimeout(() => {
      StorageManager.saveDraft(currentQuiz);
      if (statusEl) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        statusEl.textContent = `Draft saved at ${timeStr}`;
      }
    }, 400);
  }

  // --- Question Manipulation ---
  function addQuestion(type = 'mcq') {
    const defaultTime = currentQuiz.settings.defaultQuestionTime || 20;
    const newQ = {
      id: 'q_' + Math.random().toString(36).substring(2, 8),
      type: type,
      text: '',
      options: type === 'tf' ? ['True', 'False'] : ['Option A', 'Option B', 'Option C', 'Option D'],
      correctIndex: 0,
      timeLimit: defaultTime,
      points: 100,
      explanation: '',
    };
    currentQuiz.questions.push(newQ);
    renderBuilderQuestions();
    triggerDraftSave();
    
    // Scroll to the newly added question card
    setTimeout(() => {
      const cards = document.querySelectorAll('.question-card');
      if (cards.length > 0) {
        cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }

  function deleteQuestion(index) {
    if (currentQuiz.questions.length <= 1) {
      App.showToast('Quiz must have at least one question.', 'warning');
      return;
    }
    currentQuiz.questions.splice(index, 1);
    renderBuilderQuestions();
    triggerDraftSave();
    App.showToast('Question deleted.', 'info');
  }

  function duplicateQuestion(index) {
    const original = currentQuiz.questions[index];
    const clone = JSON.parse(JSON.stringify(original));
    clone.id = 'q_' + Math.random().toString(36).substring(2, 8);
    currentQuiz.questions.splice(index + 1, 0, clone);
    renderBuilderQuestions();
    triggerDraftSave();
    App.showToast('Question duplicated.', 'success');
  }

  function moveQuestion(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= currentQuiz.questions.length) return;
    const item = currentQuiz.questions.splice(index, 1)[0];
    currentQuiz.questions.splice(target, 0, item);
    renderBuilderQuestions();
    triggerDraftSave();
  }

  function addOption(qIndex) {
    const q = currentQuiz.questions[qIndex];
    if (q.options.length >= 6) {
      App.showToast('Maximum 6 options allowed per question.', 'warning');
      return;
    }
    q.options.push(`Option ${String.fromCharCode(65 + q.options.length)}`);
    renderBuilderQuestions();
    triggerDraftSave();
  }

  function removeOption(qIndex, optIndex) {
    const q = currentQuiz.questions[qIndex];
    if (q.options.length <= 2) {
      App.showToast('Questions require at least 2 options.', 'warning');
      return;
    }
    q.options.splice(optIndex, 1);
    if (q.correctIndex >= q.options.length) {
      q.correctIndex = 0;
    }
    renderBuilderQuestions();
    triggerDraftSave();
  }

  // --- Validate Quiz for Sharing / Playing ---
  function validateQuiz(quiz) {
    const errors = [];
    if (!quiz.title || !quiz.title.trim()) {
      errors.push('Quiz title is required.');
    }
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      errors.push('Quiz must contain at least one question.');
      return { valid: false, errors };
    }

    quiz.questions.forEach((q, idx) => {
      const qNum = idx + 1;
      if (!q.text || !q.text.trim()) {
        errors.push(`Question #${qNum} text cannot be empty.`);
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push(`Question #${qNum} must have at least 2 options.`);
      } else {
        const hasBlankOpt = q.options.some(opt => !opt || !opt.trim());
        if (hasBlankOpt) {
          errors.push(`Question #${qNum} has empty option text.`);
        }
      }
      if (q.correctIndex === undefined || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        errors.push(`Question #${qNum} must have a valid correct answer selected.`);
      }
    });

    return { valid: errors.length === 0, errors };
  }

  // --- Render Builder UI ---
  function initBuilder(quizToLoad = null) {
    if (quizToLoad) {
      currentQuiz = JSON.parse(JSON.stringify(quizToLoad));
    } else {
      const draft = StorageManager.getDraft();
      if (draft && draft.title && draft.questions && draft.questions.length > 0) {
        currentQuiz = draft;
      } else {
        currentQuiz = createEmptyQuiz();
      }
    }

    // Populate Quiz Header Inputs
    const titleInput = document.getElementById('quizTitleInput');
    const descInput = document.getElementById('quizDescInput');
    const passingInput = document.getElementById('passingScoreInput');
    const defaultTimeInput = document.getElementById('defaultTimeInput');
    const shuffleQInput = document.getElementById('shuffleQuestionsToggle');
    const shuffleOInput = document.getElementById('shuffleOptionsToggle');
    const showAnswersInput = document.getElementById('showAnswersToggle');

    if (titleInput) titleInput.value = currentQuiz.title || '';
    if (descInput) descInput.value = currentQuiz.description || '';
    if (passingInput) passingInput.value = currentQuiz.settings.passingScore || 70;
    if (defaultTimeInput) defaultTimeInput.value = currentQuiz.settings.defaultQuestionTime || 20;
    if (shuffleQInput) shuffleQInput.checked = !!currentQuiz.settings.shuffleQuestions;
    if (shuffleOInput) shuffleOInput.checked = !!currentQuiz.settings.shuffleOptions;
    if (showAnswersInput) showAnswersInput.checked = currentQuiz.settings.showCorrectAnswers !== false;

    renderBuilderQuestions();
  }

  function renderBuilderQuestions() {
    const container = document.getElementById('questionsListContainer');
    if (!container) return;
    container.innerHTML = '';

    currentQuiz.questions.forEach((q, qIndex) => {
      const card = document.createElement('div');
      card.className = 'question-card';
      card.dataset.index = qIndex;

      // Card Header
      const headerHtml = `
        <div class="question-card-header">
          <div class="question-number-badge">
            <span>Question ${qIndex + 1}</span>
            <span class="badge ${q.type === 'tf' ? 'badge-info' : 'badge-primary'}">${q.type === 'tf' ? 'True/False' : 'Multiple Choice'}</span>
          </div>
          <div class="question-controls">
            <button type="button" class="btn-tool" onclick="QuizEngine.moveQuestion(${qIndex}, -1)" title="Move Up" ${qIndex === 0 ? 'disabled' : ''}>⬆️</button>
            <button type="button" class="btn-tool" onclick="QuizEngine.moveQuestion(${qIndex}, 1)" title="Move Down" ${qIndex === currentQuiz.questions.length - 1 ? 'disabled' : ''}>⬇️</button>
            <button type="button" class="btn-tool" onclick="QuizEngine.duplicateQuestion(${qIndex})" title="Duplicate Question">📋</button>
            <button type="button" class="btn-tool delete" onclick="QuizEngine.deleteQuestion(${qIndex})" title="Delete Question">🗑️</button>
          </div>
        </div>
      `;

      // Question Text & Type selector
      const bodyHtml = `
        <div class="form-row" style="margin-bottom:0.75rem;">
          <div style="flex: 3;">
            <label class="form-label">Question Text</label>
            <textarea class="form-input" rows="2" placeholder="e.g., What is the capital of France?" oninput="QuizEngine.updateQuestionText(${qIndex}, this.value)">${escapeHtml(q.text || '')}</textarea>
          </div>
          <div style="flex: 1; min-width: 140px;">
            <label class="form-label">Type</label>
            <select class="form-select" onchange="QuizEngine.changeQuestionType(${qIndex}, this.value)">
              <option value="mcq" ${q.type === 'mcq' ? 'selected' : ''}>Multiple Choice</option>
              <option value="tf" ${q.type === 'tf' ? 'selected' : ''}>True / False</option>
            </select>
          </div>
        </div>
      `;

      // Options List
      let optionsHtml = '<div class="options-list">';
      q.options.forEach((opt, optIndex) => {
        const isChecked = q.correctIndex === optIndex;
        const letter = String.fromCharCode(65 + optIndex);
        optionsHtml += `
          <div class="option-row ${isChecked ? 'is-correct' : ''}">
            <input type="radio" name="q_correct_${q.id}" class="option-radio" title="Mark as correct answer" ${isChecked ? 'checked' : ''} onchange="QuizEngine.setCorrectIndex(${qIndex}, ${optIndex})">
            <span class="option-letter">${letter}</span>
            <input type="text" class="option-input" placeholder="Option text" value="${escapeHtml(opt)}" ${q.type === 'tf' ? 'readonly' : ''} oninput="QuizEngine.updateOptionText(${qIndex}, ${optIndex}, this.value)">
            ${q.type === 'mcq' && q.options.length > 2 ? `<button type="button" class="btn-remove-opt" onclick="QuizEngine.removeOption(${qIndex}, ${optIndex})" title="Remove Option">✕</button>` : ''}
          </div>
        `;
      });
      optionsHtml += '</div>';

      // Add Option Button for MCQ
      let addOptHtml = '';
      if (q.type === 'mcq' && q.options.length < 6) {
        addOptHtml = `
          <div style="margin-bottom: 1rem;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="QuizEngine.addOption(${qIndex})">
              + Add Option (${q.options.length}/6)
            </button>
          </div>
        `;
      }

      // Meta Settings (Points, Timer, Explanation)
      const metaHtml = `
        <div class="question-meta-grid">
          <div>
            <label class="form-label">Points</label>
            <input type="number" class="form-input" min="10" max="1000" step="10" value="${q.points || 100}" oninput="QuizEngine.updatePoints(${qIndex}, this.value)">
          </div>
          <div>
            <label class="form-label">Time Limit (sec)</label>
            <input type="number" class="form-input" min="5" max="300" step="5" value="${q.timeLimit || 20}" oninput="QuizEngine.updateTimeLimit(${qIndex}, this.value)">
          </div>
          <div style="grid-column: span 2;">
            <label class="form-label">Explanation (shown after answer)</label>
            <input type="text" class="form-input" placeholder="Explain why this is correct..." value="${escapeHtml(q.explanation || '')}" oninput="QuizEngine.updateExplanation(${qIndex}, this.value)">
          </div>
        </div>
      `;

      card.innerHTML = headerHtml + bodyHtml + optionsHtml + addOptHtml + metaHtml;
      container.appendChild(card);
    });

    // Update Question Count in summary
    const countEl = document.getElementById('builderQuestionCount');
    if (countEl) countEl.textContent = `${currentQuiz.questions.length} questions`;
  }

  // Inline updaters for inputs
  function updateQuestionText(qIndex, val) {
    if (currentQuiz.questions[qIndex]) {
      currentQuiz.questions[qIndex].text = val;
      triggerDraftSave();
    }
  }

  function changeQuestionType(qIndex, newType) {
    const q = currentQuiz.questions[qIndex];
    if (!q) return;
    q.type = newType;
    if (newType === 'tf') {
      q.options = ['True', 'False'];
      q.correctIndex = 0;
    } else if (newType === 'mcq' && q.options.length < 4) {
      q.options = ['Option A', 'Option B', 'Option C', 'Option D'];
      q.correctIndex = 0;
    }
    renderBuilderQuestions();
    triggerDraftSave();
  }

  function updateOptionText(qIndex, optIndex, val) {
    if (currentQuiz.questions[qIndex] && currentQuiz.questions[qIndex].options[optIndex] !== undefined) {
      currentQuiz.questions[qIndex].options[optIndex] = val;
      triggerDraftSave();
    }
  }

  function setCorrectIndex(qIndex, optIndex) {
    if (currentQuiz.questions[qIndex]) {
      currentQuiz.questions[qIndex].correctIndex = optIndex;
      renderBuilderQuestions();
      triggerDraftSave();
    }
  }

  function updatePoints(qIndex, val) {
    if (currentQuiz.questions[qIndex]) {
      currentQuiz.questions[qIndex].points = Math.max(1, parseInt(val, 10) || 100);
      triggerDraftSave();
    }
  }

  function updateTimeLimit(qIndex, val) {
    if (currentQuiz.questions[qIndex]) {
      currentQuiz.questions[qIndex].timeLimit = Math.max(0, parseInt(val, 10) || 20);
      triggerDraftSave();
    }
  }

  function updateExplanation(qIndex, val) {
    if (currentQuiz.questions[qIndex]) {
      currentQuiz.questions[qIndex].explanation = val;
      triggerDraftSave();
    }
  }

  function updateQuizMetadata(title, desc) {
    currentQuiz.title = title;
    currentQuiz.description = desc;
    triggerDraftSave();
  }

  function updateQuizSetting(key, val) {
    currentQuiz.settings[key] = val;
    triggerDraftSave();
  }

  function getCurrentQuiz() {
    return currentQuiz;
  }

  function resetToNewQuiz() {
    currentQuiz = createEmptyQuiz();
    StorageManager.clearDraft();
    initBuilder();
    App.showToast('Started new quiz draft.', 'info');
  }

  // =========================================================================
  // STUDENT QUIZ RUNNER STATE & ENGINE
  // =========================================================================
  const student = {
    quiz: null,
    studentName: '',
    currentIndex: 0,
    answers: [], // Array of { qIndex, selectedIndex, isCorrect, basePoints, bonusPoints, totalPoints, timeSpent }
    totalScore: 0,
    maxPossibleScore: 0,
    startTime: null,
    questionStartTime: null,
    timerInterval: null,
    remainingSeconds: 0,
    totalQuestionSeconds: 0,
    isCompleted: false,
    questionsToPlay: [], // Clone of questions, optionally shuffled
  };

  // --- Prepare & Initialize Quiz for Student ---
  function loadQuizForStudent(quizData) {
    if (!quizData) return;
    student.quiz = JSON.parse(JSON.stringify(quizData));
    
    // Check if there is an active session stored for this exact quiz
    const activeSession = StorageManager.getActiveSession();
    const resumePrompt = document.getElementById('playerResumePrompt');

    if (activeSession && activeSession.quizId === quizData.id && !activeSession.isCompleted) {
      if (resumePrompt) {
        resumePrompt.style.display = 'block';
        const resumeName = document.getElementById('resumeStudentName');
        if (resumeName) resumeName.textContent = activeSession.studentName || 'Student';
      }
    } else {
      if (resumePrompt) resumePrompt.style.display = 'none';
    }

    // Render Lobby Card Details
    const titleEl = document.getElementById('playerLobbyTitle');
    const descEl = document.getElementById('playerLobbyDesc');
    const qCountEl = document.getElementById('playerLobbyQCount');
    const passScoreEl = document.getElementById('playerLobbyPassScore');
    const timeLimitEl = document.getElementById('playerLobbyTotalTime');

    if (titleEl) titleEl.textContent = student.quiz.title || 'Quiz';
    if (descEl) descEl.textContent = student.quiz.description || 'Welcome to this quiz!';
    if (qCountEl) qCountEl.textContent = `${student.quiz.questions.length} Questions`;
    if (passScoreEl) passScoreEl.textContent = `${student.quiz.settings.passingScore || 70}% to Pass`;

    // Calculate approximate total time
    const totalSecs = student.quiz.questions.reduce((sum, q) => sum + (q.timeLimit || 20), 0);
    const mins = Math.ceil(totalSecs / 60);
    if (timeLimitEl) timeLimitEl.textContent = `~${mins} min`;

    // Switch view to Lobby
    showPlayerScreen('lobby');
  }

  function startQuiz(resume = false) {
    if (resume) {
      const session = StorageManager.getActiveSession();
      if (session) {
        student.studentName = session.studentName;
        student.currentIndex = session.currentIndex || 0;
        student.answers = session.answers || [];
        student.totalScore = session.totalScore || 0;
        student.questionsToPlay = session.questionsToPlay || student.quiz.questions;
        student.startTime = session.startTime || Date.now();
        student.isCompleted = false;
        calculateMaxScore();
        showPlayerScreen('active');
        renderActiveQuestion();
        return;
      }
    }

    // Fresh Quiz Start
    const nameInput = document.getElementById('studentNameInput');
    const studentName = nameInput ? nameInput.value.trim() : '';

    if (!studentName) {
      App.showToast('Please enter your name to start the quiz.', 'warning');
      if (nameInput) nameInput.focus();
      return;
    }

    student.studentName = studentName;
    student.currentIndex = 0;
    student.answers = [];
    student.totalScore = 0;
    student.startTime = Date.now();
    student.isCompleted = false;

    // Clone and optionally shuffle questions
    let qList = JSON.parse(JSON.stringify(student.quiz.questions));
    if (student.quiz.settings.shuffleQuestions) {
      qList = shuffleArray(qList);
    }

    // Optionally shuffle options per question
    if (student.quiz.settings.shuffleOptions) {
      qList.forEach(q => {
        if (q.type !== 'tf') { // keep True/False in logical order
          const correctOpt = q.options[q.correctIndex];
          q.options = shuffleArray([...q.options]);
          q.correctIndex = q.options.indexOf(correctOpt);
        }
      });
    }

    student.questionsToPlay = qList;
    calculateMaxScore();

    // Persist initial state
    saveStudentSession();

    showPlayerScreen('active');
    renderActiveQuestion();
  }

  function calculateMaxScore() {
    student.maxPossibleScore = student.questionsToPlay.reduce((sum, q) => {
      // Base points + theoretical 40% maximum speed bonus
      const base = q.points || 100;
      const maxBonus = Math.round(base * 0.4);
      return sum + (base + maxBonus);
    }, 0);
  }

  // --- Active Question Screen ---
  function renderActiveQuestion() {
    clearInterval(student.timerInterval);

    const qIndex = student.currentIndex;
    const totalQ = student.questionsToPlay.length;

    if (qIndex >= totalQ) {
      finishQuiz();
      return;
    }

    const q = student.questionsToPlay[qIndex];
    student.totalQuestionSeconds = q.timeLimit || 20;
    student.remainingSeconds = student.totalQuestionSeconds;
    student.questionStartTime = Date.now();

    // Progress Bar & Indicators
    const progressFill = document.getElementById('playerProgressFill');
    const qNumberEl = document.getElementById('playerQuestionNumber');
    const currentScoreEl = document.getElementById('playerCurrentScore');

    if (progressFill) {
      const pct = Math.round((qIndex / totalQ) * 100);
      progressFill.style.width = `${pct}%`;
    }
    if (qNumberEl) qNumberEl.textContent = `Question ${qIndex + 1} of ${totalQ}`;
    if (currentScoreEl) currentScoreEl.textContent = `${student.totalScore} pts`;

    // Question Text
    const qTextEl = document.getElementById('playerQuestionText');
    if (qTextEl) qTextEl.textContent = q.text;

    // Timer setup
    updateTimerDisplay();
    startQuestionTimer();

    // Answer Buttons
    const answersContainer = document.getElementById('playerAnswersContainer');
    if (!answersContainer) return;
    answersContainer.innerHTML = '';

    q.options.forEach((opt, optIndex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'answer-btn';
      btn.id = `answerBtn_${optIndex}`;
      btn.dataset.index = optIndex;
      
      const keyHint = optIndex + 1;
      btn.innerHTML = `
        <span class="answer-key-badge">${keyHint}</span>
        <span class="answer-text" style="flex:1;">${escapeHtml(opt)}</span>
      `;

      btn.addEventListener('click', () => handleStudentAnswer(optIndex));
      answersContainer.appendChild(btn);
    });

    // Clear any previous explanation container
    const expContainer = document.getElementById('playerExplanationBox');
    if (expContainer) {
      expContainer.style.display = 'none';
      expContainer.innerHTML = '';
    }
  }

  // --- Timer Engine ---
  function startQuestionTimer() {
    if (student.totalQuestionSeconds <= 0) return; // Unlimited time

    student.timerInterval = setInterval(() => {
      student.remainingSeconds--;
      updateTimerDisplay();

      if (student.remainingSeconds <= 0) {
        clearInterval(student.timerInterval);
        handleTimeout();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const timerPill = document.getElementById('playerTimerPill');
    const timerBarFill = document.getElementById('playerTimerBarFill');
    const timerSecondsEl = document.getElementById('playerTimerSeconds');

    const rem = Math.max(0, student.remainingSeconds);
    const total = student.totalQuestionSeconds;
    const ratio = total > 0 ? (rem / total) : 1;

    if (timerSecondsEl) timerSecondsEl.textContent = `${rem}s`;

    if (timerBarFill) {
      timerBarFill.style.width = `${Math.round(ratio * 100)}%`;
      if (ratio <= 0.25) {
        timerBarFill.className = 'timer-bar-fill danger';
      } else if (ratio <= 0.5) {
        timerBarFill.className = 'timer-bar-fill warning';
      } else {
        timerBarFill.className = 'timer-bar-fill';
      }
    }

    if (timerPill) {
      if (rem <= 5 && rem > 0) {
        timerPill.classList.add('urgent');
      } else {
        timerPill.classList.remove('urgent');
      }
    }
  }

  // --- Answer Handling & Speed Bonus ---
  function handleStudentAnswer(selectedIndex) {
    clearInterval(student.timerInterval);

    const q = student.questionsToPlay[student.currentIndex];
    const isCorrect = selectedIndex === q.correctIndex;
    const timeSpent = Math.max(1, Math.round((Date.now() - student.questionStartTime) / 1000));
    
    // Calculate Score with Speed Bonus:
    // Base points + bonus proportional to remaining time
    let basePoints = 0;
    let bonusPoints = 0;

    if (isCorrect) {
      basePoints = q.points || 100;
      if (student.totalQuestionSeconds > 0 && student.remainingSeconds > 0) {
        const bonusFraction = student.remainingSeconds / student.totalQuestionSeconds;
        bonusPoints = Math.round(basePoints * 0.4 * bonusFraction);
      }
    }

    const pointsEarned = basePoints + bonusPoints;
    student.totalScore += pointsEarned;

    // Record answer
    student.answers.push({
      qIndex: student.currentIndex,
      questionText: q.text,
      options: q.options,
      selectedIndex: selectedIndex,
      correctIndex: q.correctIndex,
      isCorrect: isCorrect,
      basePoints: basePoints,
      bonusPoints: bonusPoints,
      pointsEarned: pointsEarned,
      timeSpent: timeSpent,
      explanation: q.explanation || '',
    });

    // Provide tactile visual feedback
    const buttons = document.querySelectorAll('.answer-btn');
    buttons.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === selectedIndex) {
        btn.classList.add(isCorrect ? 'correct' : 'wrong');
      }
      if (!isCorrect && idx === q.correctIndex) {
        btn.classList.add('correct'); // Highlight the correct answer
      }
    });

    // Save progress to sessionStorage
    saveStudentSession();

    // Show speed bonus alert or explanation if available
    if (bonusPoints > 0) {
      App.showToast(`Correct! +${basePoints} pts (+${bonusPoints} Speed Bonus! ⚡)`, 'success');
    } else if (isCorrect) {
      App.showToast(`Correct! +${basePoints} pts`, 'success');
    } else {
      App.showToast(`Incorrect!`, 'error');
    }

    // Brief delay before transitioning to next question
    setTimeout(() => {
      student.currentIndex++;
      renderActiveQuestion();
    }, 1100);
  }

  function handleTimeout() {
    const q = student.questionsToPlay[student.currentIndex];
    
    student.answers.push({
      qIndex: student.currentIndex,
      questionText: q.text,
      options: q.options,
      selectedIndex: -1, // timed out
      correctIndex: q.correctIndex,
      isCorrect: false,
      basePoints: 0,
      bonusPoints: 0,
      pointsEarned: 0,
      timeSpent: student.totalQuestionSeconds,
      explanation: q.explanation || '',
      timedOut: true,
    });

    // Disable all options and highlight the correct one
    const buttons = document.querySelectorAll('.answer-btn');
    buttons.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === q.correctIndex) {
        btn.classList.add('correct');
      }
    });

    saveStudentSession();
    App.showToast("Time's up! Moving to next question...", 'warning');

    setTimeout(() => {
      student.currentIndex++;
      renderActiveQuestion();
    }, 1200);
  }

  // --- Finish Quiz & Results Screen ---
  function finishQuiz() {
    clearInterval(student.timerInterval);
    student.isCompleted = true;

    // Clear active session since quiz is completed
    StorageManager.clearActiveSession();

    const totalQuestions = student.questionsToPlay.length;
    const correctCount = student.answers.filter(a => a.isCorrect).length;
    const percentage = Math.round((correctCount / totalQuestions) * 100);
    const passingScore = student.quiz.settings.passingScore || 70;
    const isPassed = percentage >= passingScore;
    const totalTimeSeconds = Math.round((Date.now() - student.startTime) / 1000);

    // Save to student's local attempts history
    const attemptRecord = {
      quizId: student.quiz.id,
      quizTitle: student.quiz.title,
      score: student.totalScore,
      maxScore: student.maxPossibleScore,
      percentage: percentage,
      passed: isPassed,
      correctCount: correctCount,
      totalQuestions: totalQuestions,
      timeTakenSeconds: totalTimeSeconds,
      date: new Date().toLocaleDateString(),
    };
    StorageManager.saveMyAttempt(attemptRecord);

    // Render Results Screen
    renderResultsView(attemptRecord);
    showPlayerScreen('results');

    // Trigger Confetti if passed!
    if (isPassed) {
      App.triggerConfetti();
    }
  }

  function renderResultsView(res) {
    const statusBadge = document.getElementById('resultStatusBadge');
    const scoreVal = document.getElementById('resultScoreVal');
    const scoreMax = document.getElementById('resultScoreMax');
    const pctVal = document.getElementById('resultPctVal');
    const correctVal = document.getElementById('resultCorrectVal');
    const timeVal = document.getElementById('resultTimeVal');

    if (statusBadge) {
      if (res.passed) {
        statusBadge.textContent = '🎉 PASSED!';
        statusBadge.className = 'result-badge-status badge-success';
      } else {
        statusBadge.textContent = '📚 NEEDS PRACTICE';
        statusBadge.className = 'result-badge-status badge-warning';
      }
    }

    if (scoreVal) scoreVal.textContent = res.score;
    if (scoreMax) scoreMax.textContent = `out of ${res.maxScore} max pts`;
    if (pctVal) pctVal.textContent = `${res.percentage}%`;
    if (correctVal) correctVal.textContent = `${res.correctCount} / ${res.totalQuestions}`;
    if (timeVal) timeVal.textContent = formatTime(res.timeTakenSeconds);

    // Generate Student Result Code
    const resultCode = ShareManager.encodeResultCode({
      quizId: res.quizId,
      quizTitle: res.quizTitle,
      name: student.studentName,
      score: res.score,
      maxScore: res.maxScore,
      percentage: res.percentage,
      passed: res.passed,
      timeTakenSeconds: res.timeTakenSeconds,
      correctCount: res.correctCount,
      totalQuestions: res.totalQuestions,
    });

    const codeSnippet = document.getElementById('resultCodeSnippet');
    if (codeSnippet) codeSnippet.textContent = resultCode;

    const copyBtn = document.getElementById('btnCopyResultCode');
    if (copyBtn) {
      copyBtn.onclick = () => {
        ShareManager.copyToClipboard(resultCode);
        App.showToast('Result code copied to clipboard! Send it to your host.', 'success');
      };
    }

    // Render Review Section (if host allowed)
    const reviewContainer = document.getElementById('resultsReviewList');
    const reviewSection = document.getElementById('resultsReviewSection');

    if (student.quiz.settings.showCorrectAnswers && reviewContainer && reviewSection) {
      reviewSection.style.display = 'block';
      reviewContainer.innerHTML = '';

      student.answers.forEach((ans, idx) => {
        const item = document.createElement('div');
        item.className = `review-item ${ans.isCorrect ? 'correct-answer' : 'wrong-answer'}`;

        const chosenText = ans.selectedIndex >= 0 ? ans.options[ans.selectedIndex] : 'Timed Out (No answer)';
        const correctText = ans.options[ans.correctIndex];

        item.innerHTML = `
          <div style="font-weight:700; margin-bottom:0.4rem; color:var(--text-primary);">
            Question ${idx + 1}: ${escapeHtml(ans.questionText)}
          </div>
          <div style="font-size:0.85rem; margin-bottom:0.25rem;">
            <strong>Your Answer:</strong> <span style="color:${ans.isCorrect ? 'var(--success)' : 'var(--danger)'};">${escapeHtml(chosenText)}</span>
          </div>
          ${!ans.isCorrect ? `<div style="font-size:0.85rem; margin-bottom:0.25rem;"><strong>Correct Answer:</strong> <span style="color:var(--success);">${escapeHtml(correctText)}</span></div>` : ''}
          ${ans.explanation ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.35rem; font-style:italic;">💡 ${escapeHtml(ans.explanation)}</div>` : ''}
        `;
        reviewContainer.appendChild(item);
      });
    } else if (reviewSection) {
      reviewSection.style.display = 'none';
    }
  }

  // --- Session Persistence ---
  function saveStudentSession() {
    StorageManager.saveActiveSession({
      quizId: student.quiz.id,
      studentName: student.studentName,
      currentIndex: student.currentIndex,
      answers: student.answers,
      totalScore: student.totalScore,
      questionsToPlay: student.questionsToPlay,
      startTime: student.startTime,
      isCompleted: student.isCompleted,
    });
  }

  // --- Screen Switcher for Student View ---
  function showPlayerScreen(screenName) {
    const screens = {
      lobby: document.getElementById('playerScreenLobby'),
      active: document.getElementById('playerScreenActive'),
      results: document.getElementById('playerScreenResults'),
    };

    Object.keys(screens).forEach(key => {
      if (screens[key]) {
        screens[key].style.display = key === screenName ? 'block' : 'none';
      }
    });
  }

  // Helper formatting
  function formatTime(totalSecs) {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Public Interface
  return {
    initBuilder,
    getCurrentQuiz,
    addQuestion,
    deleteQuestion,
    duplicateQuestion,
    moveQuestion,
    addOption,
    removeOption,
    setCorrectIndex,
    updateQuestionText,
    updateOptionText,
    changeQuestionType,
    updatePoints,
    updateTimeLimit,
    updateExplanation,
    updateQuizMetadata,
    updateQuizSetting,
    resetToNewQuiz,
    validateQuiz,
    // Player
    loadQuizForStudent,
    startQuiz,
    handleStudentAnswer,
    getStudentState: () => student,
  };
})();

// Attach to window
window.QuizEngine = QuizEngine;
