# Cookie CLI

> [!NOTE]
> This document was written by AI.

A tool for extracting session cookies directly from active browser sessions into the terminal or automated bug bounty workflows.

---

## Architecture

- **Extension (`extension/`)**: Chrome/Chromium browser extension that listens for cookie extraction requests via WebSockets.
- **Daemon (`server.js`)**: Local WebSocket & HTTP bridge (WS on `:8765`, HTTP on `:8764`).
- **CLI (`cli.js`)**: Command-line interface to query cookies, filter by domain, tab, or browser.

---

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   cd cookie-cli
   npm install
   ```

2. **Load Browser Extension**:
   - Open Chrome / Brave / Edge and navigate to `chrome://extensions`.
   - Enable **Developer mode**.
   - Click **Load unpacked** and select the `cookie-cli/extension` folder.

3. **Start the Background Server**:
   ```bash
   node server.js
   ```

---

## CLI Usage

```bash
# Extract all cookies for a specific domain
node cli.js -d example.com

# Extract a specific cookie by name
node cli.js -d example.com -k session_id

# List all connected browsers and open tabs
node cli.js -l

# Filter by browser name
node cli.js -d example.com -b brave

# Output as JSON
node cli.js -l --json
```

---

## CLI Options

| Flag | Long Flag | Description |
| :--- | :--- | :--- |
| `-d` | `--domain` | Target domain to extract cookies for |
| `-k` | `--key` | Specific cookie name to extract |
| `-t` | `--tab` | Filter by tab title or URL substring |
| `-b` | `--browser` | Filter by browser name (e.g., brave, chrome, edge) |
| `-l` | `--list`, `--list-tabs` | List connected browsers and open tabs |
| | `--json` | Output results in JSON format |
| `-h` | `--help` | Display usage instructions |
