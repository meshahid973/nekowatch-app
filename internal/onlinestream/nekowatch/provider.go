package nekowatch

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

const (
	ProviderID        = "nekowatch"
	defaultAPIBaseURL = "http://127.0.0.1:8010"
)

var providerPriority = []string{
	"anikoto",
	"anineko",
	"animegg",
	"reanime",
	"anidbapp",
	"anizone",
	"2dhive",
	"animenosub",
	"allmanga",
	"anibd",
	"senshi",
	"kaa",
	"animedunya",
}

type Provider struct {
	baseURL string
	client  *http.Client
}

type providerEpisodes struct {
	Error    string `json:"error"`
	Episodes struct {
		Sub []apiEpisode `json:"sub"`
		Dub []apiEpisode `json:"dub"`
	} `json:"episodes"`
}

type apiEpisode struct {
	ID     string `json:"id"`
	Number int    `json:"number"`
	Title  string `json:"title"`
}

type watchResponse struct {
	Error     string            `json:"error"`
	Streams   []apiStream       `json:"streams"`
	Subtitles []apiSubtitle     `json:"subtitles"`
	Headers   map[string]string `json:"headers"`
}

type apiStream struct {
	URL      string `json:"url"`
	Type     string `json:"type"`
	Server   string `json:"server"`
	Quality  string `json:"quality"`
	Referer  string `json:"referer"`
	Priority int    `json:"priority"`
	IsActive bool   `json:"isActive"`
}

type apiSubtitle struct {
	URL       string `json:"url"`
	File      string `json:"file"`
	Label     string `json:"label"`
	Language  string `json:"language"`
	Srclang   string `json:"srclang"`
	Default   bool   `json:"default"`
	IsDefault bool   `json:"isDefault"`
}

type episodeRef struct {
	AniListID int
	Audio     string
	Number    int
	Providers []string
}

func New() *Provider {
	return NewWithBaseURL(resolveAPIBaseURL())
}

func NewWithBaseURL(baseURL string) *Provider {
	return &Provider{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		client: &http.Client{
			Timeout: 18 * time.Second,
		},
	}
}

func resolveAPIBaseURL() string {
	for _, key := range []string{"NEKOWATCH_API_URL", "ANIVEXA_API_URL", "ANIME_API_URL", "MIRURO_API_URL"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return strings.TrimRight(value, "/")
		}
	}
	return defaultAPIBaseURL
}

func (p *Provider) Search(opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
	if opts.Media.ID <= 0 {
		return nil, errors.New("nekowatch: missing AniList media ID")
	}

	audio := "sub"
	subOrDub := hibikeonlinestream.Sub
	if opts.Dub {
		audio = "dub"
		subOrDub = hibikeonlinestream.Dub
	}

	title := strings.TrimSpace(opts.Media.RomajiTitle)
	if opts.Media.EnglishTitle != nil && strings.TrimSpace(*opts.Media.EnglishTitle) != "" {
		title = strings.TrimSpace(*opts.Media.EnglishTitle)
	}
	if title == "" {
		title = strings.TrimSpace(opts.Query)
	}
	if title == "" {
		title = fmt.Sprintf("AniList %d", opts.Media.ID)
	}

	return []*hibikeonlinestream.SearchResult{{
		ID:       fmt.Sprintf("%d|%s", opts.Media.ID, audio),
		Title:    title,
		URL:      p.endpoint("episodes", strconv.Itoa(opts.Media.ID)),
		SubOrDub: subOrDub,
	}}, nil
}

func (p *Provider) FindEpisodes(id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
	anilistID, audio, err := parseSearchID(id)
	if err != nil {
		return nil, err
	}

	var payload map[string]json.RawMessage
	if err := p.getJSON(p.endpoint("episodes", strconv.Itoa(anilistID)), &payload); err != nil {
		return nil, fmt.Errorf("nekowatch: fetch episodes: %w", err)
	}

	type mergedEpisode struct {
		Title     string
		Providers []string
	}
	merged := make(map[int]*mergedEpisode)

	for _, providerName := range orderedProviderNames(payload) {
		raw, ok := payload[providerName]
		if !ok {
			continue
		}

		var data providerEpisodes
		if err := json.Unmarshal(raw, &data); err != nil || data.Error != "" {
			continue
		}

		list := data.Episodes.Sub
		if audio == "dub" {
			list = data.Episodes.Dub
		}

		for _, ep := range list {
			if ep.Number <= 0 {
				continue
			}
			item := merged[ep.Number]
			if item == nil {
				item = &mergedEpisode{Title: strings.TrimSpace(ep.Title)}
				merged[ep.Number] = item
			}
			if item.Title == "" && strings.TrimSpace(ep.Title) != "" {
				item.Title = strings.TrimSpace(ep.Title)
			}
			if !containsString(item.Providers, providerName) {
				item.Providers = append(item.Providers, providerName)
			}
		}
	}

	if len(merged) == 0 {
		return nil, fmt.Errorf("nekowatch: no %s episodes found for AniList ID %d", audio, anilistID)
	}

	numbers := make([]int, 0, len(merged))
	for number := range merged {
		numbers = append(numbers, number)
	}
	sort.Ints(numbers)

	ret := make([]*hibikeonlinestream.EpisodeDetails, 0, len(numbers))
	for _, number := range numbers {
		item := merged[number]
		title := item.Title
		if title == "" {
			title = fmt.Sprintf("Episode %d", number)
		}

		ret = append(ret, &hibikeonlinestream.EpisodeDetails{
			Provider: ProviderID,
			ID:       encodeEpisodeRef(episodeRef{AniListID: anilistID, Audio: audio, Number: number, Providers: item.Providers}),
			Number:   number,
			URL:      p.endpoint("episodes", strconv.Itoa(anilistID)),
			Title:    title,
		})
	}

	return ret, nil
}

func (p *Provider) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	if episode == nil {
		return nil, errors.New("nekowatch: missing episode")
	}

	ref, err := decodeEpisodeRef(episode.ID)
	if err != nil {
		return nil, err
	}

	candidates := append([]string(nil), ref.Providers...)
	server = strings.ToLower(strings.TrimSpace(server))
	if server != "" && server != "default" {
		if !containsString(candidates, server) {
			return nil, fmt.Errorf("nekowatch: server %q is not available for episode %d", server, ref.Number)
		}
		candidates = []string{server}
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("nekowatch: no servers available for episode %d", ref.Number)
	}

	var failures []string
	for _, providerName := range candidates {
		result, err := p.fetchEpisodeServer(providerName, ref)
		if err == nil {
			return result, nil
		}
		failures = append(failures, fmt.Sprintf("%s: %v", providerName, err))
	}

	return nil, fmt.Errorf("nekowatch: no playable source for episode %d (%s)", ref.Number, strings.Join(failures, "; "))
}

func (p *Provider) GetSettings() hibikeonlinestream.Settings {
	servers := make([]string, 0, len(providerPriority)+1)
	servers = append(servers, "default")
	servers = append(servers, providerPriority...)
	return hibikeonlinestream.Settings{
		EpisodeServers: servers,
		SupportsDub:    true,
	}
}

func (p *Provider) fetchEpisodeServer(providerName string, ref episodeRef) (*hibikeonlinestream.EpisodeServer, error) {
	watchURL := p.endpoint(
		"watch",
		providerName,
		strconv.Itoa(ref.AniListID),
		ref.Audio,
		fmt.Sprintf("%s-%d", providerName, ref.Number),
	)

	var payload watchResponse
	if err := p.getJSON(watchURL, &payload); err != nil {
		return nil, err
	}
	if payload.Error != "" {
		return nil, errors.New(payload.Error)
	}

	subtitles := convertSubtitles(payload.Subtitles)
	videoSources := make([]*hibikeonlinestream.VideoSource, 0, len(payload.Streams))
	for _, stream := range payload.Streams {
		sourceType := detectVideoSourceType(stream.Type, stream.URL)
		if sourceType == hibikeonlinestream.VideoSourceUnknown {
			continue
		}

		quality := strings.TrimSpace(stream.Quality)
		if quality == "" {
			quality = "auto"
		}
		label := strings.TrimSpace(stream.Server)
		if label == "" {
			label = providerName
		}

		videoSources = append(videoSources, &hibikeonlinestream.VideoSource{
			URL:       stream.URL,
			Type:      sourceType,
			Label:     label,
			Quality:   quality,
			Subtitles: subtitles,
		})
	}

	if len(videoSources) == 0 {
		return nil, errors.New("response contained no playable HLS/MP4 streams")
	}

	headers := make(map[string]string, len(payload.Headers)+1)
	for key, value := range payload.Headers {
		if strings.TrimSpace(key) != "" && strings.TrimSpace(value) != "" {
			headers[key] = value
		}
	}
	if _, ok := headers["Referer"]; !ok {
		for _, stream := range payload.Streams {
			if strings.TrimSpace(stream.Referer) != "" {
				headers["Referer"] = stream.Referer
				break
			}
		}
	}

	return &hibikeonlinestream.EpisodeServer{
		Provider:     ProviderID,
		Server:       providerName,
		Headers:      headers,
		VideoSources: videoSources,
	}, nil
}

func (p *Provider) getJSON(endpoint string, target any) error {
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "NekoWatch-Desktop/0.1.0-dev")

	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		message := strings.TrimSpace(string(body))
		if message == "" {
			message = http.StatusText(resp.StatusCode)
		}
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, message)
	}

	decoder := json.NewDecoder(io.LimitReader(resp.Body, 8<<20))
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("decode JSON: %w", err)
	}
	return nil
}

func (p *Provider) endpoint(parts ...string) string {
	base := strings.TrimRight(p.baseURL, "/")
	for _, part := range parts {
		base += "/" + url.PathEscape(strings.Trim(part, "/"))
	}
	return base
}

func parseSearchID(id string) (int, string, error) {
	parts := strings.Split(id, "|")
	if len(parts) != 2 {
		return 0, "", fmt.Errorf("nekowatch: invalid search ID %q", id)
	}
	anilistID, err := strconv.Atoi(parts[0])
	if err != nil || anilistID <= 0 {
		return 0, "", fmt.Errorf("nekowatch: invalid AniList ID in %q", id)
	}
	audio := strings.ToLower(parts[1])
	if audio != "sub" && audio != "dub" {
		return 0, "", fmt.Errorf("nekowatch: invalid audio mode in %q", id)
	}
	return anilistID, audio, nil
}

func encodeEpisodeRef(ref episodeRef) string {
	return fmt.Sprintf("%d|%s|%d|%s", ref.AniListID, ref.Audio, ref.Number, strings.Join(ref.Providers, ","))
}

func decodeEpisodeRef(value string) (episodeRef, error) {
	parts := strings.SplitN(value, "|", 4)
	if len(parts) != 4 {
		return episodeRef{}, fmt.Errorf("nekowatch: invalid episode ID %q", value)
	}
	anilistID, err := strconv.Atoi(parts[0])
	if err != nil || anilistID <= 0 {
		return episodeRef{}, fmt.Errorf("nekowatch: invalid AniList ID in episode ID %q", value)
	}
	number, err := strconv.Atoi(parts[2])
	if err != nil || number <= 0 {
		return episodeRef{}, fmt.Errorf("nekowatch: invalid episode number in %q", value)
	}
	audio := strings.ToLower(parts[1])
	if audio != "sub" && audio != "dub" {
		return episodeRef{}, fmt.Errorf("nekowatch: invalid audio mode in episode ID %q", value)
	}

	providers := make([]string, 0)
	for _, providerName := range strings.Split(parts[3], ",") {
		providerName = strings.ToLower(strings.TrimSpace(providerName))
		if providerName != "" && !containsString(providers, providerName) {
			providers = append(providers, providerName)
		}
	}

	return episodeRef{AniListID: anilistID, Audio: audio, Number: number, Providers: providers}, nil
}

func orderedProviderNames(payload map[string]json.RawMessage) []string {
	ret := make([]string, 0, len(payload))
	seen := make(map[string]struct{}, len(payload))
	for _, providerName := range providerPriority {
		if _, ok := payload[providerName]; ok {
			ret = append(ret, providerName)
			seen[providerName] = struct{}{}
		}
	}

	var extras []string
	for key := range payload {
		if isEpisodeMetadataKey(key) {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		extras = append(extras, key)
	}
	sort.Strings(extras)
	return append(ret, extras...)
}

func isEpisodeMetadataKey(key string) bool {
	switch key {
	case "page", "type", "mappings", "_unknownProviders":
		return true
	default:
		return false
	}
}

func detectVideoSourceType(kind, rawURL string) hibikeonlinestream.VideoSourceType {
	kind = strings.ToLower(strings.TrimSpace(kind))
	rawURL = strings.ToLower(strings.TrimSpace(rawURL))
	if strings.Contains(kind, "m3u8") || strings.Contains(kind, "hls") || strings.Contains(rawURL, ".m3u8") {
		return hibikeonlinestream.VideoSourceM3U8
	}
	if strings.Contains(kind, "mp4") || strings.Contains(rawURL, ".mp4") {
		return hibikeonlinestream.VideoSourceMP4
	}
	return hibikeonlinestream.VideoSourceUnknown
}

func convertSubtitles(input []apiSubtitle) []*hibikeonlinestream.VideoSubtitle {
	ret := make([]*hibikeonlinestream.VideoSubtitle, 0, len(input))
	for i, subtitle := range input {
		subtitleURL := strings.TrimSpace(subtitle.URL)
		if subtitleURL == "" {
			subtitleURL = strings.TrimSpace(subtitle.File)
		}
		if subtitleURL == "" {
			continue
		}

		language := strings.TrimSpace(subtitle.Srclang)
		if language == "" {
			language = strings.TrimSpace(subtitle.Language)
		}
		if language == "" {
			language = strings.TrimSpace(subtitle.Label)
		}
		if language == "" {
			language = "und"
		}

		ret = append(ret, &hibikeonlinestream.VideoSubtitle{
			ID:        fmt.Sprintf("nekowatch-subtitle-%d", i+1),
			URL:       subtitleURL,
			Language:  language,
			IsDefault: subtitle.Default || subtitle.IsDefault,
		})
	}
	return ret
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
