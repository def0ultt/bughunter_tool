package main

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type scopeChecker struct {
	patterns     []*regexp.Regexp
	antipatterns []*regexp.Regexp
}

func (s *scopeChecker) inScope(raw string) bool {
	line := strings.TrimSpace(raw)

	// If it's a relative path (e.g. /api/v1/test, ./app.js), keep it!
	if isPath(line) {
		return true
	}

	domain := line
	// Handle protocol-relative URLs (//example.com)
	if strings.HasPrefix(domain, "//") {
		domain = "https:" + domain
	}

	// If it's a URL, pull the hostname out to avoid matching
	// on part of the path or query parameters
	if isURL(domain) {
		var err error
		domain, err = getHostname(domain)
		if err != nil {
			return false
		}
	}

	inScope := false
	for _, p := range s.patterns {
		if p.MatchString(domain) {
			inScope = true
			break
		}
	}

	for _, p := range s.antipatterns {
		if p.MatchString(domain) {
			return false
		}
	}
	return inScope
}

func newScopeChecker(r io.Reader) (*scopeChecker, error) {
	sc := bufio.NewScanner(r)
	s := &scopeChecker{
		patterns: make([]*regexp.Regexp, 0),
	}

	for sc.Scan() {
		p := strings.TrimSpace(sc.Text())
		if p == "" {
			continue
		}

		isAnti := false
		if p[0] == '!' {
			isAnti = true
			p = p[1:]
		}

		re, err := regexp.Compile(p)
		if err != nil {
			return nil, err
		}

		if isAnti {
			s.antipatterns = append(s.antipatterns, re)
		} else {
			s.patterns = append(s.patterns, re)
		}
	}

	return s, nil
}

func main() {
	quickDomain := flag.String("u", "", "quick domain check (matches domain and all its subdomains, e.g. -u datacamp.com)")
	quickRegex := flag.String("E", "", "quick regex pattern check (e.g. -E '^datacamp\\.com$')")
	flag.Parse()

	var checker *scopeChecker

	if *quickDomain != "" || *quickRegex != "" {
		checker = &scopeChecker{
			patterns:     make([]*regexp.Regexp, 0),
			antipatterns: make([]*regexp.Regexp, 0),
		}

		if *quickDomain != "" {
			domains := strings.Split(*quickDomain, ",")
			for _, d := range domains {
				d = strings.TrimSpace(d)
				if d == "" {
					continue
				}
				// Clean protocol or wildcard prefix if user provided them
				d = strings.TrimPrefix(d, "http://")
				d = strings.TrimPrefix(d, "https://")
				d = strings.TrimPrefix(d, "*.")
				d = strings.TrimPrefix(d, ".")
				d = strings.TrimRight(d, "/")

				pat := fmt.Sprintf(`(?i)(^|\.)%s$`, regexp.QuoteMeta(d))
				re, err := regexp.Compile(pat)
				if err != nil {
					fmt.Fprintf(os.Stderr, "invalid domain regex: %s\n", err)
					return
				}
				checker.patterns = append(checker.patterns, re)
			}
		}

		if *quickRegex != "" {
			re, err := regexp.Compile(*quickRegex)
			if err != nil {
				fmt.Fprintf(os.Stderr, "invalid regex pattern: %s\n", err)
				return
			}
			checker.patterns = append(checker.patterns, re)
		}
	} else {
		sf, err := openScopefile()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error opening scope file: %s\n", err)
			return
		}
		defer sf.Close()

		var parseErr error
		checker, parseErr = newScopeChecker(sf)
		if parseErr != nil {
			fmt.Fprintf(os.Stderr, "error parsing scope file: %s\n", parseErr)
			return
		}
	}

	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}

		if checker.inScope(line) {
			fmt.Println(line)
		}
	}
}

func getHostname(s string) (string, error) {
	if strings.HasPrefix(s, "//") {
		s = "https:" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return "", err
	}
	return u.Hostname(), nil
}

func isPath(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	// Starts with "/" but not protocol-relative "//"
	if strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "//") {
		return true
	}
	// Starts with "./" or "../"
	if strings.HasPrefix(s, "./") || strings.HasPrefix(s, "../") {
		return true
	}
	// Relative endpoint without leading slash (e.g. "api/v1/test")
	if slashIdx := strings.Index(s, "/"); slashIdx != -1 {
		prefix := s[:slashIdx]
		if !strings.Contains(prefix, ".") && !strings.Contains(prefix, ":") {
			return true
		}
	}
	return false
}

func isURL(s string) bool {
	s = strings.TrimSpace(strings.ToLower(s))
	return strings.HasPrefix(s, "http:") || strings.HasPrefix(s, "https:") || strings.HasPrefix(s, "//")
}

func openScopefile() (io.ReadCloser, error) {
	pwd, err := filepath.Abs(".")
	if err != nil {
		return nil, err
	}

	for {
		f, err := os.Open(filepath.Join(pwd, ".scope"))

		// found one!
		if err == nil {
			return f, nil
		}

		newPwd := filepath.Dir(pwd)
		if newPwd == pwd {
			break
		}
		pwd = newPwd
	}

	return nil, errors.New("unable to find .scope file in current directory or any parent directory")
}
