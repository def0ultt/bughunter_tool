import unittest
import tempfile
import shutil
import asyncio
from pathlib import Path
from regexhunter.storage import StorageManager
from regexhunter.models import MatchItem


class TestStorage(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.output_path = Path(self.temp_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_deduplication_and_writing(self):
        storage = StorageManager(self.output_path, json_metadata=True)

        items = [
            MatchItem(
                match="https://api.netflix.net/",
                regex_tag="netflix-api",
                url="https://github.com/search?q=netflix",
                domain="github.com",
                source="dom_text"
            ),
            # Duplicate item
            MatchItem(
                match="https://api.netflix.net/",
                regex_tag="netflix-api",
                url="https://github.com/netflix/another-repo",
                domain="github.com",
                source="dom_text"
            ),
            # Different unique item
            MatchItem(
                match="https://foo.api.netflix.net/",
                regex_tag="netflix-api",
                url="https://github.com/search?q=netflix",
                domain="github.com",
                source="dom_text"
            )
        ]

        stats = asyncio.run(storage.save_matches(items))

        self.assertEqual(stats["new"], 2)
        self.assertEqual(stats["duplicates"], 1)
        self.assertEqual(stats["total_unique"], 2)

        # Check matches.txt contains only 2 lines
        tag_file = self.output_path / "netflix-api" / "matches.txt"
        self.assertTrue(tag_file.exists())
        lines = [line.strip() for line in tag_file.read_text().strip().splitlines() if line.strip()]
        self.assertEqual(len(lines), 2)
        self.assertIn("https://api.netflix.net/", lines)
        self.assertIn("https://foo.api.netflix.net/", lines)

        # Check metadata.jsonl exists and contains records
        meta_file = self.output_path / "netflix-api" / "metadata.jsonl"
        self.assertTrue(meta_file.exists())
        meta_lines = [l for l in meta_file.read_text().strip().splitlines() if l.strip()]
        self.assertGreaterEqual(len(meta_lines), 2)

    def test_reload_existing_matches_on_restart(self):
        # First session
        storage1 = StorageManager(self.output_path, json_metadata=False)
        items = [
            MatchItem(match="https://api.netflix.net/", regex_tag="netflix-api", url="https://example.com")
        ]
        asyncio.run(storage1.save_matches(items))

        # Second session simulates server restart
        storage2 = StorageManager(self.output_path, json_metadata=False)
        self.assertEqual(storage2.get_total_unique(), 1)

        # Try inserting the same item again in session 2
        stats = asyncio.run(storage2.save_matches(items))
        self.assertEqual(stats["new"], 0)
        self.assertEqual(stats["duplicates"], 1)

        tag_file = self.output_path / "netflix-api" / "matches.txt"
        lines = tag_file.read_text().strip().splitlines()
        self.assertEqual(len(lines), 1)


if __name__ == "__main__":
    unittest.main()
