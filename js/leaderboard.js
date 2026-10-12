/**
 * QuizRoom - Leaderboard & Dashboard Manager
 * Manages:
 * 1. Result code batch intake, verification & live leaderboard calculation
 * 2. Visual podium for Top 3 (Gold, Silver, Bronze)
 * 3. CSV Leaderboard export for hosts
 * 4. Local "My Past Attempts" history for students
 */

const LeaderboardManager = (function () {
  let activeQuizId = null;

  // Initialize Leaderboard View
  function initDashboard(quizId = null) {
    // If no quizId specified, use current builder quiz or the first sample
    if (!quizId) {
      const current = QuizEngine.getCurrentQuiz();
      activeQuizId = (current && current.id) ? current.id : StorageManager.SAMPLE_QUIZZES[0].id;
    } else {
      activeQuizId = quizId;
    }

    renderQuizSelector();
    renderLeaderboard();
  }

  // Quiz Selector in Dashboard Header
  function renderQuizSelector() {
    const selectEl = document.getElementById('dashboardQuizSelect');
    if (!selectEl) return;

    selectEl.innerHTML = '';

    // Collect all known quizzes: current builder quiz + samples + saved quizzes
    const quizzesMap = new Map();
    
    const current = QuizEngine.getCurrentQuiz();
    if (current && current.id) quizzesMap.set(current.id, `${current.title} (Current Builder)`);

    StorageManager.SAMPLE_QUIZZES.forEach(sq => {
      quizzesMap.set(sq.id, `${sq.title} (Sample)`);
    });

    StorageManager.getSavedQuizzes().forEach(sq => {
      quizzesMap.set(sq.id, sq.title);
    });

    quizzesMap.forEach((title, id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = title;
      if (id === activeQuizId) opt.selected = true;
      selectEl.appendChild(opt);
    });

    selectEl.onchange = (e) => {
      activeQuizId = e.target.value;
      renderLeaderboard();
    };
  }

  // --- Process Pasted Result Codes ---
  function processPastedCodes() {
    const textarea = document.getElementById('resultCodesInput');
    if (!textarea) return;

    const rawText = textarea.value.trim();
    if (!rawText) {
      App.showToast('Please paste one or more result codes.', 'warning');
      textarea.focus();
      return;
    }

    // Split by newlines or commas
    const lines = rawText.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    const entries = StorageManager.getLeaderboard(activeQuizId);

    lines.forEach(code => {
      const res = ShareManager.parseResultCode(code);
      if (!res.success) {
        errorCount++;
        return;
      }

      const item = res.data;
      // Check if student already exists in this leaderboard
      const existingIdx = entries.findIndex(e => e.name.toLowerCase() === item.name.toLowerCase());
      
      if (existingIdx >= 0) {
        // Update if new score is higher or equal
        if (item.score >= entries[existingIdx].score) {
          entries[existingIdx] = {
            ...item,
            id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            addedAt: Date.now(),
          };
          successCount++;
        } else {
          duplicateCount++;
        }
      } else {
        entries.push({
          ...item,
          id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          addedAt: Date.now(),
        });
        successCount++;
      }
    });

    // Save and re-sort
    StorageManager.saveLeaderboard(activeQuizId, entries);
    textarea.value = '';
    renderLeaderboard();

    // Summary Toast
    if (successCount > 0) {
      App.showToast(`Successfully added ${successCount} student result(s)!`, 'success');
    }
    if (errorCount > 0) {
      App.showToast(`${errorCount} result code(s) were invalid or corrupted.`, 'error');
    }
    if (duplicateCount > 0 && successCount === 0) {
      App.showToast('Student results already recorded with equal or higher scores.', 'info');
    }
  }

  // --- Render Leaderboard Table & Top 3 Podium ---
  function renderLeaderboard() {
    const entries = StorageManager.getLeaderboard(activeQuizId);

    // Sorting rule:
    // 1. Primary: Score DESC (highest score first)
    // 2. Secondary: Time Taken ASC (faster time wins tie)
    entries.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

    renderPodium(entries.slice(0, 3));
    renderTable(entries);
  }

  function renderPodium(top3) {
    const podiumContainer = document.getElementById('podiumContainer');
    if (!podiumContainer) return;

    if (top3.length === 0) {
      podiumContainer.innerHTML = `
        <div style="text-align:center; padding: 2rem; color:var(--text-muted); width:100%;">
          <div style="font-size:2.5rem; margin-bottom:0.5rem;">🏆</div>
          <p>No results submitted yet. Students can take the quiz and send their result codes!</p>
        </div>
      `;
      return;
    }

    // Positions for podium visual layout: [Silver (2nd), Gold (1st), Bronze (3rd)]
    const podiumSlots = [
      { rank: 2, item: top3[1], className: 'rank-2', emoji: '🥈' },
      { rank: 1, item: top3[0], className: 'rank-1', emoji: '👑' },
      { rank: 3, item: top3[2], className: 'rank-3', emoji: '🥉' },
    ];

    let html = '';
    podiumSlots.forEach(slot => {
      if (!slot.item) {
        // Empty placeholder step
        html += `
          <div class="podium-step ${slot.className}" style="opacity: 0.35;">
            <div class="podium-avatar">${slot.emoji}</div>
            <div class="podium-name">—</div>
            <div class="podium-score">0 pts</div>
            <div class="podium-block">#${slot.rank}</div>
          </div>
        `;
      } else {
        html += `
          <div class="podium-step ${slot.className}">
            <div class="podium-avatar">${slot.emoji}</div>
            <div class="podium-name" title="${escapeHtml(slot.item.name)}">${escapeHtml(slot.item.name)}</div>
            <div class="podium-score">${slot.item.score} pts (${slot.item.percentage}%)</div>
            <div class="podium-block">#${slot.rank}</div>
          </div>
        `;
      }
    });

    podiumContainer.innerHTML = html;
  }

  function renderTable(entries) {
    const tbody = document.getElementById('leaderboardTableBody');
    const countBadge = document.getElementById('leaderboardCountBadge');
    if (countBadge) countBadge.textContent = `${entries.length} participants`;
    if (!tbody) return;

    if (entries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 2rem; color:var(--text-muted);">
            No records found. Paste student result codes on the left to populate the leaderboard.
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    entries.forEach((item, index) => {
      const rank = index + 1;
      let rankClass = 'rank-other';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';

      const passBadge = item.passed
        ? '<span class="badge badge-success">Passed</span>'
        : '<span class="badge badge-warning">Failed</span>';

      const timeFmt = formatTime(item.timeTakenSeconds);
      const dateStr = item.addedAt ? new Date(item.addedAt).toLocaleDateString() : 'Today';

      rowsHtml += `
        <tr>
          <td><span class="rank-badge ${rankClass}">#${rank}</span></td>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td><span style="font-weight:700; color:var(--accent-primary);">${item.score}</span> / ${item.maxScore}</td>
          <td>${item.percentage}% ${passBadge}</td>
          <td>⏱️ ${timeFmt}</td>
          <td>
            <button type="button" class="btn-tool delete" onclick="LeaderboardManager.deleteEntry('${item.id}')" title="Remove Entry">🗑️</button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  function deleteEntry(entryId) {
    const entries = StorageManager.getLeaderboard(activeQuizId);
    const filtered = entries.filter(e => e.id !== entryId);
    StorageManager.saveLeaderboard(activeQuizId, filtered);
    renderLeaderboard();
    App.showToast('Leaderboard entry removed.', 'info');
  }

  function clearAllEntries() {
    if (confirm('Are you sure you want to clear the entire leaderboard for this quiz? This action cannot be undone.')) {
      StorageManager.clearLeaderboard(activeQuizId);
      renderLeaderboard();
      App.showToast('Leaderboard cleared.', 'info');
    }
  }

  // --- Export Leaderboard to CSV ---
  function exportCSV() {
    const entries = StorageManager.getLeaderboard(activeQuizId);
    if (entries.length === 0) {
      App.showToast('No entries to export.', 'warning');
      return;
    }

    // Sort entries before export
    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

    const headers = ['Rank', 'Student Name', 'Score', 'Max Score', 'Percentage', 'Status', 'Time Taken (s)', 'Time Formatted', 'Correct Answers', 'Total Questions', 'Submitted Date'];
    const rows = entries.map((e, idx) => [
      idx + 1,
      `"${(e.name || '').replace(/"/g, '""')}"`,
      e.score,
      e.maxScore,
      `${e.percentage}%`,
      e.passed ? 'PASSED' : 'FAILED',
      e.timeTakenSeconds,
      formatTime(e.timeTakenSeconds),
      e.correctCount || 0,
      e.totalQuestions || 0,
      new Date(e.addedAt || Date.now()).toISOString().split('T')[0],
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `quizroom-leaderboard-${activeQuizId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    App.showToast('Leaderboard CSV exported successfully!', 'success');
  }

  // --- Student "My Past Attempts" View ---
  function renderMyAttempts() {
    const container = document.getElementById('myAttemptsContainer');
    if (!container) return;

    const attempts = StorageManager.getMyAttempts();
    if (attempts.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
          <div style="font-size:3rem; margin-bottom:0.75rem;">📋</div>
          <h3>No past attempts recorded</h3>
          <p style="margin-top:0.4rem;">When you complete a quiz as a student, your scores and records will appear here.</p>
        </div>
      `;
      return;
    }

    let html = '<div class="attempts-grid" style="display:flex; flex-direction:column; gap:0.85rem;">';
    attempts.forEach(att => {
      const passBadge = att.passed
        ? '<span class="badge badge-success">Passed</span>'
        : '<span class="badge badge-warning">Needs Practice</span>';

      html += `
        <div class="card" style="margin-bottom:0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
          <div>
            <h4 style="font-size:1.1rem; margin-bottom:0.25rem;">${escapeHtml(att.quizTitle || 'Quiz')}</h4>
            <div style="font-size:0.8rem; color:var(--text-muted); display:flex; gap:1rem; align-items:center;">
              <span>📅 ${att.date || 'Recent'}</span>
              <span>⏱️ ${formatTime(att.timeTakenSeconds || 0)}</span>
              <span>🎯 ${att.correctCount || 0} / ${att.totalQuestions || 0} correct</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:1rem;">
            <div style="text-align:right;">
              <div style="font-size:1.25rem; font-weight:800; color:var(--accent-primary);">${att.score} pts</div>
              <div style="font-size:0.8rem;">${att.percentage}% ${passBadge}</div>
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  // Helpers
  function formatTime(totalSecs) {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
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

  return {
    initDashboard,
    processPastedCodes,
    renderLeaderboard,
    deleteEntry,
    clearAllEntries,
    exportCSV,
    renderMyAttempts,
  };
})();

// Attach to window
window.LeaderboardManager = LeaderboardManager;
