import unittest
import re


class TestRegexPatterns(unittest.TestCase):
    def test_netflix_example_regex(self):
        pattern = r"https?:\/\/([a-z0-9-]{1,}[\.])*api\.([a-z0-9-]{1,}[\.])*netflix\.[a-z\.]+\/"
        compiled = re.compile(pattern, re.IGNORECASE)

        sample_text = """
        Here are some results found in code search:
        - Found url: https://api.netflix.net/
        - Staging url: https://foo.api.netflix.net/
        - Prod url: https://bar.api.netflix.com/
        - Unrelated: https://google.com/
        - Netflix web: https://www.netflix.com/browse
        """

        matches = [m.group(0) for m in compiled.finditer(sample_text)]
        self.assertEqual(len(matches), 3)
        self.assertIn("https://api.netflix.net/", matches)
        self.assertIn("https://foo.api.netflix.net/", matches)
        self.assertIn("https://bar.api.netflix.com/", matches)

    def test_aws_s3_regex(self):
        pattern = r"[a-z0-9.-]+\.s3([.-][a-z0-9-]+)?\.amazonaws\.com"
        compiled = re.compile(pattern, re.IGNORECASE)

        sample_text = "Target bucket: confidential-backup.s3.us-west-2.amazonaws.com and data.s3.amazonaws.com"
        matches = [m.group(0) for m in compiled.finditer(sample_text)]
        self.assertEqual(len(matches), 2)
        self.assertIn("confidential-backup.s3.us-west-2.amazonaws.com", matches)
        self.assertIn("data.s3.amazonaws.com", matches)


if __name__ == "__main__":
    unittest.main()
