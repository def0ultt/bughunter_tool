import unittest
import tempfile
import shutil
from pathlib import Path
from starlette.testclient import TestClient
from regexhunter.storage import StorageManager
from regexhunter.server import create_app


class TestServerIntegration(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.output_path = Path(self.temp_dir)
        self.token = "test_secret_token_12345"
        self.storage = StorageManager(self.output_path, json_metadata=True)
        self.app = create_app(self.storage, token=self.token, verbose=False)
        self.client = TestClient(self.app)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_health_check_unauthorized(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertFalse(data["authenticated"])

    def test_matches_unauthorized(self):
        resp = self.client.post("/api/matches", json={"matches": []})
        self.assertEqual(resp.status_code, 401)


    def test_health_check_authorized(self):
        resp = self.client.get(
            "/api/health",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["total_unique_matches"], 0)

    def test_matches_ingest_and_deduplication(self):
        payload = {
            "matches": [
                {
                    "match": "https://api.netflix.net/",
                    "regex_tag": "netflix-api",
                    "url": "https://github.com/search?q=netflix",
                    "domain": "github.com",
                    "source": "dom_text"
                },
                {
                    "match": "https://api.netflix.net/",  # Duplicate
                    "regex_tag": "netflix-api",
                    "url": "https://github.com/another/repo",
                    "domain": "github.com",
                    "source": "dom_text"
                },
                {
                    "match": "https://foo.api.netflix.net/",
                    "regex_tag": "netflix-api",
                    "url": "https://github.com/search?q=netflix",
                    "domain": "github.com",
                    "source": "dom_text"
                }
            ]
        }

        # Send matches
        resp = self.client.post(
            "/api/matches",
            json=payload,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Origin": "chrome-extension://abcdefghijklmnop"
            }
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["new_unique"], 2)
        self.assertEqual(data["duplicates"], 1)
        self.assertEqual(data["total_unique"], 2)

        # Verify disk output
        matches_file = self.output_path / "netflix-api" / "matches.txt"
        self.assertTrue(matches_file.exists())
        lines = [l.strip() for l in matches_file.read_text().splitlines() if l.strip()]
        self.assertEqual(lines, ["https://api.netflix.net/", "https://foo.api.netflix.net/"])

        # Verify metadata.jsonl
        meta_file = self.output_path / "netflix-api" / "metadata.jsonl"
        self.assertTrue(meta_file.exists())
        meta_lines = [l.strip() for l in meta_file.read_text().splitlines() if l.strip()]
        self.assertGreaterEqual(len(meta_lines), 2)

    def test_unauthorized_web_origin_rejected(self):
        payload = {
            "matches": [
                {
                    "match": "https://api.netflix.net/",
                    "regex_tag": "netflix-api",
                    "url": "https://github.com"
                }
            ]
        }
        # Webpage origin like https://attacker.com must be 403 Forbidden
        resp = self.client.post(
            "/api/matches",
            json=payload,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Origin": "https://attacker.com"
            }
        )
        self.assertEqual(resp.status_code, 403)

    def test_recent_matches_endpoint(self):
        payload = {
            "matches": [
                {
                    "match": "https://api.netflix.net/",
                    "regex_tag": "netflix-api",
                    "url": "https://github.com",
                    "domain": "github.com"
                }
            ]
        }
        self.client.post(
            "/api/matches",
            json=payload,
            headers={"Authorization": f"Bearer {self.token}"}
        )

        resp = self.client.get(
            "/api/recent?limit=10",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("recent_matches", data)
        self.assertEqual(len(data["recent_matches"]), 1)
        self.assertEqual(data["recent_matches"][0]["match"], "https://api.netflix.net/")

    def test_silent_mode_raw_output(self):
        import io
        import sys
        silent_app = create_app(self.storage, token=self.token, silent=True)
        silent_client = TestClient(silent_app)

        captured_stdout = io.StringIO()
        old_stdout = sys.stdout
        try:
            sys.stdout = captured_stdout
            payload = {
                "matches": [
                    {
                        "match": "https://api.netflix.net/",
                        "regex_tag": "netflix-api",
                        "url": "https://github.com"
                    },
                    {
                        "match": "https://foo.api.netflix.net/",
                        "regex_tag": "netflix-api",
                        "url": "https://github.com"
                    }
                ]
            }
            resp = silent_client.post(
                "/api/matches",
                json=payload,
                headers={"Authorization": f"Bearer {self.token}"}
            )
            self.assertEqual(resp.status_code, 200)
            output = captured_stdout.getvalue()
            # Must contain ONLY raw matched strings, no [+] or [netflix-api]
            self.assertEqual(output, "https://api.netflix.net/\nhttps://foo.api.netflix.net/\n")
        finally:
            sys.stdout = old_stdout


if __name__ == "__main__":
    unittest.main()


