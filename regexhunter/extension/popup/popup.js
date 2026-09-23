// Enhanced Popup Cockpit for Regex Hunter

const CURATED_PRESETS = [
  {
    tag: "netflix-api",
    pattern: "https?:\\/\\/([a-z0-9-]{1,}[\\.])*api\\.([a-z0-9-]{1,}[\\.])*netflix\\.[a-z.]+(\\/[^\\s\"'<>]+)?",
    flags: "gi",
    description: "Netflix production and staging API endpoints"
  },

  {
    tag: "aws-access-keys",
    pattern: "\\b(AKIA|ASIA)[0-9A-Z]{16}\\b",
    flags: "g",
    description: "AWS IAM & STS 20-character Access Key IDs"
  },
  {
    tag: "aws-s3-buckets",
    pattern: "[a-z0-9.-]+\\.s3([.-][a-z0-9-]+)?\\.amazonaws\\.com",
    flags: "gi",
    description: "Amazon S3 bucket subdomains and endpoints"
  },
  {
    tag: "github-pat",
    pattern: "\\bghp_[0-9a-zA-Z]{36}\\b",
    flags: "g",
    description: "GitHub Personal Access Tokens (Classic)"
  },
  {
    tag: "slack-webhook",
    pattern: "https:\\/\\/hooks\\.slack\\.com\\/services\\/T[a-zA-Z0-9_]+\\/B[a-zA-Z0-9_]+\\/[a-zA-Z0-9_]+",
    flags: "g",
    description: "Slack Incoming Webhook URLs"
  },
  {
    tag: "jwt-token",
    pattern: "ey[A-Za-z0-9-_=]+\\.ey[A-Za-z0-9-_=]+\\.?[A-Za-z0-9-_.+/=]*",
    flags: "g",
    description: "JSON Web Tokens (JWT) in cookies, headers, or JS variables"
  },
  {
    tag: "internal-ipv4",
    pattern: "\\b(?:10|127|172\\.(?:1[6-9]|2[0-9]|3[01])|192\\.168)\\.[0-9]{1,3}\\.[0-9]{1,3}\\b",
    flags: "g",
    description: "RFC 1918 Private and loopback IPv4 addresses"
  },
  {
    tag: "graphql-endpoints",
    pattern: "https?:\\/\\/[a-zA-Z0-9.-]+\\/[a-zA-Z0-9_.-]*graphql",
    flags: "gi",
    description: "GraphQL API discovery endpoints"
  }
];

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const serverBadge = document.getElementById('serverBadge');
  const serverDot = document.getElementById('serverDot');
  const serverText = document.getElementById('serverText');
  const currentState = document.getElementById('currentState');

  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');

  const activeRulesCount = document.getElementById('activeRulesCount');
  const sessionMatchesCount = document.getElementById('sessionMatchesCount');
  const totalMatchesCount = document.getElementById('totalMatchesCount');
  const liveStreamBadge = document.getElementById('liveStreamBadge');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Rules Tab
  const rulesList = document.getElementById('rulesList');
  const searchRulesInput = document.getElementById('searchRulesInput');
  const btnAddRule = document.getElementById('btnAddRule');
  const btnPresets = document.getElementById('btnPresets');
  const btnSettings = document.getElementById('btnSettings');
  const btnExportRules = document.getElementById('btnExportRules');
  const btnImportRules = document.getElementById('btnImportRules');
  const importFileInput = document.getElementById('importFileInput');

  // Live Stream Tab
  const liveStreamList = document.getElementById('liveStreamList');
  const btnClearLiveMatches = document.getElementById('btnClearLiveMatches');

  // Tester Tab
  const testerRegex = document.getElementById('testerRegex');
  const testerInput = document.getElementById('testerInput');
  const testerMatchCount = document.getElementById('testerMatchCount');
  const testerPreview = document.getElementById('testerPreview');

  // Rule Modal elements
  const ruleModal = document.getElementById('ruleModal');
  const btnCloseRuleModal = document.getElementById('btnCloseRuleModal');
  const btnCancelRule = document.getElementById('btnCancelRule');
  const ruleForm = document.getElementById('ruleForm');
  const modalTitle = document.getElementById('modalTitle');
  const ruleId = document.getElementById('ruleId');
  const ruleTag = document.getElementById('ruleTag');
  const rulePattern = document.getElementById('rulePattern');
  const ruleDesc = document.getElementById('ruleDesc');
  const ruleCaseInsensitive = document.getElementById('ruleCaseInsensitive');
  const regexError = document.getElementById('regexError');

  // Presets Modal elements
  const presetsModal = document.getElementById('presetsModal');
  const btnClosePresetsModal = document.getElementById('btnClosePresetsModal');
  const btnCancelPresets = document.getElementById('btnCancelPresets');
  const presetsList = document.getElementById('presetsList');
  const btnApplyPresets = document.getElementById('btnApplyPresets');

  // Settings Modal elements
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
  const settingsForm = document.getElementById('settingsForm');
  const serverUrl = document.getElementById('serverUrl');
  const serverToken = document.getElementById('serverToken');
  const btnTestConn = document.getElementById('btnTestConn');
  const testConnResult = document.getElementById('testConnResult');

  // State
  let appState = {
    status: 'STOPPED',
    rules: [],
    config: {
      server_url: 'http://127.0.0.1:8787',
      token: ''
    },
    session_matches: 0,
    server_online: false,
    server_total_unique: 0,
    recent_matches: []
  };

  // Local live matches stream buffer
  let liveMatchesBuffer = [];

  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.getAttribute('data-tab'));
      if (target) target.classList.add('active');

      if (btn.getAttribute('data-tab') === 'tabLive') {
        fetchRecentServerMatches();
      }
    });
  });

  // Initial load
  await refreshState();
  fetchRecentServerMatches();

  // Control Buttons
  btnStart.addEventListener('click', () => changeStatus('RUNNING'));
  btnPause.addEventListener('click', () => changeStatus('PAUSED'));
  btnStop.addEventListener('click', () => changeStatus('STOPPED'));

  // Modals & Navigation
  btnAddRule.addEventListener('click', () => openRuleModal());
  btnCloseRuleModal.addEventListener('click', closeRuleModal);
  btnCancelRule.addEventListener('click', closeRuleModal);

  btnPresets.addEventListener('click', openPresetsModal);
  btnClosePresetsModal.addEventListener('click', closePresetsModal);
  btnCancelPresets.addEventListener('click', closePresetsModal);
  btnApplyPresets.addEventListener('click', applySelectedPresets);

  btnSettings.addEventListener('click', openSettingsModal);
  serverBadge.addEventListener('click', openSettingsModal);
  btnCloseSettingsModal.addEventListener('click', closeSettingsModal);

  // Search filter for rules
  searchRulesInput.addEventListener('input', () => {
    renderRules();
  });

  // Pattern input real-time validation
  rulePattern.addEventListener('input', validateRegexPattern);

  // Save Rule
  ruleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateRegexPattern()) return;

    const id = ruleId.value || 'rule_' + Math.random().toString(36).substr(2, 9);
    const tag = ruleTag.value.trim();
    const pattern = rulePattern.value.trim();
    const flags = ruleCaseInsensitive.checked ? 'gi' : 'g';
    const description = ruleDesc.value.trim();

    const existingIndex = appState.rules.findIndex(r => r.id === id);
    const ruleObj = {
      id,
      tag,
      pattern,
      flags,
      enabled: existingIndex !== -1 ? appState.rules[existingIndex].enabled : true,
      description,
      created_at: existingIndex !== -1 ? appState.rules[existingIndex].created_at : new Date().toISOString()
    };

    if (existingIndex !== -1) {
      appState.rules[existingIndex] = ruleObj;
    } else {
      appState.rules.push(ruleObj);
    }

    await syncRulesWithBackground();
    closeRuleModal();
    await refreshState();
  });


  // Export / Import Rules
  btnExportRules.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState.rules, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `regexhunter_rules_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  });

  btnImportRules.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          // Merge imported rules avoiding duplicate tags
          for (const imp of imported) {
            if (imp.tag && imp.pattern) {
              const exists = appState.rules.some(r => r.tag === imp.tag);
              if (!exists) {
                appState.rules.push({
                  id: imp.id || 'rule_' + Math.random().toString(36).substr(2, 9),
                  tag: imp.tag,
                  pattern: imp.pattern,
                  flags: imp.flags || 'gi',
                  enabled: imp.enabled !== false,
                  description: imp.description || '',
                  created_at: imp.created_at || new Date().toISOString()
                });
              }
            }
          }
          await syncRulesWithBackground();
          await refreshState();
          alert(`Imported rules successfully!`);
        }
      } catch (err) {
        alert("Failed to parse JSON rules file.");
      }
    };
    reader.readAsText(file);
  });


  // Live Stream: Clear
  btnClearLiveMatches.addEventListener('click', () => {
    liveMatchesBuffer = [];
    renderLiveStream();
  });

  // Tester Playground
  testerRegex.addEventListener('input', runTester);
  testerInput.addEventListener('input', runTester);

  function runTester() {
    const pattern = testerRegex.value.trim();
    const text = testerInput.value;

    if (!pattern || !text) {
      testerMatchCount.textContent = '0';
      testerPreview.innerHTML = '<em>Match results will be listed here...</em>';
      return;
    }

    try {
      const reg = new RegExp(pattern, 'gi');
      const matches = [];
      let m;
      let count = 0;
      while ((m = reg.exec(text)) !== null && count < 100) {
        count++;
        matches.push(m[0]);
        if (m.index === reg.lastIndex) reg.lastIndex++;
      }

      testerMatchCount.textContent = matches.length.toString();
      if (matches.length === 0) {
        testerPreview.innerHTML = '<span style="color: var(--text-muted);">No matches found in sample text.</span>';
      } else {
        testerPreview.innerHTML = matches.map((matchStr, idx) => `
          <div style="margin-bottom: 4px; padding: 2px 4px; background: rgba(56, 189, 248, 0.1); border-left: 2px solid var(--accent-cyan); border-radius: 2px;">
            <strong>#${idx + 1}:</strong> ${escapeHtml(matchStr)}
          </div>
        `).join('');
      }
    } catch (err) {
      testerMatchCount.textContent = 'Error';
      testerPreview.innerHTML = `<span style="color: var(--accent-red);">${escapeHtml(err.message)}</span>`;
    }
  }

  // Save Settings
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    appState.config.server_url = serverUrl.value.trim().replace(/\/+$/, '');
    appState.config.token = serverToken.value.trim();

    await syncConfigWithBackground();
    closeSettingsModal();
    await refreshState();
  });


  // Test Server Connection
  btnTestConn.addEventListener('click', async () => {
    testConnResult.className = 'test-result';
    testConnResult.textContent = 'Testing connection...';
    testConnResult.classList.remove('hidden');

    const url = serverUrl.value.trim().replace(/\/+$/, '') + '/api/health';
    const token = serverToken.value.trim();

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (resp.ok) {
        const data = await resp.json();
        testConnResult.className = 'test-result success';
        testConnResult.textContent = `Connected! Daemon active. Total matches: ${data.total_unique_matches}`;
      } else if (resp.status === 401) {
        testConnResult.className = 'test-result error';
        testConnResult.textContent = 'Auth Failed (401): Check Bearer token!';
      } else {
        testConnResult.className = 'test-result error';
        testConnResult.textContent = `Server error: HTTP ${resp.status}`;
      }
    } catch (err) {
      testConnResult.className = 'test-result error';
      testConnResult.textContent = `Connection refused: Is 'regexhunter' running locally?`;
    }
  });

  // Fetch recent server matches for Live Stream tab
  async function fetchRecentServerMatches() {
    if (!appState.config.server_url || !appState.config.token) return;
    try {
      const url = `${appState.config.server_url.replace(/\/+$/, '')}/api/recent?limit=40`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${appState.config.token}`
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.recent_matches && data.recent_matches.length > 0) {
          liveMatchesBuffer = data.recent_matches;
          renderLiveStream();
        }
      }
    } catch (e) {
      // Server offline or network issue
    }
  }

  async function syncRulesWithBackground() {
    if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        await chrome.runtime.sendMessage({ type: 'SAVE_RULES', rules: appState.rules });
      } catch (e) {}
    }
  }

  async function syncConfigWithBackground() {
    if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        await chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', config: appState.config });
      } catch (e) {}
    }
  }

  // Helpers
  async function refreshState() {
    if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
        if (response) {
          appState = response;
          renderUI();
          return;
        }
      } catch (err) {
        // Fallback below
      }
    }

    // Standalone / Test fallback
    if (appState.rules.length === 0) {
      appState.rules = CURATED_PRESETS.slice(0, 3).map((p, idx) => ({
        id: 'rule_' + idx,
        tag: p.tag,
        pattern: p.pattern,
        flags: p.flags,
        enabled: true,
        description: p.description,
        created_at: new Date().toISOString()
      }));
    }
    renderUI();
  }

  async function changeStatus(newStatus) {
    if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'SET_STATUS', status: newStatus });
        if (response) {
          appState.status = response.status;
          renderUI();
          return;
        }
      } catch (err) {
        // Fallback below
      }
    }
    appState.status = newStatus;
    renderUI();
  }


  function renderUI() {
    // Status Indicator
    currentState.textContent = appState.status;
    currentState.className = `current-state state-${appState.status.toLowerCase()}`;

    // Server Badge
    if (appState.server_online || (appState.server_alive && appState.server_authenticated)) {
      serverDot.className = 'status-dot connected';
      serverText.textContent = 'Connected';
    } else if (appState.server_alive && !appState.server_authenticated) {
      serverDot.className = 'status-dot warning';
      serverText.textContent = 'Auth Required';
    } else {
      serverDot.className = 'status-dot disconnected';
      serverText.textContent = 'Offline';
    }


    // Counters
    const activeRules = appState.rules.filter(r => r.enabled).length;
    activeRulesCount.textContent = activeRules;
    sessionMatchesCount.textContent = appState.session_matches || 0;
    totalMatchesCount.textContent = appState.server_total_unique || 0;
    liveStreamBadge.textContent = appState.session_matches || 0;

    renderRules();
    renderLiveStream();
  }

  function renderRules() {
    const filterQuery = (searchRulesInput.value || '').trim().toLowerCase();
    const filteredRules = appState.rules.filter(r => {
      if (!filterQuery) return true;
      return r.tag.toLowerCase().includes(filterQuery) ||
             r.pattern.toLowerCase().includes(filterQuery) ||
             (r.description && r.description.toLowerCase().includes(filterQuery));
    });

    rulesList.innerHTML = '';
    if (filteredRules.length === 0) {
      rulesList.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted);">
          ${filterQuery ? 'No matching regex rules found.' : 'No regex rules configured.<br>Click "+ Add" or "⚡ Presets" to start!'}
        </div>
      `;
      return;
    }

    filteredRules.forEach(rule => {
      const item = document.createElement('div');
      item.className = `rule-item ${rule.enabled ? '' : 'disabled'}`;
      item.innerHTML = `
        <div class="rule-header">
          <div class="rule-toggle-wrap">
            <label class="switch">
              <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <span class="rule-tag">${escapeHtml(rule.tag)}</span>
          </div>
          <div class="rule-actions">
            <button class="btn-mini test-btn" data-id="${rule.id}" title="Send to Tester">🧪</button>
            <button class="btn-mini edit" data-id="${rule.id}" title="Edit">✎</button>
            <button class="btn-mini delete" data-id="${rule.id}" title="Delete">🗑</button>
          </div>
        </div>
        <div class="rule-pattern">${escapeHtml(rule.pattern)}</div>
        ${rule.description ? `<div class="rule-desc">${escapeHtml(rule.description)}</div>` : ''}
      `;

      // Switch toggle
      item.querySelector('.rule-toggle').addEventListener('change', async (e) => {
        const id = e.target.getAttribute('data-id');
        const targetRule = appState.rules.find(r => r.id === id);
        if (targetRule) {
          targetRule.enabled = e.target.checked;
          await syncRulesWithBackground();
          await refreshState();
        }
      });

      // Send to tester
      item.querySelector('.btn-mini.test-btn').addEventListener('click', () => {
        testerRegex.value = rule.pattern;
        document.querySelector('.tab-btn[data-tab="tabTester"]').click();
        runTester();
      });

      // Edit
      item.querySelector('.btn-mini.edit').addEventListener('click', () => {
        openRuleModal(rule);
      });

      // Delete
      item.querySelector('.btn-mini.delete').addEventListener('click', async () => {
        if (confirm(`Delete regex rule '${rule.tag}'?`)) {
          appState.rules = appState.rules.filter(r => r.id !== rule.id);
          await syncRulesWithBackground();
          await refreshState();
        }
      });


      rulesList.appendChild(item);
    });
  }

  function renderLiveStream() {
    if (liveMatchesBuffer.length === 0) {
      liveStreamList.innerHTML = `
        <div class="empty-state">No matches captured in this session yet.<br>Click START and browse normal targets.</div>
      `;
      return;
    }

    liveStreamList.innerHTML = '';
    liveMatchesBuffer.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = `live-card ${item.is_new ? 'new' : ''}`;
      card.innerHTML = `
        <div class="live-card-header">
          <span class="live-tag">[${escapeHtml(item.tag)}]</span>
          <span class="live-domain">${escapeHtml(item.domain || 'web')}</span>
        </div>
        <div class="live-match-text">
          <span>${escapeHtml(item.match)}</span>
          <button class="btn-copy" data-match="${escapeHtml(item.match)}" title="Copy string">Copy</button>
        </div>
      `;

      card.querySelector('.btn-copy').addEventListener('click', (e) => {
        const text = e.target.getAttribute('data-match');
        navigator.clipboard.writeText(text);
        e.target.textContent = 'Copied!';
        setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
      });

      liveStreamList.appendChild(card);
    });
  }

  function validateRegexPattern() {
    const pattern = rulePattern.value.trim();
    if (!pattern) {
      regexError.textContent = '';
      regexError.classList.add('hidden');
      return false;
    }

    try {
      new RegExp(pattern);
      regexError.textContent = '';
      regexError.classList.add('hidden');
      return true;
    } catch (err) {
      regexError.textContent = `Regex Error: ${err.message}`;
      regexError.classList.remove('hidden');
      return false;
    }
  }

  function openRuleModal(rule = null) {
    ruleForm.reset();
    regexError.classList.add('hidden');

    if (rule) {
      modalTitle.textContent = 'Edit Regex Rule';
      ruleId.value = rule.id;
      ruleTag.value = rule.tag;
      rulePattern.value = rule.pattern;
      ruleDesc.value = rule.description || '';
      ruleCaseInsensitive.checked = (rule.flags || '').includes('i');
    } else {
      modalTitle.textContent = 'Add New Regex';
      ruleId.value = '';
      ruleCaseInsensitive.checked = true;
    }

    ruleModal.classList.remove('hidden');
    ruleTag.focus();
  }

  function closeRuleModal() {
    ruleModal.classList.add('hidden');
  }

  function openPresetsModal() {
    presetsList.innerHTML = '';
    CURATED_PRESETS.forEach((preset, idx) => {
      const isAlreadyAdded = appState.rules.some(r => r.tag === preset.tag);
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.innerHTML = `
        <input type="checkbox" class="preset-checkbox" id="preset_${idx}" data-index="${idx}" ${isAlreadyAdded ? 'disabled' : 'checked'}>
        <div class="preset-info">
          <label for="preset_${idx}" style="cursor: pointer;">
            <h4>${escapeHtml(preset.tag)} ${isAlreadyAdded ? '<small style="color:var(--text-muted);">(Already Added)</small>' : ''}</h4>
            <p>${escapeHtml(preset.description)}</p>
            <code>${escapeHtml(preset.pattern)}</code>
          </label>
        </div>
      `;
      presetsList.appendChild(card);
    });
    presetsModal.classList.remove('hidden');
  }

  function closePresetsModal() {
    presetsModal.classList.add('hidden');
  }

  async function applySelectedPresets() {
    const checkboxes = presetsList.querySelectorAll('.preset-checkbox:checked:not(:disabled)');
    let addedCount = 0;
    checkboxes.forEach(cb => {
      const idx = parseInt(cb.getAttribute('data-index'), 10);
      const preset = CURATED_PRESETS[idx];
      appState.rules.push({
        id: 'rule_' + Math.random().toString(36).substr(2, 9),
        tag: preset.tag,
        pattern: preset.pattern,
        flags: preset.flags,
        enabled: true,
        description: preset.description,
        created_at: new Date().toISOString()
      });
      addedCount++;
    });

    if (addedCount > 0) {
      await syncRulesWithBackground();
      await refreshState();
    }
    closePresetsModal();

  }

  function openSettingsModal() {
    serverUrl.value = appState.config.server_url || 'http://127.0.0.1:8787';
    serverToken.value = appState.config.token || '';
    testConnResult.classList.add('hidden');
    settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    settingsModal.classList.add('hidden');
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }
});
