"""
Security utilities for Regex Hunter:
- Token management & validation
- Origin / CORS defense against malicious websites
- Path traversal prevention for regex tags
"""

import os
import secrets
import re
from pathlib import Path
from typing import Optional

TAG_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")
TOKEN_DIR = Path.home() / ".regexhunter"
TOKEN_FILE = TOKEN_DIR / "token"


def get_or_create_token(custom_token: Optional[str] = None, force_new: bool = False) -> str:
    """Retrieve or generate a secure authentication token."""
    if custom_token:
        return custom_token.strip()

    if not force_new and TOKEN_FILE.exists():
        try:
            token = TOKEN_FILE.read_text(encoding="utf-8").strip()
            if token and len(token) >= 16:
                return token
        except Exception:
            pass

    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    new_token = secrets.token_hex(24)
    TOKEN_FILE.write_text(new_token, encoding="utf-8")
    return new_token


def validate_token(provided_header: Optional[str], expected_token: str) -> bool:
    """Validate Bearer authorization header securely."""
    if not provided_header or not expected_token:
        return False

    parts = provided_header.strip().split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        candidate = parts[1]
    elif len(parts) == 1:
        candidate = parts[0]
    else:
        return False

    return secrets.compare_digest(candidate, expected_token)


def is_allowed_origin(origin: Optional[str]) -> bool:
    """
    Validate that requests originate ONLY from a Chrome extension or direct local API call.
    Rejects ordinary web page origins (e.g., https://evil.com, http://attacker.local)
    to prevent CSRF / local port scanning from untrusted websites.
    """
    if not origin:
        # Direct CLI / curl / browser extension without Origin header in some contexts
        return True

    # Chrome extension origins
    if origin.startswith("chrome-extension://"):
        return True

    # Local loopback origins (e.g. local UI previews, dashboard)
    if origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:"):
        return True

    # Reject standard external web pages (e.g. https://evil.com, http://attacker.local)
    return False



def sanitize_tag_and_resolve_dir(base_dir: Path, tag: str) -> Path:
    """
    Ensure tag is strictly alphanumeric/dashes/underscores and resolves
    safely within base_dir, completely mitigating path traversal attacks.
    """
    tag = tag.strip()
    if not TAG_PATTERN.match(tag):
        raise ValueError(f"Security violation: tag '{tag}' contains invalid characters.")

    target_dir = (base_dir / tag).resolve()
    base_resolved = base_dir.resolve()

    try:
        # Python 3.9+ is_relative_to
        if not target_dir.is_relative_to(base_resolved):
            raise ValueError(f"Security violation: path traversal detected for tag '{tag}'.")
    except AttributeError:
        # Fallback for older python
        if not str(target_dir).startswith(str(base_resolved)):
            raise ValueError(f"Security violation: path traversal detected for tag '{tag}'.")

    return target_dir
