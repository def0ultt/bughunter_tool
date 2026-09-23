#!/usr/bin/env node
const http = require('http');
const { parseArgs } = require('util');

const options = {
  domain: { type: 'string', short: 'd' },
  key: { type: 'string', short: 'k' },
  tab: { type: 'string', short: 't' },
  browser: { type: 'string', short: 'b' },
  list: { type: 'boolean', short: 'l' },
  'list-tabs': { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

let values;
try {
  const parsed = parseArgs({ options, strict: false });
  values = parsed.values;
} catch (e) {
  console.error("Error parsing arguments.");
  process.exit(1);
}

const isList = values.list || values['list-tabs'];

if (values.help || (!values.domain && !isList)) {
  console.log(`
Cookie CLI - Extract cookies directly from browser sessions

Usage:
  cookie_cli -d <domain> [-k <key>] [-t <tab>] [-b <browser>]
  cookie_cli -l [--json] [-d <domain>]

Options:
  -d, --domain <domain>     The domain to extract cookies for (e.g., example.com)
  -k, --key <key>           Optional. A specific cookie name to extract. If omitted, returns all.
  -t, --tab <tab_name>      Optional. Filter by a tab title or URL substring.
  -b, --browser <browser>   Optional. Filter by browser name (e.g., brave, chrome, edge).
  -l, --list, --list-tabs   List all connected browsers, profiles, and open tabs.
      --json                Output results as raw JSON.
  -h, --help                Show help.

Examples:
  cookie_cli -l
  cookie_cli -l -d whatnot.com
  cookie_cli -d whatnot.com
  cookie_cli -d whatnot.com -t "Whatnot" -b brave
  cookie_cli -d whatnot.com -k __Secure-access-token
`);
  process.exit(values.help ? 0 : 1);
}

if (isList) {
  const req = http.request('http://127.0.0.1:8764/tabs', {
    method: 'GET'
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        let errMsg = data;
        try {
          const json = JSON.parse(data);
          if (json.error) errMsg = json.error;
        } catch (e) {}
        console.error(`Error: HTTP ${res.statusCode} - ${errMsg}`);
        process.exit(1);
      }

      let browsers;
      try {
        browsers = JSON.parse(data);
      } catch (e) {
        console.error("Error parsing response from daemon.");
        process.exit(1);
      }

      if (values.json) {
        console.log(JSON.stringify(browsers, null, 2));
        process.exit(0);
      }

      if (!Array.isArray(browsers) || browsers.length === 0) {
        console.log("No connected browsers or open tabs found.");
        process.exit(0);
      }

      console.log(`\n=== Connected Browsers & Tabs (${browsers.length} connected) ===\n`);
      
      const filterDomain = values.domain ? values.domain.toLowerCase() : null;

      browsers.forEach((item, index) => {
        const browserName = item.browser || 'Unknown Browser';
        const profileInfo = item.profile ? ` [Profile: ${item.profile}]` : '';
        const allTabs = item.tabs || [];
        
        let matchingTabs = allTabs;
        if (filterDomain) {
          matchingTabs = allTabs.filter(t => 
            (t.url && t.url.toLowerCase().includes(filterDomain)) ||
            (t.title && t.title.toLowerCase().includes(filterDomain))
          );
        }

        console.log(`[Browser #${index + 1}] ${browserName}${profileInfo} (${matchingTabs.length} tab${matchingTabs.length === 1 ? '' : 's'}${filterDomain ? ` matching '${filterDomain}'` : ''})`);

        if (matchingTabs.length === 0) {
          console.log(`    (No ${filterDomain ? 'matching ' : ''}open tabs)`);
        } else {
          matchingTabs.forEach(t => {
            const activeBadge = t.active ? '[Active] ' : '';
            const incognitoBadge = t.incognito ? '[Incognito] ' : '';
            const cleanUrl = t.url ? ` -> ${t.url}` : '';
            console.log(`    * ${activeBadge}${incognitoBadge}"${t.title}"${cleanUrl}`);
          });
        }
        console.log('');
      });

      console.log('Select a tab using -t "<title>" and/or -b "<browser>" when requesting cookies.');
      console.log('Example: cookie_cli -d <domain> -t "Tab Title" -b "brave"');
    });
  });

  req.on('error', (e) => {
    console.error(`Failed to connect to local daemon: ${e.message}`);
    console.error('Make sure the daemon is running (node server.js).');
    process.exit(1);
  });

  req.end();
} else {
  const req = http.request('http://127.0.0.1:8764/get-cookie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        let errMsg = data;
        try {
          const json = JSON.parse(data);
          if (json.error) errMsg = json.error;
        } catch (e) {}
        console.error(`Error: HTTP ${res.statusCode} - ${errMsg}`);
        process.exit(1);
      }
      
      let cookies;
      try {
        cookies = JSON.parse(data);
      } catch (e) {
        console.error("Error parsing response from daemon.");
        process.exit(1);
      }
      
      if (values.key) {
        // Find specific cookie
        const targetCookie = cookies.find(c => c.name === values.key);
        if (targetCookie) {
          console.log(targetCookie.value);
        } else {
          console.error(`Error: Cookie with key '${values.key}' not found for domain '${values.domain}'.`);
          process.exit(1);
        }
      } else {
        // Return all cookies formatted as standard Cookie header (key=value; key2=value2)
        if (cookies.length === 0) {
          console.error(`No cookies found for domain '${values.domain}'.`);
          process.exit(0);
        }
        const formatted = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log(formatted);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Failed to connect to local daemon: ${e.message}`);
    console.error('Make sure the daemon is running (node server.js).');
    process.exit(1);
  });

  req.write(JSON.stringify({ domain: values.domain, tab: values.tab, browser: values.browser }));
  req.end();
}
