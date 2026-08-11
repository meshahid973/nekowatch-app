package nekowatch

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

func TestProviderSubDubAndPlayback(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/episodes/16498", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"page": 1,
			"type": "all",
			"anikoto": map[string]any{
				"episodes": map[string]any{
					"sub": []map[string]any{{"id": "watch/anikoto/16498/sub/anikoto-1", "number": 1, "title": "The Journey Begins"}},
					"dub": []map[string]any{{"id": "watch/anikoto/16498/dub/anikoto-1", "number": 1, "title": "The Journey Begins"}},
				},
			},
			"anineko": map[string]any{
				"episodes": map[string]any{
					"sub": []map[string]any{{"id": "watch/anineko/16498/sub/anineko-1", "number": 1, "title": "The Journey Begins"}},
					"dub": []map[string]any{},
				},
			},
		})
	})

	mux.HandleFunc("/watch/anikoto/16498/sub/anikoto-1", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"provider unavailable"}`, http.StatusBadGateway)
	})

	mux.HandleFunc("/watch/anineko/16498/sub/anineko-1", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"streams": []map[string]any{{
				"url":    "https://media.example/ep1/master.m3u8",
				"type":   "hls",
				"server": "NekoHLS",
			}},
			"subtitles": []map[string]any{{
				"file":    "https://media.example/ep1/en.vtt",
				"label":   "English",
				"srclang": "en",
				"default": true,
			}},
			"headers": map[string]string{
				"User-Agent": "NekoWatch-Test",
				"Referer":    "https://video.example/",
			},
		})
	})

	mux.HandleFunc("/watch/anikoto/16498/dub/anikoto-1", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"streams": []map[string]any{{
				"url":     "https://media.example/ep1-dub.mp4",
				"type":    "mp4",
				"server":  "DubMP4",
				"quality": "1080p",
			}},
			"subtitles": []map[string]any{},
			"headers":   map[string]string{"Referer": "https://dub.example/"},
		})
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	provider := NewWithBaseURL(server.URL)

	english := "Frieren: Beyond Journey's End"
	subResults, err := provider.Search(hibikeonlinestream.SearchOptions{
		Media: hibikeonlinestream.Media{
			ID:           16498,
			EnglishTitle: &english,
			RomajiTitle:  "Sousou no Frieren",
		},
	})
	if err != nil {
		t.Fatalf("sub search failed: %v", err)
	}
	if len(subResults) != 1 || subResults[0].ID != "16498|sub" || subResults[0].SubOrDub != hibikeonlinestream.Sub {
		t.Fatalf("unexpected sub search result: %#v", subResults)
	}

	subEpisodes, err := provider.FindEpisodes(subResults[0].ID)
	if err != nil {
		t.Fatalf("sub episodes failed: %v", err)
	}
	if len(subEpisodes) != 1 || subEpisodes[0].Number != 1 {
		t.Fatalf("unexpected sub episodes: %#v", subEpisodes)
	}
	if !strings.Contains(subEpisodes[0].ID, "anikoto,anineko") {
		t.Fatalf("expected provider candidates in episode id, got %q", subEpisodes[0].ID)
	}

	subServer, err := provider.FindEpisodeServer(subEpisodes[0], "default")
	if err != nil {
		t.Fatalf("default sub server failed: %v", err)
	}
	if subServer.Server != "anineko" {
		t.Fatalf("expected fallback to anineko, got %q", subServer.Server)
	}
	if got := subServer.Headers["Referer"]; got != "https://video.example/" {
		t.Fatalf("missing referer header, got %q", got)
	}
	if len(subServer.VideoSources) != 1 || subServer.VideoSources[0].Type != hibikeonlinestream.VideoSourceM3U8 {
		t.Fatalf("expected HLS source, got %#v", subServer.VideoSources)
	}
	if len(subServer.VideoSources[0].Subtitles) != 1 || subServer.VideoSources[0].Subtitles[0].Language != "en" || !subServer.VideoSources[0].Subtitles[0].IsDefault {
		t.Fatalf("unexpected subtitles: %#v", subServer.VideoSources[0].Subtitles)
	}

	dubResults, err := provider.Search(hibikeonlinestream.SearchOptions{
		Media: hibikeonlinestream.Media{
			ID:           16498,
			EnglishTitle: &english,
		},
		Dub: true,
	})
	if err != nil {
		t.Fatalf("dub search failed: %v", err)
	}
	if len(dubResults) != 1 || dubResults[0].ID != "16498|dub" || dubResults[0].SubOrDub != hibikeonlinestream.Dub {
		t.Fatalf("unexpected dub search result: %#v", dubResults)
	}

	dubEpisodes, err := provider.FindEpisodes(dubResults[0].ID)
	if err != nil {
		t.Fatalf("dub episodes failed: %v", err)
	}
	dubServer, err := provider.FindEpisodeServer(dubEpisodes[0], "anikoto")
	if err != nil {
		t.Fatalf("dub server failed: %v", err)
	}
	if len(dubServer.VideoSources) != 1 || dubServer.VideoSources[0].Type != hibikeonlinestream.VideoSourceMP4 || dubServer.VideoSources[0].Quality != "1080p" {
		t.Fatalf("unexpected dub source: %#v", dubServer.VideoSources)
	}
}

func TestSettingsExposeDefaultAndDub(t *testing.T) {
	settings := NewWithBaseURL("http://127.0.0.1:8010").GetSettings()
	if !settings.SupportsDub {
		t.Fatal("expected dub support")
	}
	if len(settings.EpisodeServers) == 0 || settings.EpisodeServers[0] != "default" {
		t.Fatalf("expected default server first, got %#v", settings.EpisodeServers)
	}
}
