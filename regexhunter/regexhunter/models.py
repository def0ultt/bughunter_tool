"""
Data models for Regex Hunter.
"""

from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator
import re

TAG_REGEX = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")


class MatchItem(BaseModel):
    match: str = Field(..., min_length=1, max_length=4096)
    regex_tag: str = Field(..., min_length=1, max_length=64)
    url: str = Field(..., max_length=4096)
    domain: Optional[str] = Field(default="")
    source: Optional[str] = Field(default="dom_text")
    timestamp: Optional[str] = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @field_validator("regex_tag")
    @classmethod
    def validate_tag(cls, v: str) -> str:
        v = v.strip()
        if not TAG_REGEX.match(v):
            raise ValueError(f"Invalid tag: '{v}'. Must be alphanumeric, dashes or underscores (1-64 chars).")
        return v

    @field_validator("match")
    @classmethod
    def strip_and_clean_match(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Match content cannot be empty.")
        return cleaned


class MatchBatchPayload(BaseModel):
    matches: List[MatchItem] = Field(default_factory=list)


class ServerHealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    output_dir: str
    json_metadata_enabled: bool
    total_unique_matches: int
    uptime_seconds: float
