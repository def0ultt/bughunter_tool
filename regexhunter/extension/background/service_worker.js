// Background Service Worker for Regex Hunter (Manifest V3)

const DEFAULT_RULES = [
  {
    id: "rule_netflix",
    tag: "netflix-api",
    pattern: "https?:\\/\\/([a-z0-9-]{1,}[\\.])*api\\.([a-z0-9-]{1,}[\\.])*netflix\\.[a-z.]+(\\/[^\\s\"'<>]+)?",
    flags: "gi",
    enabled: true,
    description: "Netflix API endpoints from search results and code",
    created_at: new Date().toISOString()
  },

  {
    id: "rule_aws_s3",
    tag: "aws-s3",
    pattern: "([a-z0-9.-]+\\.s3[.-][a-z0-9-]*\\.amazonaws\\.com|s3:\\/\\/[a-z0-9.-]+)",
    flags: "gi",
    enabled: true,
    description: "Amazon S3 bucket endpoints and URIs",
    created_at: new Date().toISOString()
  },
  {
    id: "rule_graphql",
    tag: "graphql-endpoints",
    pattern: "https?:\\/\\/[a-zA-Z0-9.-]+\\/[a-zA-Z0-9_.-]*graphql",
    flags: "gi",
    enabled: false,
    description: "GraphQL API endpoints",
    created_at: new Date().toISOString()
  }
];

let appState = {
  status: "STOPPED", // STOPPED | RUNNING | PAUSED
  rules: DEFAULT_RULES,
  config: {
    server_url: "http://127.0.0.1:8787",
    token: ""
  },
  session_matches: 0,
  server_online: false,
  server_total_unique: 0
};

// Client-side session deduplication cache: Set of `${tag}::${match}`
const sessionSeenMatches = new Set();

// Offline retry queue
let offlineQueue = [];

// Initialize storage on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(["status", "rules", "config", "session_matches", "offline_queue"]);
  if (!data.rules) {
    await chrome.storage.local.set({ rules: DEFAULT_RULES });
  }
  if (!data.config) {
    await chrome.storage.local.set({
      config: {
        server_url: "http://127.0.0.1:8787",
        token: ""
      }
    });
  }
  if (!data.status) {
    await chrome.storage.local.set({ status: "STOPPED" });
  }
  await loadStateFromStorage();
  checkServerHealth();
});

// Load state on startup
loadStateFromStorage().then(() => {
  checkServerHealth();
});

async function loadStateFromStorage() {
  const data = await chrome.storage.local.get(["status", "rules", "config", "session_matches", "offline_queue"]);
  if (data.status) appState.status = data.status;
  if (data.rules) appState.rules = data.rules;
  if (data.config) appState.config = data.config;
  if (data.session_matches) appState.session_matches = data.session_matches;
  if (data.offline_queue) offlineQueue = data.offline_queue;
  updateBadge();
}

// Update Extension Icon Badge
function updateBadge() {
  if (appState.status === "RUNNING") {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); // Emerald green
  } else if (appState.status === "PAUSED") {
    chrome.action.setBadgeText({ text: "PAUS" });
    chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" }); // Amber
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// Server Health Polling
async function checkServerHealth() {
  const url = `${appState.config.server_url.replace(/\/+$/, '')}/api/health`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${appState.config.token}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      appState.server_alive = true;
      appState.server_authenticated = data.authenticated === true;
      appState.server_online = appState.server_alive && appState.server_authenticated;
      appState.server_total_unique = data.total_unique_matches || 0;

      // Drain offline queue if server is back online and authenticated
      if (appState.server_online && offlineQueue.length > 0) {
        drainOfflineQueue();
      }
    } else {
      appState.server_alive = false;
      appState.server_authenticated = false;
      appState.server_online = false;
    }
  } catch (err) {
    appState.server_alive = false;
    appState.server_authenticated = false;
    appState.server_online = false;
  }
}


// Poll health check every 10 seconds
setInterval(checkServerHealth, 10000);

// Drain offline queue
async function drainOfflineQueue() {
  if (offlineQueue.length === 0 || !appState.server_online) return;

  const batch = offlineQueue.splice(0, 50);
  await chrome.storage.local.set({ offline_queue: offlineQueue });

  await sendMatchesToServer(batch);
}

// Send matches to local HTTP server
async function sendMatchesToServer(matches) {
  if (!matches || matches.length === 0) return;

  const url = `${appState.config.server_url.replace(/\/+$/, '')}/api/matches`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${appState.config.token}`
      },
      body: JSON.stringify({ matches })
    });

    if (resp.ok) {
      const result = await resp.json();
      appState.server_online = true;
      if (result.total_unique !== undefined) {
        appState.server_total_unique = result.total_unique;
      }
    } else {
      // Server returned error (e.g. 401, 500)
      console.warn("[Regex Hunter] Server returned status", resp.status);
    }
  } catch (err) {
    // Network error: queue for later retry
    appState.server_online = false;
    if (offlineQueue.length < 5000) {
      offlineQueue.push(...matches);
      await chrome.storage.local.set({ offline_queue: offlineQueue });
    }
  }
}

// Runtime Message Handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    // Return current state to popup or content script
    sendResponse({
      status: appState.status,
      rules: appState.rules,
      config: appState.config,
      session_matches: appState.session_matches,
      server_online: appState.server_online,
      server_alive: appState.server_alive,
      server_authenticated: appState.server_authenticated,
      server_total_unique: appState.server_total_unique
    });
    return true;

  }

  if (message.type === "SET_STATUS") {
    appState.status = message.status;
    chrome.storage.local.set({ status: message.status });
    updateBadge();
    sendResponse({ status: appState.status });

    // Notify all active tabs of state change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "STATE_UPDATED",
            status: appState.status,
            rules: appState.rules.filter(r => r.enabled)
          }).catch(() => {});
        }
      });
    });
    return true;
  }

  if (message.type === "SAVE_RULES") {
    appState.rules = message.rules;
    chrome.storage.local.set({ rules: message.rules });
    sendResponse({ success: true });

    // Notify all active tabs of updated rules
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "STATE_UPDATED",
            status: appState.status,
            rules: appState.rules.filter(r => r.enabled)
          }).catch(() => {});
        }
      });
    });
    return true;
  }

  if (message.type === "SAVE_CONFIG") {
    appState.config = message.config;
    chrome.storage.local.set({ config: message.config });
    checkServerHealth();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "MATCHES_FOUND") {
    if (appState.status !== "RUNNING") {
      sendResponse({ accepted: 0 });
      return true;
    }

    const incoming = message.matches || [];
    const newMatches = [];

    for (const item of incoming) {
      const key = `${item.regex_tag}::${item.match}`;
      if (!sessionSeenMatches.has(key)) {
        sessionSeenMatches.add(key);
        newMatches.push(item);
      }
    }

    if (newMatches.length > 0) {
      console.log(`[🎯 Regex Hunter] Forwarding ${newMatches.length} matches to local daemon:`, newMatches);
      appState.session_matches += newMatches.length;
      chrome.storage.local.set({ session_matches: appState.session_matches });
      sendMatchesToServer(newMatches);
    }


    sendResponse({ accepted: newMatches.length });
    return true;
  }
});
