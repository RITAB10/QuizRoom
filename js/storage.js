/**
 * QuizRoom - Storage Manager
 * Handles local storage for drafts, saved quizzes, leaderboards, and session storage for active quiz state.
 * Also manages JSON import/export and built-in sample quizzes.
 */

const StorageManager = (function () {
  // Storage keys used across the application
  const KEYS = {
    THEME: 'quizroom_theme',
    HOST_DRAFT: 'quizroom_host_draft',
    SAVED_QUIZZES: 'quizroom_saved_quizzes',
    MY_ATTEMPTS: 'quizroom_my_attempts',
    LEADERBOARDS: 'quizroom_leaderboards',
    ACTIVE_SESSION: 'quizroom_active_session',
  };

  // Safe wrapper for localStorage access (handles private browsing / blocked cookies)
  function safeGet(key, fallback = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (err) {
      console.warn(`Error reading key "${key}" from localStorage:`, err);
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`Error saving key "${key}" to localStorage:`, err);
      return false;
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      console.error(`Error removing key "${key}" from localStorage:`, err);
      return false;
    }
  }

  // --- Host Draft Methods ---
  function getDraft() {
    return safeGet(KEYS.HOST_DRAFT, null);
  }

  function saveDraft(quizData) {
    if (!quizData) return;
    quizData.lastSaved = Date.now();
    return safeSet(KEYS.HOST_DRAFT, quizData);
  }

  function clearDraft() {
    return safeRemove(KEYS.HOST_DRAFT);
  }

  // --- Saved Quizzes (Library) ---
  function getSavedQuizzes() {
    return safeGet(KEYS.SAVED_QUIZZES, []);
  }

  function saveQuiz(quizData) {
    if (!quizData || !quizData.id) return false;
    const list = getSavedQuizzes();
    const existingIndex = list.findIndex(q => q.id === quizData.id);
    if (existingIndex >= 0) {
      list[existingIndex] = { ...quizData, updatedAt: Date.now() };
    } else {
      list.unshift({ ...quizData, createdAt: Date.now(), updatedAt: Date.now() });
    }
    return safeSet(KEYS.SAVED_QUIZZES, list);
  }

  function deleteSavedQuiz(quizId) {
    const list = getSavedQuizzes().filter(q => q.id !== quizId);
    return safeSet(KEYS.SAVED_QUIZZES, list);
  }

  // --- Student Attempts History ---
  function getMyAttempts() {
    return safeGet(KEYS.MY_ATTEMPTS, []);
  }

  function saveMyAttempt(attemptData) {
    if (!attemptData) return false;
    const list = getMyAttempts();
    list.unshift({ ...attemptData, id: 'att_' + Date.now(), savedAt: Date.now() });
    // Keep max 50 recent attempts
    if (list.length > 50) list.pop();
    return safeSet(KEYS.MY_ATTEMPTS, list);
  }

  // --- Host Leaderboard Storage ---
  function getAllLeaderboards() {
    return safeGet(KEYS.LEADERBOARDS, {});
  }

  function getLeaderboard(quizId) {
    if (!quizId) return [];
    const boards = getAllLeaderboards();
    return boards[quizId] || [];
  }

  function saveLeaderboard(quizId, entries) {
    if (!quizId) return false;
    const boards = getAllLeaderboards();
    boards[quizId] = entries;
    return safeSet(KEYS.LEADERBOARDS, boards);
  }

  function clearLeaderboard(quizId) {
    if (!quizId) return false;
    const boards = getAllLeaderboards();
    delete boards[quizId];
    return safeSet(KEYS.LEADERBOARDS, boards);
  }

  // --- Active Quiz Session (SessionStorage for reload recovery) ---
  function getActiveSession() {
    try {
      const data = sessionStorage.getItem(KEYS.ACTIVE_SESSION);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn('Error reading active quiz session:', err);
      return null;
    }
  }

  function saveActiveSession(sessionData) {
    try {
      sessionStorage.setItem(KEYS.ACTIVE_SESSION, JSON.stringify(sessionData));
      return true;
    } catch (err) {
      console.warn('Error saving active quiz session:', err);
      return false;
    }
  }

  function clearActiveSession() {
    try {
      sessionStorage.removeItem(KEYS.ACTIVE_SESSION);
      return true;
    } catch (err) {
      return false;
    }
  }

  // --- Theme Preference ---
  function getTheme() {
    try {
      return localStorage.getItem(KEYS.THEME) || 'dark';
    } catch (err) {
      return 'dark';
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(KEYS.THEME, theme);
    } catch (err) {}
  }

  // --- JSON File Export & Import ---
  function exportQuizJSON(quizData) {
    if (!quizData) return;
    const cleanTitle = (quizData.title || 'quiz').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `quizroom-${cleanTitle}.json`;
    const jsonStr = JSON.stringify(quizData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importQuizJSON(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        return reject(new Error('No file selected'));
      }
      const reader = new FileReader();
      reader.onload = event => {
        try {
          let quizObj = parsed;
          if (Array.isArray(parsed) && parsed.length > 0) {
            quizObj = parsed[0];
          }
          // Basic structural validation
          if (!quizObj.title || !Array.isArray(quizObj.questions)) {
            throw new Error('Invalid QuizRoom format. Quiz must contain title and questions array.');
          }
          resolve(quizObj);
        } catch (err) {
          reject(new Error('Failed to parse JSON file: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file from disk.'));
      reader.readAsText(file);
    });
  }

  // --- Two Sample Quizzes (Ready to run instantly) ---
  const SAMPLE_QUIZZES = [
    {
      id: 'quiz_sample_webdev_101',
      title: 'Web Development Essentials',
      description: 'Test your foundational knowledge of HTML5, modern CSS3 styling, JavaScript core concepts, and web protocols.',
      settings: {
        overallTimerMinutes: 0,
        defaultQuestionTime: 25,
        shuffleQuestions: false,
        shuffleOptions: false,
        showCorrectAnswers: true,
        passingScore: 70,
      },
      questions: [
        {
          id: 'q1',
          type: 'mcq',
          text: 'What does CSS stand for in web development?',
          options: [
            'Computer Style Sheets',
            'Cascading Style Sheets',
            'Creative Styling Syntax',
            'Colorful Screen Styles',
          ],
          correctIndex: 1,
          timeLimit: 20,
          points: 100,
          explanation: 'CSS stands for Cascading Style Sheets. The "Cascading" refers to the specific order and specificity rules governing which styles apply.',
        },
        {
          id: 'q2',
          type: 'mcq',
          text: 'Which HTML5 element represents the primary navigation links of a document?',
          options: ['<header>', '<navigate>', '<nav>', '<menu>'],
          correctIndex: 2,
          timeLimit: 20,
          points: 100,
          explanation: 'The <nav> element is semantic HTML5 designed specifically for major navigation blocks such as menus and tables of contents.',
        },
        {
          id: 'q3',
          type: 'tf',
          text: 'In JavaScript, "typeof null" evaluates to "object".',
          options: ['True', 'False'],
          correctIndex: 0,
          timeLimit: 15,
          points: 100,
          explanation: 'True! This is a well-known historical bug in JavaScript from its first implementation in 1995 that is preserved for backwards compatibility.',
        },
        {
          id: 'q4',
          type: 'mcq',
          text: 'What HTTP status code represents "404"?',
          options: ['Unauthorized', 'Internal Server Error', 'Not Found', 'Bad Request'],
          correctIndex: 2,
          timeLimit: 20,
          points: 100,
          explanation: 'HTTP 404 indicates that the server cannot find the requested resource or URL.',
        },
        {
          id: 'q5',
          type: 'tf',
          text: 'CSS Flexbox is designed primarily for two-dimensional grid layouts with rows and columns.',
          options: ['True', 'False'],
          correctIndex: 1,
          timeLimit: 15,
          points: 100,
          explanation: 'False! Flexbox is primarily one-dimensional (either row OR column). CSS Grid is the layout module designed specifically for 2D layouts.',
        },
      ],
      createdAt: Date.now() - 3600000,
    },
    {
      id: 'quiz_sample_space_202',
      title: 'Cosmic Science & Planetary Wonders',
      description: 'Journey through the cosmos with questions covering our solar system, physics, stars, and space exploration.',
      settings: {
        overallTimerMinutes: 0,
        defaultQuestionTime: 25,
        shuffleQuestions: false,
        shuffleOptions: false,
        showCorrectAnswers: true,
        passingScore: 60,
      },
      questions: [
        {
          id: 'sq1',
          type: 'mcq',
          text: 'Which planet in our solar system has the highest number of confirmed moons?',
          options: ['Jupiter', 'Saturn', 'Neptune', 'Uranus'],
          correctIndex: 1,
          timeLimit: 20,
          points: 100,
          explanation: 'Saturn leads the solar system with 146 recognized moons (surpassing Jupiter as of recent astronomical observations).',
        },
        {
          id: 'sq2',
          type: 'mcq',
          text: 'Approximately how long does light from the Sun take to reach Earth?',
          options: ['8 seconds', '8 minutes and 20 seconds', '1 hour', 'Instantaneous'],
          correctIndex: 1,
          timeLimit: 20,
          points: 100,
          explanation: 'Traveling at roughly 300,000 km/s over an average distance of 150 million km, sunlight takes about 8 minutes and 20 seconds (500 seconds).',
        },
        {
          id: 'sq3',
          type: 'tf',
          text: 'Sound travels faster through a vacuum in outer space than through Earth’s atmosphere.',
          options: ['True', 'False'],
          correctIndex: 1,
          timeLimit: 15,
          points: 100,
          explanation: 'False! Sound requires a physical medium (molecules) to vibrate and travel. In the vacuum of space, sound cannot travel at all.',
        },
        {
          id: 'sq4',
          type: 'mcq',
          text: 'What is the chemical symbol for Gold on the periodic table?',
          options: ['Ag', 'Au', 'Gd', 'Fe'],
          correctIndex: 1,
          timeLimit: 15,
          points: 100,
          explanation: 'Au comes from the Latin word for gold, "aurum", which means "shining dawn".',
        },
        {
          id: 'sq5',
          type: 'tf',
          text: 'The Apollo 11 moon landing occurred in the year 1969.',
          options: ['True', 'False'],
          correctIndex: 0,
          timeLimit: 15,
          points: 100,
          explanation: 'True! Astronauts Neil Armstrong and Buzz Aldrin stepped onto the lunar surface on July 20, 1969.',
        },
      ],
      createdAt: Date.now() - 7200000,
    },
  ];

  return {
    getDraft,
    saveDraft,
    clearDraft,
    getSavedQuizzes,
    saveQuiz,
    deleteSavedQuiz,
    getMyAttempts,
    saveMyAttempt,
    getLeaderboard,
    saveLeaderboard,
    clearLeaderboard,
    getActiveSession,
    saveActiveSession,
    clearActiveSession,
    getTheme,
    saveTheme,
    exportQuizJSON,
    importQuizJSON,
    SAMPLE_QUIZZES,
  };
})();

// Attach to window for global access
window.StorageManager = StorageManager;
