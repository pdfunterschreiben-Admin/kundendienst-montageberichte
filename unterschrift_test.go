package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func pngBytes(n int) []byte {
	return append([]byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}, bytes.Repeat([]byte{1}, n)...)
}

func callUnterschrift(t *testing.T, method, body string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	(&app{}).handleUnterschrift(rec, httptest.NewRequest(method, "/api/unterschrift", strings.NewReader(body)))
	var m map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	return rec.Code, m
}

func putB64(t *testing.T, b64 string) map[string]any {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"b64": b64})
	_, m := callUnterschrift(t, http.MethodPut, string(body))
	return m
}

func TestUnterschriftLeer(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	_, m := callUnterschrift(t, http.MethodGet, "")
	if m["ok"] != true || m["vorhanden"] != false || m["b64"] != "" {
		t.Fatalf("leer: %v", m)
	}
}

func TestUnterschriftSpeichernLesenLoeschen(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	b64 := base64.StdEncoding.EncodeToString(pngBytes(50))
	if m := putB64(t, b64); m["ok"] != true {
		t.Fatalf("PUT: %v", m)
	}
	_, m := callUnterschrift(t, http.MethodGet, "")
	if m["vorhanden"] != true || m["b64"] != b64 {
		t.Fatalf("GET nach PUT: %v", m)
	}
	if _, m := callUnterschrift(t, http.MethodDelete, ""); m["ok"] != true {
		t.Fatalf("DELETE: %v", m)
	}
	if _, m := callUnterschrift(t, http.MethodGet, ""); m["vorhanden"] != false {
		t.Fatalf("GET nach DELETE: %v", m)
	}
}

func TestUnterschriftNurEchtesPNG(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	for name, b64 := range map[string]string{
		"kein PNG":    base64.StdEncoding.EncodeToString([]byte("AAAA")),
		"kein Base64": "%%%",
		"JPEG":        base64.StdEncoding.EncodeToString([]byte{0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8}),
	} {
		if m := putB64(t, b64); m["ok"] != false || m["error"] != "Keine gültige PNG-Datei." {
			t.Errorf("%s: %v", name, m)
		}
	}
	if _, m := callUnterschrift(t, http.MethodGet, ""); m["vorhanden"] != false {
		t.Fatalf("abgelehnte Unterschrift wurde gespeichert: %v", m)
	}
}

func TestUnterschriftZuGross(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	m := putB64(t, base64.StdEncoding.EncodeToString(pngBytes(200<<10)))
	if m["ok"] != false || m["error"] != "Unterschrift zu groß." {
		t.Fatalf("zu groß: %v", m)
	}
}

func TestUnterschriftAndereMethode(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	if code, _ := callUnterschrift(t, http.MethodPost, "{}"); code != http.StatusMethodNotAllowed {
		t.Fatalf("POST: %d", code)
	}
}
