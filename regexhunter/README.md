# 🎯 Regex Hunter — Chrome Extension & Local Daemon for Bug Bounty Recon

**Regex Hunter** is a high-speed, automated reconnaissance data extraction system for authorized bug bounty hunters and security researchers.

It seamlessly monitors web content encountered during normal browsing (such as GitHub search results, API documentation, client-rendered SPAs, and source code) and extracts strings matching user-defined regular expressions, streaming deduplicated matches directly to a local terminal daemon.

---

## 🏗️ Architecture

```
Chrome Browser (User Browses Normally)
   ├── Extractor Content Script (Safe chunking & debounced MutationObserver)
   ├── Background Service Worker (In-memory dedup, offline queuing)
   └── Popup Cockpit (START / PAUSE / STOP, rule manager, live telemetry)
            │
            │  HTTP POST (127.0.0.1:8787 / Bearer Auth / Extension Origin)
            ▼
Local Terminal Server (regexhunter -o ./results -oj)
   ├── Token Authentication & Origin Guards (Rejects web-page CSRF/scanning)
   ├── Path Traversal Sanitizer (Strict tag whitelist)
   └── Deduplication Engine
            │
            ▼
Filesystem Storage
   ├── results/netflix-api/matches.txt    <-- Unique, clean lines (sort -u ready)
   └── results/netflix-api/metadata.jsonl <-- Full context, first/last seen, URLs
```

---

## 🚀 Quickstart Guide

### Step 1: Install and Start the Local Terminal Daemon

Navigate to the project directory:

```bash
cd c:\tools\bughunter_tool\regexhunter
pip install -e .
```

Start the daemon specifying your desired output directory:

```bash
regexhunter -o ./results -oj -v
```

> **Note**: You can also run it directly without installing via:
> ```bash
> python -m regexhunter -o ./results -oj -v
> ```

The terminal will display a colored banner:
```
[+] ========================================================= [+]
[+]                 REGEX HUNTER - LOCAL DAEMON               [+]
[+] ========================================================= [+]
[*] Binding Address   : http://127.0.0.1:8787
[*] Output Directory  : C:\tools\bughunter_tool\regexhunter\results
[*] Metadata Logging  : ENABLED (matches.txt + metadata.jsonl)
[*] Extension Token   : 4a2b8e...
[*] Status            : LISTENING FOR CHROME MATCHES (Ctrl+C to stop)
```

Copy the **Extension Token** displayed in the banner.

---

### Step 2: Install the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the directory:
   `c:\tools\bughunter_tool\regexhunter\extension`
5. The **Regex Hunter** icon will appear in your Chrome toolbar. Pin it for quick access.

---

### Step 3: Configure and Start Hunting

1. Click the **Regex Hunter** extension icon in Chrome.
2. Click the **Server Settings** icon (`⚙` or click the server status badge).
3. Paste the **Extension Token** from Step 1 and click **Test Connection**. Once verified, click **Save Settings**.
   The badge in the top right will show `● Connected`.
4. Review the default regexes or add your own:
   * **Tag**: `netflix-api`
   * **Regex**: `https?:\/\/([a-z0-9-]{1,}[\.])*api\.([a-z0-9-]{1,}[\.])*netflix\.[a-z\.]+\/`
5. Click **START**. The status turns green (`RUNNING`).
6. Browse normally! For example, search GitHub or target documentation for Netflix endpoints.
7. As matching strings appear in the DOM or dynamic AJAX results, Regex Hunter extracts them in real time and sends them to your terminal daemon.

---

## 📁 Output Structure

Results are organized cleanly by tag in your configured output directory:

```text
results/
├── netflix-api/
│   ├── matches.txt          <-- Deduplicated, line-delimited (ready for cli pipelines)
│   └── metadata.jsonl       <-- JSON Lines with timestamps, source URLs, occurrences
├── aws-s3/
│   ├── matches.txt
│   └── metadata.jsonl
└── graphql-endpoints/
    ├── matches.txt
    └── metadata.jsonl
```

### Clean Grep / CLI Workflows

#### 1. Piping Live Interceptions Directly into Tools (`-s, --silent`)
In silent mode, the server suppresses banners and info logs, printing **pure raw matches** (one per line) directly to stdout with immediate flushing. This is ideal for live piping into tools like `anew`, `httpx`, or `tee`:

```bash
# Pipe directly into anew to collect unique endpoints live
python -m regexhunter -s | anew ./live_endpoints.txt

# Pipe directly into httpx for live status probing
python -m regexhunter -s | httpx -silent -status-code

# Save to results folder AND pipe raw stream to anew simultaneously
python -m regexhunter -o ./results -s | anew ./all_endpoints.txt
```

#### 2. Processing Saved Files
```bash
# View all captured endpoints for a tag
cat results/netflix-api/matches.txt

# Pipe saved endpoints into httpx
cat results/netflix-api/matches.txt | httpx -silent -status-code
```


---

## 🛡️ Security & Performance Design

* **Strict Localhost Binding**: Binds exclusively to `127.0.0.1` by default.
* **Origin Defense**: The server checks the `Origin` header and rejects requests from normal websites (`http://` / `https://`), preventing untrusted websites from scanning or interacting with the local port.
* **Token Authentication**: All API requests require a Bearer token.
* **Path Traversal Protection**: Tags are strictly validated against `^[a-zA-Z0-9_\-]{1,64}$` and resolved against the base output directory with `.is_relative_to()`. Tags like `../../etc` are rejected with HTTP 400.
* **ReDoS & Freeze Guards**: Content scripts chunk page text into bounded 50 KB slices, enforce maximum loop limits, clamp match lengths to 2,048 characters, and use a debounced `MutationObserver` (350ms) to scan dynamic SPAs without freezing Chrome.
* **Offline Resilience**: If the local terminal server is temporarily stopped, the extension buffers matches into `chrome.storage.local` and flushes them automatically as soon as the daemon comes back online.

---

## 🧪 Running Tests

Run the full automated test suite (11 unit and integration tests):

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```
