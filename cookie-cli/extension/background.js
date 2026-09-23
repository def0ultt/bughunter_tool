let socket = null;
let reconnectInterval = 5000;
let keepAliveId = null;

async function getBrowserInfo() {
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
      if (await navigator.brave.isBrave()) return 'Brave';
    }
  } catch (e) {}

  if (navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)) {
    const brandNames = navigator.userAgentData.brands.map(b => b.brand.toLowerCase());
    if (brandNames.some(b => b.includes('brave'))) return 'Brave';
    if (brandNames.some(b => b.includes('edge') || b.includes('edg'))) return 'Microsoft Edge';
    if (brandNames.some(b => b.includes('opera') || b.includes('opr'))) return 'Opera';
    if (brandNames.some(b => b.includes('chrome'))) return 'Google Chrome';
  }

  const ua = navigator.userAgent || '';
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  if (ua.includes('Vivaldi/')) return 'Vivaldi';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Brave')) return 'Brave';
  if (ua.includes('Chrome/')) return 'Google Chrome';
  return 'Browser';
}

async function getProfileInfo() {
  try {
    if (typeof chrome !== 'undefined' && chrome.identity && typeof chrome.identity.getProfileUserInfo === 'function') {
      const userInfo = await new Promise(resolve => {
        chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, resolve);
      });
      if (userInfo && userInfo.email) {
        return userInfo.email;
      }
    }
  } catch (e) {}
  return null;
}

function connect() {
  socket = new WebSocket('ws://127.0.0.1:8765');

  socket.onopen = () => {
    console.log('Connected to Cookie Daemon via WebSocket.');
    
    // Send a ping every 20 seconds to keep the Service Worker alive
    keepAliveId = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'ping' }));
      }
    }, 20000);
  };

  socket.onmessage = async (event) => {
    try {
      const request = JSON.parse(event.data);

      if (request.action === 'list_tabs') {
        const browser = await getBrowserInfo();
        const profile = await getProfileInfo();
        const tabs = await chrome.tabs.query({});
        const tabList = tabs.map(t => ({
          id: t.id,
          title: t.title || 'Untitled',
          url: t.url || '',
          active: Boolean(t.active),
          incognito: Boolean(t.incognito),
          windowId: t.windowId,
          cookieStoreId: t.cookieStoreId || null
        }));

        socket.send(JSON.stringify({
          id: request.id,
          action: 'list_tabs_response',
          data: {
            browser,
            profile,
            tabs: tabList
          }
        }));
        return;
      }

      if (request.action === 'get_cookie' && request.domain) {
        const browser = await getBrowserInfo();
        if (request.browser && !browser.toLowerCase().includes(request.browser.toLowerCase())) {
          socket.send(JSON.stringify({
            id: request.id,
            action: 'tab_not_found',
            reason: 'browser_mismatch'
          }));
          return;
        }

        let shouldRespond = true;
        let storeId = null;

        if (request.tab) {
          shouldRespond = false;
          const tabs = await chrome.tabs.query({});
          const search = request.tab.toLowerCase();
          const match = tabs.find(t => 
            (t.title && t.title.toLowerCase().includes(search)) ||
            (t.url && t.url.toLowerCase().includes(search))
          );
          
          if (match) {
            shouldRespond = true;
            // Get storeId in case it's incognito or from a container extension (Firefox)
            storeId = match.cookieStoreId;
          }
        }

        if (shouldRespond) {
          const query = { domain: request.domain };
          if (storeId) query.storeId = storeId;
          
          const cookies = await chrome.cookies.getAll(query);
          
          socket.send(JSON.stringify({
            id: request.id,
            action: 'cookie_response',
            data: cookies
          }));
        } else {
          socket.send(JSON.stringify({
            id: request.id,
            action: 'tab_not_found'
          }));
        }
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  };

  socket.onclose = () => {
    console.log(`WebSocket closed. Reconnecting in ${reconnectInterval/1000}s...`);
    if (keepAliveId) clearInterval(keepAliveId);
    setTimeout(connect, reconnectInterval);
  };

  socket.onerror = (error) => {
    console.error('WebSocket Error. Ensure the daemon is running.');
  };
}

// Start connection on load
connect();
