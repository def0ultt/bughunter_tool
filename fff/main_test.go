package main

import (
	"net/url"
	"os"
	"path"
	"strings"
	"testing"
	"time"
)

func TestGetFilePaths(t *testing.T) {
	prefix := "out"
	tests := []struct {
		rawURL         string
		contentType    string
		expectedBody   string
		expectedHeader string
	}{
		{
			rawURL:         "https://example.com/api/test?foo=bar",
			contentType:    "application/json; charset=utf-8",
			expectedBody:   path.Join("out", "example.com", "api", "test.json-body"),
			expectedHeader: path.Join("out", "example.com", "api", "test.json-headers"),
		},
		{
			rawURL:         "https://example.com/api/test?foo=bar",
			contentType:    "",
			expectedBody:   path.Join("out", "example.com", "api", "test-body"),
			expectedHeader: path.Join("out", "example.com", "api", "test-headers"),
		},
		{
			rawURL:         "https://example.com/script.js",
			contentType:    "application/javascript",
			expectedBody:   path.Join("out", "example.com", "script.js-body"),
			expectedHeader: path.Join("out", "example.com", "script.js-headers"),
		},
		{
			rawURL:         "https://example.com/",
			contentType:    "text/html; charset=UTF-8",
			expectedBody:   path.Join("out", "example.com", "index.html-body"),
			expectedHeader: path.Join("out", "example.com", "index.html-headers"),
		},
		{
			rawURL:         "https://example.com/admin/",
			contentType:    "text/html",
			expectedBody:   path.Join("out", "example.com", "admin", "index.html-body"),
			expectedHeader: path.Join("out", "example.com", "admin", "index.html-headers"),
		},
		{
			rawURL:         "https://example.com/api/error",
			contentType:    "application/problem+json",
			expectedBody:   path.Join("out", "example.com", "api", "error.json-body"),
			expectedHeader: path.Join("out", "example.com", "api", "error.json-headers"),
		},
		{
			rawURL:         "https://example.com/a/b/c/app.min.js?v=123",
			contentType:    "application/javascript",
			expectedBody:   path.Join("out", "example.com", "a/b/c", "app.min.js-body"),
			expectedHeader: path.Join("out", "example.com", "a/b/c", "app.min.js-headers"),
		},
	}

	for _, tt := range tests {
		u, err := url.Parse(tt.rawURL)
		if err != nil {
			t.Fatalf("failed to parse url %s: %v", tt.rawURL, err)
		}
		bPath, hPath := getFilePaths(prefix, u, tt.contentType)
		if bPath != tt.expectedBody {
			t.Errorf("url %s (%s): expected body path %s, got %s", tt.rawURL, tt.contentType, tt.expectedBody, bPath)
		}
		if hPath != tt.expectedHeader {
			t.Errorf("url %s (%s): expected header path %s, got %s", tt.rawURL, tt.contentType, tt.expectedHeader, hPath)
		}
	}
}

func TestParseTimeout(t *testing.T) {
	tests := []struct {
		input    string
		expected time.Duration
	}{
		{"5s", 5 * time.Second},
		{"500ms", 500 * time.Millisecond},
		{"10", 10 * time.Second},
		{"3", 3 * time.Second},
		{"5000", 5000 * time.Millisecond},
		{"", 10 * time.Second},
		{"invalid", 10 * time.Second},
	}

	for _, tt := range tests {
		got := parseTimeout(tt.input)
		if got != tt.expected {
			t.Errorf("parseTimeout(%q) = %v; want %v", tt.input, got, tt.expected)
		}
	}
}

func TestIsJavaScript(t *testing.T) {
	tests := []struct {
		rawURL      string
		contentType string
		bodyPath    string
		expected    bool
	}{
		{"https://example.com/app.js", "application/javascript", "out/example.com/app.js-body", true},
		{"https://example.com/main.mjs", "", "out/example.com/main.mjs-body", true},
		{"https://example.com/dynamic-script", "text/javascript", "out/example.com/dynamic-script.js-body", true},
		{"https://example.com/api/bundle", "application/x-javascript; charset=utf-8", "out/example.com/api/bundle-body", true},
		{"https://example.com/index.html", "text/html", "out/example.com/index.html-body", false},
		{"https://example.com/api/users", "application/json", "out/example.com/api/users.json-body", false},
	}

	for _, tt := range tests {
		u, _ := url.Parse(tt.rawURL)
		got := isJavaScript(u, tt.contentType, tt.bodyPath)
		if got != tt.expected {
			t.Errorf("isJavaScript(%s, %s, %s) = %v; want %v", tt.rawURL, tt.contentType, tt.bodyPath, got, tt.expected)
		}
	}
}

func TestBeautifyJSFile(t *testing.T) {
	tmpFile := path.Join(t.TempDir(), "test.js")
	err := os.WriteFile(tmpFile, []byte("function foo(a,b){return a+b;}"), 0644)
	if err != nil {
		t.Fatal(err)
	}
	err = beautifyJSFile(tmpFile)
	if err != nil {
		t.Fatalf("beautifyJSFile failed: %v", err)
	}
	data, _ := os.ReadFile(tmpFile)
	t.Logf("Beautified content:\n%s", string(data))
	if !strings.Contains(string(data), "\n") {
		t.Errorf("File was not beautified: %s", string(data))
	}
}


