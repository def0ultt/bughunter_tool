#!/usr/bin/env node
const { WebSocketServer } = require('ws');
const http = require('http');

const HTTP_PORT = 8764; // CLI communicates here
const WS_PORT = 8765;   // Extension communicates here

const wss = new WebSocketServer({ port: WS_PORT });
const extensionSockets = new Set();

wss.on('connection', (ws) => {
  console.log('Browser Extension connected.');
  extensionSockets.add(ws);
  
  ws.on('close', () => {
    console.log('Browser Extension disconnected.');
    extensionSockets.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket Error:', err);
  });
});

// HTTP Server for CLI
const server = http.createServer((req, res) => {
  const urlPath = req.url ? req.url.split('?')[0] : '';

  if ((urlPath === '/tabs' || urlPath === '/list-tabs') && (req.method === 'GET' || req.method === 'POST')) {
    if (extensionSockets.size === 0) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No browser extensions are connected to the daemon.' }));
    }

    const requestId = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
    const results = [];
    let responded = false;
    let receivedCount = 0;
    const totalSockets = extensionSockets.size;
    const cleanups = [];

    const finish = () => {
      if (responded) return;
      responded = true;
      cleanups.forEach(fn => fn());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));
    };

    extensionSockets.forEach(ws => {
      const handler = (data) => {
        try {
          const message = JSON.parse(data);
          if (message.id === requestId && message.action === 'list_tabs_response') {
            if (message.data) results.push(message.data);
            receivedCount++;
            if (receivedCount >= totalSockets) {
              finish();
            }
          }
        } catch (e) {
          console.error("Error parsing message from extension", e);
        }
      };

      ws.on('message', handler);
      cleanups.push(() => ws.off('message', handler));

      ws.send(JSON.stringify({
        id: requestId,
        action: 'list_tabs'
      }));
    });

    // Timeout after 3 seconds in case an extension fails to reply
    setTimeout(finish, 3000);
    return;
  }

  if (req.method === 'POST' && urlPath === '/get-cookie') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    
    req.on('end', () => {
      if (extensionSockets.size === 0) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'No browser extensions are connected to the daemon.' }));
      }
      
      let requestData;
      try {
        requestData = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid JSON request' }));
      }

      if (!requestData.domain) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Domain is required' }));
      }

      const requestId = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
      
      let responded = false;
      let notFoundCount = 0;

      const responseHandler = (ws, data) => {
        if (responded) return;
        try {
          const message = JSON.parse(data);
          if (message.id === requestId) {
            if (message.action === 'cookie_response') {
              responded = true;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(message.data));
            } else if (message.action === 'tab_not_found') {
              notFoundCount++;
              if (notFoundCount === extensionSockets.size && !responded) {
                responded = true;
                const errDetail = requestData.tab 
                  ? `No connected browser has a tab matching '${requestData.tab}'` 
                  : (requestData.browser ? `No connected browser matching '${requestData.browser}'` : 'Cookie extraction failed');
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: errDetail }));
              }
            }
          }
        } catch (e) {
          console.error("Error parsing message from extension", e);
        }
      };

      extensionSockets.forEach(ws => {
        const handler = (data) => responseHandler(ws, data);
        ws.on('message', handler);
        
        ws.send(JSON.stringify({
          id: requestId,
          action: 'get_cookie',
          domain: requestData.domain,
          tab: requestData.tab,
          browser: requestData.browser
        }));
        
        setTimeout(() => ws.off('message', handler), 5000);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (!responded) {
          responded = true;
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Timeout waiting for browser extension to respond' }));
        }
      }, 5000);
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(HTTP_PORT, () => {
  console.log(`Cookie Daemon is running.`);
  console.log(`=> Extension WebSocket Server on ws://127.0.0.1:${WS_PORT}`);
  console.log(`=> CLI API Server on http://127.0.0.1:${HTTP_PORT}`);
  console.log(`Waiting for extension to connect...`);
});
