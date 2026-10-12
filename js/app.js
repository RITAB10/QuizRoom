/**
 * QuizRoom - Main Application Coordinator
 * Handles:
 * 1. View navigation (Builder, Dashboard, Player, Library, Attempts)
 * 2. URL hash routing for instant student quiz links (#quiz=...)
 * 3. Dark/Light theme switching
 * 4. Toast notification system
 * 5. Standalone canvas confetti engine
 * 6. Share modal with live QR code
 * 7. Keyboard shortcuts for quizzes
 */

const App = (function () {
  let activeTab = 'builder';

  // --- Initialization ---
  function init() {
    initTheme();
    initKeyboardShortcuts();
    setupEventListeners();

    // Check URL Hash for shared quiz
    const sharedQuiz = ShareManager.parseShareUrl();
    if (sharedQuiz && sharedQuiz.title && sharedQuiz.questions) {
      // Direct Student Link detected!
      switchTab('player');
      QuizEngine.loadQuizForStudent(sharedQuiz);
      showToast(`Loaded shared quiz: "${sharedQuiz.title}"`, 'success');
    } else {
      // Default to builder view
      QuizEngine.initBuilder();
      switchTab('builder');
    }

    renderLibrary();
  }

  // --- View Tab Switching ---
  function switchTab(tabName) {
    activeTab = tabName;

    // Update Nav buttons
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update View Sections
    const views = document.querySelectorAll('.view-section');
    views.forEach(view => {
      view.classList.toggle('active', view.id === `view-${tabName}`);
    });

    // Sub-view updates
    if (tabName === 'dashboard') {
      LeaderboardManager.initDashboard();
    } else if (tabName === 'attempts') {
      LeaderboardManager.renderMyAttempts();
    } else if (tabName === 'library') {
      renderLibrary();
    }
  }

  // --- Theme Controller ---
  function initTheme() {
    const savedTheme = StorageManager.getTheme();
    applyTheme(savedTheme);

    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        StorageManager.saveTheme(next);
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
      toggleBtn.title = `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`;
    }
  }

  // --- Toast Notification Manager ---
  function showToast(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  // --- Standalone Pure Canvas Confetti Explosion ---
  function triggerConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#f43f5e'];

    for (let i = 0; i < 90; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2 + 50,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.8) * 18,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 12,
        alpha: 1,
      });
    }

    let frame = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let activeCount = 0;

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.vx *= 0.98; // drag
        p.rotation += p.rSpeed;
        p.alpha -= 0.007;

        if (p.alpha > 0) {
          activeCount++;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
          ctx.restore();
        }
      });

      frame++;
      if (activeCount > 0 && frame < 200) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    animate();
  }

  // --- Share Modal Controller ---
  function openShareModal(quizToShare = null) {
    const quiz = quizToShare || QuizEngine.getCurrentQuiz();
    const validation = QuizEngine.validateQuiz(quiz);

    if (!validation.valid) {
      showToast(validation.errors[0] || 'Please finish your quiz setup first.', 'warning');
      return;
    }

    const shareUrl = ShareManager.generateShareUrl(quiz);
    if (!shareUrl) {
      showToast('Failed to generate share URL.', 'error');
      return;
    }

    const modal = document.getElementById('shareModal');
    const urlInput = document.getElementById('shareUrlInput');
    const qrContainer = document.getElementById('shareQrContainer');
    const modalQuizTitle = document.getElementById('shareModalQuizTitle');

    if (modalQuizTitle) modalQuizTitle.textContent = quiz.title;
    if (urlInput) urlInput.value = shareUrl;
    if (qrContainer) ShareManager.renderQRCode(qrContainer, shareUrl);

    if (modal) modal.classList.add('show');
  }

  function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) modal.classList.remove('show');
  }

  // --- Keyboard Shortcuts (1-6 for answering, etc.) ---
  function initKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
      // Only active during quiz question answering
      if (activeTab === 'player') {
        const activeScreen = document.getElementById('playerScreenActive');
        if (activeScreen && activeScreen.style.display !== 'none') {
          // If typing in an input, skip
          if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= 6) {
            const btn = document.getElementById(`answerBtn_${num - 1}`);
            if (btn && !btn.disabled) {
              btn.click();
            }
          }
        }
      }
    });
  }

  // --- Sample & Saved Quizzes Library ---
  function renderLibrary() {
    const container = document.getElementById('libraryGrid');
    if (!container) return;

    const samples = StorageManager.SAMPLE_QUIZZES;
    const saved = StorageManager.getSavedQuizzes();

    let html = '';

    // Sample Quizzes Section
    html += '<h3 style="grid-column: 1/-1; margin: 0.5rem 0; font-size:1.15rem; color:var(--accent-primary);">✨ Pre-Packaged Quizzes (Ready to Play)</h3>';
    samples.forEach(q => {
      html += createLibraryCardHtml(q, true);
    });

    // Host Custom Saved Quizzes
    if (saved.length > 0) {
      html += '<h3 style="grid-column: 1/-1; margin: 1.5rem 0 0.5rem; font-size:1.15rem; color:var(--text-primary);">📁 My Saved Quizzes</h3>';
      saved.forEach(q => {
        html += createLibraryCardHtml(q, false);
      });
    }

    container.innerHTML = html;
  }

  function createLibraryCardHtml(quiz, isSample) {
    const totalSecs = quiz.questions.reduce((sum, q) => sum + (q.timeLimit || 20), 0);
    const mins = Math.ceil(totalSecs / 60);

    return `
      <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; margin-bottom:0.5rem;">
            <h4 style="font-size:1.15rem;">${escapeHtml(quiz.title)}</h4>
            <span class="badge ${isSample ? 'badge-info' : 'badge-primary'}">${isSample ? 'Sample' : 'Saved'}</span>
          </div>
          <p style="font-size:0.85rem; margin-bottom:1rem;">${escapeHtml(quiz.description || '')}</p>
          <div style="font-size:0.75rem; color:var(--text-muted); display:flex; gap:1rem; margin-bottom:1.25rem;">
            <span>❓ ${quiz.questions.length} Questions</span>
            <span>⏱️ ~${mins} min</span>
            <span>🎯 ${quiz.settings.passingScore || 70}% to pass</span>
          </div>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm" onclick="App.launchQuizPlayer('${quiz.id}')">🎮 Play Quiz</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="App.loadQuizIntoBuilder('${quiz.id}')">✏️ Edit in Builder</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="App.shareQuizDirectly('${quiz.id}')">🔗 Share</button>
          ${!isSample ? `<button type="button" class="btn btn-tool delete" onclick="App.deleteSavedQuiz('${quiz.id}')" title="Delete">🗑️</button>` : ''}
        </div>
      </div>
    `;
  }

  function findQuizById(id) {
    const sample = StorageManager.SAMPLE_QUIZZES.find(q => q.id === id);
    if (sample) return sample;
    return StorageManager.getSavedQuizzes().find(q => q.id === id);
  }

  function launchQuizPlayer(quizId) {
    const quiz = findQuizById(quizId);
    if (!quiz) return;
    switchTab('player');
    QuizEngine.loadQuizForStudent(quiz);
  }

  function loadQuizIntoBuilder(quizId) {
    const quiz = findQuizById(quizId);
    if (!quiz) return;
    QuizEngine.initBuilder(quiz);
    switchTab('builder');
    showToast(`Loaded "${quiz.title}" into Builder!`, 'success');
  }

  function shareQuizDirectly(quizId) {
    const quiz = findQuizById(quizId);
    if (!quiz) return;
    openShareModal(quiz);
  }

  function deleteSavedQuiz(quizId) {
    if (confirm('Delete this saved quiz?')) {
      StorageManager.deleteSavedQuiz(quizId);
      renderLibrary();
      showToast('Quiz deleted from library.', 'info');
    }
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Navigation tabs
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Hash change listener (back/forward or external link)
    window.addEventListener('hashchange', () => {
      const sharedQuiz = ShareManager.parseShareUrl();
      if (sharedQuiz) {
        switchTab('player');
        QuizEngine.loadQuizForStudent(sharedQuiz);
      }
    });

    // Builder Metadata Inputs
    const titleInput = document.getElementById('quizTitleInput');
    const descInput = document.getElementById('quizDescInput');
    const passingInput = document.getElementById('passingScoreInput');
    const defaultTimeInput = document.getElementById('defaultTimeInput');
    const shuffleQInput = document.getElementById('shuffleQuestionsToggle');
    const shuffleOInput = document.getElementById('shuffleOptionsToggle');
    const showAnswersInput = document.getElementById('showAnswersToggle');

    if (titleInput) {
      titleInput.addEventListener('input', e => QuizEngine.updateQuizMetadata(e.target.value, descInput ? descInput.value : ''));
    }
    if (descInput) {
      descInput.addEventListener('input', e => QuizEngine.updateQuizMetadata(titleInput ? titleInput.value : '', e.target.value));
    }
    if (passingInput) {
      passingInput.addEventListener('input', e => QuizEngine.updateQuizSetting('passingScore', parseInt(e.target.value, 10) || 70));
    }
    if (defaultTimeInput) {
      defaultTimeInput.addEventListener('input', e => QuizEngine.updateQuizSetting('defaultQuestionTime', parseInt(e.target.value, 10) || 20));
    }
    if (shuffleQInput) {
      shuffleQInput.addEventListener('change', e => QuizEngine.updateQuizSetting('shuffleQuestions', e.target.checked));
    }
    if (shuffleOInput) {
      shuffleOInput.addEventListener('change', e => QuizEngine.updateQuizSetting('shuffleOptions', e.target.checked));
    }
    if (showAnswersInput) {
      showAnswersInput.addEventListener('change', e => QuizEngine.updateQuizSetting('showCorrectAnswers', e.target.checked));
    }

    // Builder Buttons
    const btnAddMcq = document.getElementById('btnAddMcqQuestion');
    const btnAddTf = document.getElementById('btnAddTfQuestion');
    const btnSaveQuiz = document.getElementById('btnSaveQuiz');
    const btnExportJson = document.getElementById('btnExportJson');
    const btnImportJson = document.getElementById('btnImportJson');
    const jsonFileInput = document.getElementById('jsonFileInput');
    const btnShareQuiz = document.getElementById('btnShareQuiz');
    const btnResetQuiz = document.getElementById('btnResetQuiz');

    if (btnAddMcq) btnAddMcq.addEventListener('click', () => QuizEngine.addQuestion('mcq'));
    if (btnAddTf) btnAddTf.addEventListener('click', () => QuizEngine.addQuestion('tf'));
    
    if (btnSaveQuiz) {
      btnSaveQuiz.addEventListener('click', () => {
        const quiz = QuizEngine.getCurrentQuiz();
        const res = QuizEngine.validateQuiz(quiz);
        if (!res.valid) {
          showToast(res.errors[0], 'warning');
          return;
        }
        StorageManager.saveQuiz(quiz);
        renderLibrary();
        showToast('Quiz saved to your library!', 'success');
      });
    }

    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => {
        const quiz = QuizEngine.getCurrentQuiz();
        StorageManager.exportQuizJSON(quiz);
        showToast('Quiz exported to JSON file.', 'success');
      });
    }

    if (btnImportJson && jsonFileInput) {
      btnImportJson.addEventListener('click', () => jsonFileInput.click());
      jsonFileInput.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const imported = await StorageManager.importQuizJSON(file);
          QuizEngine.initBuilder(imported);
          renderLibrary();
          showToast(`Imported "${imported.title}" successfully!`, 'success');
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          jsonFileInput.value = '';
        }
      });
    }

    if (btnShareQuiz) btnShareQuiz.addEventListener('click', () => openShareModal());
    if (btnResetQuiz) btnResetQuiz.addEventListener('click', () => {
      if (confirm('Start a new quiz? Unsaved changes will be cleared.')) {
        QuizEngine.resetToNewQuiz();
      }
    });

    // Student Lobby Buttons
    const btnStartQuiz = document.getElementById('btnStartQuiz');
    const btnResumeQuiz = document.getElementById('btnResumeQuiz');
    const btnRestartQuiz = document.getElementById('btnRestartQuiz');

    if (btnStartQuiz) btnStartQuiz.addEventListener('click', () => QuizEngine.startQuiz(false));
    if (btnResumeQuiz) btnResumeQuiz.addEventListener('click', () => QuizEngine.startQuiz(true));
    if (btnRestartQuiz) {
      btnRestartQuiz.addEventListener('click', () => {
        StorageManager.clearActiveSession();
        QuizEngine.startQuiz(false);
      });
    }

    // Share Modal Actions
    const btnCopyShareUrl = document.getElementById('btnCopyShareUrl');
    const btnOpenShareNewTab = document.getElementById('btnOpenShareNewTab');
    const btnCloseShareModal = document.getElementById('btnCloseShareModal');

    if (btnCopyShareUrl) {
      btnCopyShareUrl.addEventListener('click', () => {
        const url = document.getElementById('shareUrlInput').value;
        ShareManager.copyToClipboard(url);
        showToast('Share link copied to clipboard!', 'success');
      });
    }

    if (btnOpenShareNewTab) {
      btnOpenShareNewTab.addEventListener('click', () => {
        const url = document.getElementById('shareUrlInput').value;
        window.open(url, '_blank');
      });
    }

    if (btnCloseShareModal) btnCloseShareModal.addEventListener('click', closeShareModal);

    // Dashboard Buttons
    const btnProcessCodes = document.getElementById('btnProcessResultCodes');
    const btnExportCsv = document.getElementById('btnExportLeaderboardCsv');
    const btnClearLeaderboard = document.getElementById('btnClearLeaderboard');

    if (btnProcessCodes) btnProcessCodes.addEventListener('click', () => LeaderboardManager.processPastedCodes());
    if (btnExportCsv) btnExportCsv.addEventListener('click', () => LeaderboardManager.exportCSV());
    if (btnClearLeaderboard) btnClearLeaderboard.addEventListener('click', () => LeaderboardManager.clearAllEntries());
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

  // Self Boot
  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    switchTab,
    showToast,
    triggerConfetti,
    openShareModal,
    closeShareModal,
    launchQuizPlayer,
    loadQuizIntoBuilder,
    shareQuizDirectly,
    deleteSavedQuiz,
  };
})();

// Attach to window
window.App = App;
