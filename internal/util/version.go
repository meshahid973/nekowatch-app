package util

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/Masterminds/semver/v3"
)

func IsValidBasicSemver(version string) bool {
	parts := strings.Split(version, ".")
	if len(parts) != 3 { return false }
	for _, part := range parts {
		if _, err := strconv.Atoi(part); err != nil { return false }
	}
	return true
}

func CompareVersion(current string, b string) (comp int, shouldUpdate bool) {
	currV, err := semver.NewVersion(current)
	if err != nil { return 0, false }
	otherV, err := semver.NewVersion(b)
	if err != nil { return 0, false }

	comp = currV.Compare(otherV)
	if comp == 0 { return 0, false }

	if currV.GreaterThan(otherV) {
		shouldUpdate = false
		if currV.Major() > otherV.Major() { comp *= 3 } else if currV.Minor() > otherV.Minor() { comp *= 2 } else if currV.Patch() > otherV.Patch() { comp *= 1 }
	} else if currV.LessThan(otherV) {
		shouldUpdate = true
		if currV.Major() < otherV.Major() { comp *= 3 } else if currV.Minor() < otherV.Minor() { comp *= 2 } else if currV.Patch() < otherV.Patch() { comp *= 1 }
	}
	return comp, shouldUpdate
}

func VersionIsOlderThan(version string, compare string) bool {
	comp, shouldUpdate := CompareVersion(version, compare)
	return comp < 0 && shouldUpdate
}

// NekoWatch owns fork releases. The upstream Seanime owner remains allowed for
// inherited compatibility assets while those mirrors are migrated.
var allowedGitHubOwners = []string{"meshahid973", "5rahim"}

func ValidateReleaseUrl(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil { return fmt.Errorf("malformed URL") }
	if parsed.Scheme != "https" { return fmt.Errorf("only HTTPS URLs are allowed") }

	switch parsed.Host {
	case "github.com":
		parts := strings.Split(strings.TrimPrefix(parsed.Path, "/"), "/")
		if len(parts) < 6 || parts[2] != "releases" || parts[3] != "download" {
			return fmt.Errorf("URL must point to a GitHub release asset")
		}
		owner := parts[0]
		for _, allowed := range allowedGitHubOwners {
			if strings.EqualFold(owner, allowed) { return nil }
		}
		return fmt.Errorf("repository owner %q is not allowed", owner)
	case "seanime.app":
		return nil
	default:
		return fmt.Errorf("host %q is not allowed", parsed.Host)
	}
}
