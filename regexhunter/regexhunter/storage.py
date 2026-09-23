"""
Storage and deduplication engine for Regex Hunter.
Manages clean text outputs and structured JSON lines.
"""

import json
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Set, Tuple, List, Optional
from regexhunter.models import MatchItem
from regexhunter.security import sanitize_tag_and_resolve_dir


class StorageManager:
    def __init__(self, output_dir: Path, json_metadata: bool = False):
        self.output_dir = output_dir.resolve()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.json_metadata = json_metadata
        self.lock = asyncio.Lock()

        # In-memory deduplication set: (tag, match_string)
        self.seen_matches: Set[Tuple[str, str]] = set()

        # In-memory metadata map: (tag, match_string) -> dict
        self.metadata_map: Dict[Tuple[str, str], dict] = {}

        # In-memory recent matches stream for live telemetry / UI (max 100)
        self.recent_matches: List[dict] = []

        # Pre-load existing entries from disk to preserve state across restarts
        self._load_existing_matches()


    def _load_existing_matches(self) -> None:
        """Scan existing tag directories and populate deduplication cache."""
        try:
            for tag_dir in self.output_dir.iterdir():
                if tag_dir.is_dir():
                    tag = tag_dir.name
                    matches_file = tag_dir / "matches.txt"
                    if matches_file.exists():
                        with open(matches_file, "r", encoding="utf-8", errors="ignore") as f:
                            for line in f:
                                match_val = line.strip()
                                if match_val:
                                    self.seen_matches.add((tag, match_val))

                    # If json metadata exists, load existing metadata
                    meta_file = tag_dir / "metadata.jsonl"
                    if meta_file.exists():
                        with open(meta_file, "r", encoding="utf-8", errors="ignore") as f:
                            for line in f:
                                line = line.strip()
                                if not line:
                                    continue
                                try:
                                    data = json.loads(line)
                                    match_str = data.get("match")
                                    if match_str:
                                        self.metadata_map[(tag, match_str)] = data
                                except Exception:
                                    continue
        except Exception as e:
            print(f"[!] Warning: Failed reading existing matches: {e}")

    async def save_matches(self, items: List[MatchItem]) -> Dict[str, int]:
        """
        Process incoming batch of matches:
        Deduplicates, writes new matches to matches.txt,
        and optionally updates metadata.jsonl.
        Returns a dict summarizing new and duplicate counts.
        """
        async with self.lock:
            new_count = 0
            duplicate_count = 0

            for item in items:
                tag = item.regex_tag
                match_val = item.match
                key = (tag, match_val)
                now_str = item.timestamp or datetime.now(timezone.utc).isoformat()

                tag_dir = sanitize_tag_and_resolve_dir(self.output_dir, tag)
                tag_dir.mkdir(parents=True, exist_ok=True)
                matches_file = tag_dir / "matches.txt"
                meta_file = tag_dir / "metadata.jsonl"

                if key not in self.seen_matches:
                    # Brand new unique match
                    self.seen_matches.add(key)
                    new_count += 1

                    # Append to matches.txt
                    with open(matches_file, "a", encoding="utf-8") as f:
                        f.write(f"{match_val}\n")

                    # Initialize metadata
                    meta_entry = {
                        "match": match_val,
                        "tag": tag,
                        "first_seen": now_str,
                        "last_seen": now_str,
                        "occurrences": 1,
                        "sources": [item.url] if item.url else [],
                        "domain": item.domain or "",
                        "source_type": item.source or "dom_text"
                    }
                    self.metadata_map[key] = meta_entry

                    if self.json_metadata:
                        with open(meta_file, "a", encoding="utf-8") as f:
                            f.write(json.dumps(meta_entry, ensure_ascii=False) + "\n")
                else:
                    # Duplicate match
                    duplicate_count += 1
                    if key in self.metadata_map:
                        meta = self.metadata_map[key]
                        meta["occurrences"] = meta.get("occurrences", 1) + 1
                        meta["last_seen"] = now_str
                        if item.url and item.url not in meta.get("sources", []):
                            if len(meta["sources"]) < 20:
                                meta["sources"].append(item.url)

                        if self.json_metadata:
                            with open(meta_file, "a", encoding="utf-8") as f:
                                f.write(json.dumps({
                                    "event": "duplicate",
                                    "match": match_val,
                                    "tag": tag,
                                    "timestamp": now_str,
                                    "occurrences": meta["occurrences"],
                                    "url": item.url
                                }, ensure_ascii=False) + "\n")

                # Track in live recent stream (both new and duplicates)
                self.recent_matches.insert(0, {
                    "match": match_val,
                    "tag": tag,
                    "timestamp": now_str,
                    "url": item.url,
                    "domain": item.domain or "",
                    "is_new": (new_count > 0 and key in self.seen_matches)
                })
                if len(self.recent_matches) > 100:
                    self.recent_matches.pop()

            return {
                "new": new_count,
                "duplicates": duplicate_count,
                "total_unique": len(self.seen_matches)
            }


    def get_recent_matches(self, limit: int = 50) -> List[dict]:
        return self.recent_matches[:limit]

    def get_total_unique(self) -> int:
        return len(self.seen_matches)

