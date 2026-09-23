import unittest
from pathlib import Path
from regexhunter.security import (
    validate_token,
    is_allowed_origin,
    sanitize_tag_and_resolve_dir,
    get_or_create_token
)


class TestSecurity(unittest.TestCase):
    def test_token_validation(self):
        token = "test_token_secret_12345"
        self.assertTrue(validate_token("Bearer test_token_secret_12345", token))
        self.assertTrue(validate_token("test_token_secret_12345", token))
        self.assertFalse(validate_token("Bearer wrong_token", token))
        self.assertFalse(validate_token("", token))
        self.assertFalse(validate_token(None, token))

    def test_origin_validation(self):
        # Direct or extension origins allowed
        self.assertTrue(is_allowed_origin(None))
        self.assertTrue(is_allowed_origin(""))
        self.assertTrue(is_allowed_origin("chrome-extension://abcdefghijklmnop"))

        # Malicious web pages trying to scan/hit localhost rejected
        self.assertFalse(is_allowed_origin("https://evil.com"))
        self.assertFalse(is_allowed_origin("http://attacker.site"))
        self.assertTrue(is_allowed_origin("http://localhost:3000"))
        self.assertTrue(is_allowed_origin("http://127.0.0.1:8899"))


    def test_tag_path_traversal_prevention(self):
        base_dir = Path("/tmp/regexhunter_results")

        # Valid tags
        d1 = sanitize_tag_and_resolve_dir(base_dir, "netflix-api")
        self.assertEqual(d1.name, "netflix-api")

        d2 = sanitize_tag_and_resolve_dir(base_dir, "aws_endpoints_v1")
        self.assertEqual(d2.name, "aws_endpoints_v1")

        # Path traversal attempts
        with self.assertRaises(ValueError):
            sanitize_tag_and_resolve_dir(base_dir, "../something")

        with self.assertRaises(ValueError):
            sanitize_tag_and_resolve_dir(base_dir, "../../etc/passwd")

        with self.assertRaises(ValueError):
            sanitize_tag_and_resolve_dir(base_dir, "tag/subtag")

        with self.assertRaises(ValueError):
            sanitize_tag_and_resolve_dir(base_dir, "tag\\subtag")

        with self.assertRaises(ValueError):
            sanitize_tag_and_resolve_dir(base_dir, "tag; rm -rf /")

        with self.assertRaises(ValueError):
            sanitize_tag_and_resolve_dir(base_dir, "a" * 65)  # too long


if __name__ == "__main__":
    unittest.main()
