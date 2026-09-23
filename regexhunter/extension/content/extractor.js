// Content Script for Regex Hunter
// Injected into pages to scan visible text, attributes, scripts, and dynamic DOM mutations.

(function () {
  // Avoid multi-injection
  if (window.__regexHunterInjected) return;
  window.__regexHunterInjected = true;

  let currentStatus = "STOPPED";
  let activeCompiledRules = [];
  const pageSeenMatches = new Set();
  let mutationObserver = null;
  let debounceTimeout = null;

  // Maximum characters per chunk to prevent browser freezing on huge pages
  const CHUNK_SIZE = 50000;
  const MAX_MATCH_LEN = 2048;
  const MAX_MATCHES_PER_CHUNK = 200;

  // Request initial state from background service worker
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    updateRuntimeState(response.status, response.rules);
  });

  // Listen for updates from background service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STATE_UPDATED") {
      updateRuntimeState(message.status, message.rules);
    }
  });

  function updateRuntimeState(status, rules) {
    currentStatus = status || "STOPPED";

    // Compile active enabled rules
    activeCompiledRules = [];
    if (rules && Array.isArray(rules)) {
      rules.filter(r => r.enabled).forEach(r => {
        try {
          const flags = (r.flags || "gi").includes("g") ? (r.flags || "gi") : (r.flags || "gi") + "g";
          activeCompiledRules.push({
            tag: r.tag,
            regex: new RegExp(r.pattern, flags)
          });
        } catch (e) {
          console.warn("[Regex Hunter] Failed compiling rule:", r.tag, e);
        }
      });
    }

    if (currentStatus === "RUNNING") {
      startScanning();
    } else {
      stopScanning();
    }
  }

  function startScanning() {
    // Initial scan of current page
    scanFullDocument();

    // Start MutationObserver for dynamic SPAs (GitHub infinite scroll, AJAX results)
    if (!mutationObserver && document.body) {
      mutationObserver = new MutationObserver(handleMutations);
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  function stopScanning() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
  }

  function scanFullDocument() {
    if (currentStatus !== "RUNNING" || activeCompiledRules.length === 0) return;

    const collectedMatches = [];

    // 1. Scan current URL
    scanText(window.location.href, "page_url", collectedMatches);

    // 2. Scan visible document innerText
    if (document.body) {
      scanChunkedText(document.body.innerText || "", "dom_text", collectedMatches);
    }

    // 3. Scan attributes (links, images, scripts)
    const links = document.querySelectorAll("a[href], link[href], script[src], img[src], form[action]");
    const attrStrings = [];
    links.forEach(el => {
      const src = el.src || el.href || el.getAttribute("href") || el.getAttribute("action");
      if (src && src.length < MAX_MATCH_LEN) {
        attrStrings.push(src);
      }
    });
    if (attrStrings.length > 0) {
      scanChunkedText(attrStrings.join("\n"), "dom_attr", collectedMatches);
    }

    // 4. Scan inline <script> tags
    const inlineScripts = document.querySelectorAll("script:not([src])");
    let scriptTexts = [];
    inlineScripts.forEach(s => {
      if (s.textContent) scriptTexts.push(s.textContent);
    });
    if (scriptTexts.length > 0) {
      scanChunkedText(scriptTexts.join("\n"), "inline_script", collectedMatches);
    }

    flushMatches(collectedMatches);
  }

  function handleMutations(mutations) {
    if (currentStatus !== "RUNNING" || activeCompiledRules.length === 0) return;

    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      const collectedMatches = [];

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Scan added element text
            const text = node.innerText || node.textContent || "";
            if (text.length > 0) {
              scanChunkedText(text, "dom_mutation", collectedMatches);
            }

            // Scan any links within the added element
            if (node.querySelectorAll) {
              const nestedLinks = node.querySelectorAll("a[href], script[src]");
              nestedLinks.forEach(el => {
                const targetUrl = el.href || el.src;
                if (targetUrl) scanText(targetUrl, "dom_attr", collectedMatches);
              });
            }
          }
        }
      }

      flushMatches(collectedMatches);
    }, 350);
  }

  function scanChunkedText(fullText, source, targetList) {
    if (!fullText) return;

    if (fullText.length <= CHUNK_SIZE) {
      scanText(fullText, source, targetList);
    } else {
      // Chunk text into manageable slices
      for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
        const slice = fullText.slice(i, i + CHUNK_SIZE);
        scanText(slice, source, targetList);
      }
    }
  }

  function scanText(text, source, targetList) {
    if (!text || activeCompiledRules.length === 0) return;

    for (const rule of activeCompiledRules) {
      const regex = new RegExp(rule.regex.source, rule.regex.flags);
      let match;
      let count = 0;

      try {
        while ((match = regex.exec(text)) !== null && count < MAX_MATCHES_PER_CHUNK) {
          count++;
          const matchStr = match[0].trim();

          if (matchStr && matchStr.length <= MAX_MATCH_LEN) {
            const pageKey = `${rule.tag}::${matchStr}`;
            if (!pageSeenMatches.has(pageKey)) {
              pageSeenMatches.add(pageKey);
              targetList.push({
                match: matchStr,
                regex_tag: rule.tag,
                url: window.location.href,
                domain: window.location.hostname,
                source: source,
                timestamp: new Date().toISOString()
              });
            }
          }

          // Guard against infinite zero-length matches
          if (match.index === regex.lastIndex) {
            regex.lastIndex++;
          }
        }
      } catch (err) {
        console.warn("[Regex Hunter] Execution error on rule:", rule.tag, err);
      }
    }
  }

  function flushMatches(matches) {
    if (!matches || matches.length === 0) return;

    console.log(`[🎯 Regex Hunter] Detected ${matches.length} matches:`, matches);

    chrome.runtime.sendMessage({
      type: "MATCHES_FOUND",
      matches: matches
    }, (response) => {
      if (chrome.runtime.lastError) {
        // Background might be waking up
      }
    });
  }

})();
