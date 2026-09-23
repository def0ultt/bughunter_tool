package main

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

func init() {
	flag.Usage = func() {
		h := []string{
			"Request URLs provided on stdin fairly frickin' fast",
			"",
			"Options:",
			"  -b, --body <data>         Request body",
			"  -c, --concurrency <num>   Maximum concurrent requests (default: 20, 0 for unlimited)",
			"  -d, --delay <delay>       Delay between issuing requests (ms)",
			"  -H, --header <header>     Add a header to the request (can be specified multiple times)",
			"      --header-only         Save only response headers, skip saving body",
			"      --ignore-html         Don't save HTML files; useful when looking non-HTML files only",
			"      --ignore-empty        Don't save empty files",
			"      --js-beautify         Format and beautify saved JavaScript files using js-beautify",
			"  -k, --keep-alive          Use HTTP Keep-Alive",
			"  -m, --method              HTTP method to use (default: GET, or POST if body is specified)",
			"  -M, --match <string>      Save responses that include <string> in the body",
			"  -o, --output <dir>        Directory to save responses in (will be created)",
			"  -s, --save-status <code>  Save responses with given status code (can be specified multiple times)",
			"  -S, --save                Save all responses",
			"  -t, --timeout <time>      HTTP request timeout (e.g. 10s, 5000ms, or seconds, default: 10s)",
			"  -x, --proxy <proxyURL>    Use the provided HTTP proxy",
			"",
		}

		fmt.Fprintf(os.Stderr, strings.Join(h, "\n"))
	}
}

func main() {

	var requestBody string
	flag.StringVar(&requestBody, "body", "", "")
	flag.StringVar(&requestBody, "b", "", "")

	var concurrency int
	flag.IntVar(&concurrency, "concurrency", 20, "")
	flag.IntVar(&concurrency, "c", 20, "")

	var keepAlives bool
	flag.BoolVar(&keepAlives, "keep-alive", false, "")
	flag.BoolVar(&keepAlives, "keep-alives", false, "")
	flag.BoolVar(&keepAlives, "k", false, "")

	var saveResponses bool
	flag.BoolVar(&saveResponses, "save", false, "")
	flag.BoolVar(&saveResponses, "S", false, "")

	var delayMs int
	flag.IntVar(&delayMs, "delay", 100, "")
	flag.IntVar(&delayMs, "d", 100, "")

	var method string
	flag.StringVar(&method, "method", "GET", "")
	flag.StringVar(&method, "m", "GET", "")

	var match string
	flag.StringVar(&match, "match", "", "")
	flag.StringVar(&match, "M", "", "")

	var outputDir string
	flag.StringVar(&outputDir, "output", "out", "")
	flag.StringVar(&outputDir, "o", "out", "")

	var headers headerArgs
	flag.Var(&headers, "header", "")
	flag.Var(&headers, "H", "")

	var saveStatus saveStatusArgs
	flag.Var(&saveStatus, "save-status", "")
	flag.Var(&saveStatus, "s", "")

	var proxy string
	flag.StringVar(&proxy, "proxy", "", "")
	flag.StringVar(&proxy, "x", "", "")

	var ignoreHTMLFiles bool
	flag.BoolVar(&ignoreHTMLFiles, "ignore-html", false, "")

	var ignoreEmpty bool
	flag.BoolVar(&ignoreEmpty, "ignore-empty", false, "")

	var headerOnly bool
	flag.BoolVar(&headerOnly, "header-only", false, "")
	flag.BoolVar(&headerOnly, "headers-only", false, "")

	var jsBeautify bool
	flag.BoolVar(&jsBeautify, "js-beautify", false, "")

	var timeoutStr string
	flag.StringVar(&timeoutStr, "timeout", "10", "")
	flag.StringVar(&timeoutStr, "t", "10", "")

	flag.Parse()

	timeout := parseTimeout(timeoutStr)
	delay := time.Duration(delayMs * 1000000)
	client := newClient(keepAlives, proxy, timeout)
	prefix := outputDir

	var sem chan struct{}
	if concurrency > 0 {
		sem = make(chan struct{}, concurrency)
	}

	// regex for determining if something is probably HTML. You might
	// think that checking the content-type response header would be a better
	// idea, and you might be right - but if there's one thing I've learnt
	// about webservers it's that they are dirty, rotten, filthy liars.
	isHTML := regexp.MustCompile(`(?i)<html`)

	var wg sync.WaitGroup

	sc := bufio.NewScanner(os.Stdin)

	for sc.Scan() {

		rawURL := sc.Text()
		if strings.TrimSpace(rawURL) == "" {
			continue
		}

		if sem != nil {
			sem <- struct{}{}
		}

		wg.Add(1)
		if delay > 0 {
			time.Sleep(delay)
		}

		go func(rawURL string) {
			defer func() {
				if sem != nil {
					<-sem
				}
				wg.Done()
			}()

			// create the request
			var b io.Reader
			if requestBody != "" {
				b = strings.NewReader(requestBody)

				// Can't send a body with a GET request
				if method == "GET" {
					method = "POST"
				}
			}

			_, err := url.ParseRequestURI(rawURL)
			if err != nil {
				return
			}

			req, err := http.NewRequest(method, rawURL, b)
			if err != nil {
				fmt.Fprintf(os.Stderr, "failed to create request: %s\n", err)
				return
			}

			// add headers to the request
			for _, h := range headers {
				parts := strings.SplitN(h, ":", 2)

				if len(parts) != 2 {
					continue
				}
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				req.Header.Set(key, val)
			}

			// send the request
			resp, err := client.Do(req)
			if err != nil {
				fmt.Fprintf(os.Stderr, "request failed: %s\n", err)
				return
			}
			defer resp.Body.Close()

			// we want to read the body into a string or something like that so we can provide options to
			// not save content based on a pattern or something like that
			responseBody, err := ioutil.ReadAll(resp.Body)
			if err != nil {
				fmt.Fprintf(os.Stderr, "failed to read body: %s\n", err)
				return
			}

			shouldSave := saveResponses || len(saveStatus) > 0 && saveStatus.Includes(resp.StatusCode)

			// If we've been asked to ignore HTML files then we should really do that.
			// But why would you want to ignore HTML files? Sometimes you're looking at
			// a ton of hosts for config files and that sort of thing, and they lie to you
			// by sending a 200 response code instead of a 404. Those pages are *usually*
			// HTML so providing a way to ignore them cuts down on clutter a little bit,
			// even if it is a niche use-case.
			if ignoreHTMLFiles {
				shouldSave = shouldSave && !isHTML.Match(responseBody)
			}

			// sometimes we don't about the response at all if it's empty
			if ignoreEmpty {
				shouldSave = shouldSave && len(bytes.TrimSpace(responseBody)) != 0
			}

			// if a -M/--match option has been used, we always want to save if it matches
			if match != "" {
				if bytes.Contains(responseBody, []byte(match)) {
					shouldSave = true
				}
			}

			if !shouldSave {
				fmt.Printf("%s %d\n", rawURL, resp.StatusCode)
				return
			}

			// output files are stored in prefix/domain/dir/base-(body|headers)
			bodyPath, headersPath := getFilePaths(prefix, req.URL, resp.Header.Get("Content-Type"))
			err = os.MkdirAll(path.Dir(headersPath), 0750)
			if err != nil {
				fmt.Fprintf(os.Stderr, "failed to create dir: %s\n", err)
				return
			}

			if !headerOnly {
				// write the response body to a file
				err = ioutil.WriteFile(bodyPath, responseBody, 0644)
				if err != nil {
					fmt.Fprintf(os.Stderr, "failed to write file contents: %s\n", err)
					return
				}

				if jsBeautify && isJavaScript(req.URL, resp.Header.Get("Content-Type"), bodyPath) {
					if err := beautifyJSFile(bodyPath); err != nil {
						fmt.Fprintf(os.Stderr, "failed to beautify js file %s: %s\n", bodyPath, err)
					}
				}
			}

			// create the headers file
			headersFile, err := os.Create(headersPath)
			if err != nil {
				fmt.Fprintf(os.Stderr, "failed to create file: %s\n", err)
				return
			}
			defer headersFile.Close()

			var buf strings.Builder

			// put the request URL and method at the top
			buf.WriteString(fmt.Sprintf("%s %s\n\n", method, rawURL))

			// add the request headers
			for _, h := range headers {
				parts := strings.SplitN(h, ":", 2)
				if len(parts) == 2 {
					buf.WriteString(fmt.Sprintf("> %s: %s\n", strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])))
				} else {
					buf.WriteString(fmt.Sprintf("> %s\n", h))
				}
			}
			buf.WriteRune('\n')

			// add the request body
			if requestBody != "" {
				buf.WriteString(requestBody)
				buf.WriteString("\n\n")
			}

			// add the proto and status
			buf.WriteString(fmt.Sprintf("< %s %s\n", resp.Proto, resp.Status))

			// add the response headers
			for k, vs := range resp.Header {
				for _, v := range vs {
					buf.WriteString(fmt.Sprintf("< %s: %s\n", k, v))
				}
			}

			// add the response body
			_, err = io.Copy(headersFile, strings.NewReader(buf.String()))
			if err != nil {
				fmt.Fprintf(os.Stderr, "failed to write file contents: %s\n", err)
				return
			}

			// output the filename for each URL
			if headerOnly {
				fmt.Printf("%s: %s %d\n", headersPath, rawURL, resp.StatusCode)
			} else {
				fmt.Printf("%s: %s %d\n", bodyPath, rawURL, resp.StatusCode)
			}
		}(rawURL)
	}

	wg.Wait()

}

func newClient(keepAlives bool, proxy string, timeout time.Duration) *http.Client {

	dialTimeout := timeout
	if dialTimeout > 10*time.Second {
		dialTimeout = 10 * time.Second
	}

	tr := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     time.Second,
		DisableKeepAlives:   !keepAlives,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
		DialContext: (&net.Dialer{
			Timeout:   dialTimeout,
			KeepAlive: time.Second,
		}).DialContext,
	}

	if proxy != "" {
		if p, err := url.Parse(proxy); err == nil {
			tr.Proxy = http.ProxyURL(p)
		}
	}

	re := func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}

	return &http.Client{
		Transport:     tr,
		CheckRedirect: re,
		Timeout:       timeout,
	}

}

func parseTimeout(s string) time.Duration {
	s = strings.TrimSpace(s)
	if s == "" {
		return 10 * time.Second
	}
	if d, err := time.ParseDuration(s); err == nil {
		return d
	}
	if n, err := strconv.Atoi(s); err == nil {
		if n > 120 {
			return time.Duration(n) * time.Millisecond
		}
		return time.Duration(n) * time.Second
	}
	return 10 * time.Second
}

type headerArgs []string

func (h *headerArgs) Set(val string) error {
	*h = append(*h, val)
	return nil
}

func (h headerArgs) String() string {
	return strings.Join(h, ", ")
}

type saveStatusArgs []int

func (s *saveStatusArgs) Set(val string) error {
	i, _ := strconv.Atoi(val)
	*s = append(*s, i)
	return nil
}

func (s saveStatusArgs) String() string {
	return "string"
}

func (s saveStatusArgs) Includes(search int) bool {
	for _, status := range s {
		if status == search {
			return true
		}
	}
	return false
}

func getFilePaths(prefix string, u *url.URL, contentType string) (string, string) {
	host := u.Hostname()
	if host == "" {
		host = "unknown"
	}

	urlPath := u.Path
	var dir, base string

	if urlPath == "" || urlPath == "/" {
		dir = ""
		base = "index"
	} else if strings.HasSuffix(urlPath, "/") {
		dir = strings.Trim(urlPath, "/")
		base = "index"
	} else {
		urlPath = strings.TrimPrefix(urlPath, "/")
		dir = path.Dir(urlPath)
		base = path.Base(urlPath)
		if dir == "." {
			dir = ""
		}
	}

	// Clean path to prevent directory traversal
	dir = path.Clean("/" + dir)
	dir = strings.TrimPrefix(dir, "/")
	if dir == "." {
		dir = ""
	}

	// Sanitize dir and base
	reDir := regexp.MustCompile(`[^a-zA-Z0-9._/-]+`)
	dir = reDir.ReplaceAllString(dir, "-")

	reBase := regexp.MustCompile(`[^a-zA-Z0-9._-]+`)
	base = reBase.ReplaceAllString(base, "-")
	if base == "" || base == "." || base == ".." {
		base = "index"
	}

	// Smart file naming: if base has no extension, infer one from Content-Type
	if path.Ext(base) == "" || path.Ext(base) == "." {
		if ext := extensionForContentType(contentType); ext != "" {
			base = strings.TrimSuffix(base, ".") + ext
		}
	}

	bodyFile := base + "-body"
	headersFile := base + "-headers"

	bodyPath := path.Join(prefix, host, dir, bodyFile)
	headersPath := path.Join(prefix, host, dir, headersFile)

	return bodyPath, headersPath
}

func extensionForContentType(contentType string) string {
	if contentType == "" {
		return ""
	}

	mimeType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))

	switch {
	case mimeType == "application/json" || strings.HasSuffix(mimeType, "+json"):
		return ".json"
	case mimeType == "text/html":
		return ".html"
	case mimeType == "application/xml" || mimeType == "text/xml" || strings.HasSuffix(mimeType, "+xml"):
		return ".xml"
	case mimeType == "text/javascript" || mimeType == "application/javascript" || mimeType == "application/x-javascript":
		return ".js"
	case mimeType == "text/css":
		return ".css"
	case mimeType == "text/plain":
		return ".txt"
	case mimeType == "image/png":
		return ".png"
	case mimeType == "image/jpeg":
		return ".jpg"
	case mimeType == "image/gif":
		return ".gif"
	case mimeType == "image/svg+xml":
		return ".svg"
	case mimeType == "image/webp":
		return ".webp"
	case mimeType == "application/pdf":
		return ".pdf"
	case mimeType == "application/zip":
		return ".zip"
	case mimeType == "application/gzip":
		return ".gz"
	}

	return ""
}

func isJavaScript(u *url.URL, contentType string, bodyPath string) bool {
	if contentType != "" {
		mime := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
		switch mime {
		case "text/javascript", "application/javascript", "application/x-javascript", "text/ecmascript", "application/ecmascript":
			return true
		}
	}

	urlPath := strings.ToLower(u.Path)
	if strings.HasSuffix(urlPath, ".js") || strings.HasSuffix(urlPath, ".mjs") || strings.HasSuffix(urlPath, ".cjs") {
		return true
	}

	base := strings.ToLower(path.Base(bodyPath))
	if strings.Contains(base, ".js-body") || strings.Contains(base, ".mjs-body") || strings.Contains(base, ".cjs-body") {
		return true
	}

	return false
}

func beautifyJSFile(filePath string) error {
	cmdName := "js-beautify"
	if p, err := exec.LookPath("js-beautify"); err == nil {
		cmdName = p
	} else if p, err := exec.LookPath("js-beautify.cmd"); err == nil {
		cmdName = p
	}

	cmd := exec.Command(cmdName, "-r", "-q", filePath)
	return cmd.Run()
}


