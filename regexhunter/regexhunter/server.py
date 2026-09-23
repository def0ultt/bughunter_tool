"""
HTTP Server daemon for Regex Hunter using Starlette and Uvicorn.
"""

import time
import json
from pathlib import Path
from typing import Optional
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware

from regexhunter.models import MatchBatchPayload, MatchItem
from regexhunter.storage import StorageManager
from regexhunter.security import validate_token, is_allowed_origin

START_TIME = time.time()


class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, expected_token: str):
        super().__init__(app)
        self.expected_token = expected_token

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")

        # 1. Reject malicious website origins
        if not is_allowed_origin(origin):
            return JSONResponse(
                {"error": "Forbidden: Origin not permitted."},
                status_code=403
            )

        # Handle CORS preflight
        if request.method == "OPTIONS":
            response = Response(status_code=204)
            self._apply_cors_headers(response, origin)
            return response

        # 2. Authenticate sensitive endpoints (matches, recent, etc.)
        path = request.url.path
        if path.startswith("/api/") and path != "/api/health":
            auth_header = request.headers.get("authorization")
            if not validate_token(auth_header, self.expected_token):
                return JSONResponse(
                    {"error": "Unauthorized: Invalid or missing bearer token."},
                    status_code=401,
                    headers={"WWW-Authenticate": "Bearer"}
                )

        response = await call_next(request)
        self._apply_cors_headers(response, origin)
        return response

    def _apply_cors_headers(self, response: Response, origin: Optional[str]):
        # Allow chrome-extension origins or localhost
        allow_origin = origin if origin and origin.startswith("chrome-extension://") else "*"
        response.headers["Access-Control-Allow-Origin"] = allow_origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        response.headers["Access-Control-Max-Age"] = "86400"


def create_app(storage_manager: StorageManager, token: str, verbose: bool = False, silent: bool = False) -> Starlette:
    async def health_endpoint(request: Request):
        auth_header = request.headers.get("authorization")
        is_auth = validate_token(auth_header, token)

        return JSONResponse({
            "status": "ok",
            "version": "1.0.0",
            "authenticated": is_auth,
            "output_dir": str(storage_manager.output_dir) if is_auth else "",
            "json_metadata_enabled": storage_manager.json_metadata if is_auth else False,
            "total_unique_matches": storage_manager.get_total_unique() if is_auth else 0,
            "uptime_seconds": round(time.time() - START_TIME, 2)
        })

    async def matches_endpoint(request: Request):
        try:
            body = await request.json()
            payload = MatchBatchPayload.model_validate(body)
        except Exception as e:
            return JSONResponse({"error": f"Invalid payload: {str(e)}"}, status_code=400)

        if not payload.matches:
            return JSONResponse({"status": "empty_batch", "processed": 0})

        stats = await storage_manager.save_matches(payload.matches)

        if silent:
            # Clean stream for unix piping (anew, httpx, etc.)
            import sys
            for match_item in payload.matches:
                sys.stdout.write(f"{match_item.match}\n")
            sys.stdout.flush()
        elif verbose:
            for match_item in payload.matches:
                tag_label = f"[{match_item.regex_tag}]"
                domain_info = f"({match_item.domain})" if match_item.domain else ""
                print(f"[+] {tag_label:<18} MATCH: {match_item.match} {domain_info}")

        return JSONResponse({
            "status": "success",
            "processed": len(payload.matches),
            "new_unique": stats["new"],
            "duplicates": stats["duplicates"],
            "total_unique": stats["total_unique"]
        })


    async def recent_endpoint(request: Request):
        limit = int(request.query_params.get("limit", 50))
        recent = storage_manager.get_recent_matches(limit=limit)
        return JSONResponse({
            "recent_matches": recent,
            "count": len(recent),
            "total_unique": storage_manager.get_total_unique()
        })

    async def options_handler(request: Request):
        return Response(status_code=204)

    routes = [
        Route("/api/health", health_endpoint, methods=["GET"]),
        Route("/api/matches", matches_endpoint, methods=["POST"]),
        Route("/api/recent", recent_endpoint, methods=["GET"]),
        Route("/{rest_of_path:path}", options_handler, methods=["OPTIONS"]),
    ]


    middleware = [
        Middleware(SecurityMiddleware, expected_token=token)
    ]

    return Starlette(debug=False, routes=routes, middleware=middleware)
