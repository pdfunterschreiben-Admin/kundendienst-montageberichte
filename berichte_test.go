package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// Anmeldeserver-Nachbildung: merkt sich die letzte Anfrage und antwortet mit {"ok":true}
func testServer(t *testing.T) (*httptest.Server, *map[string]any, *int) {
	t.Helper()
	last := map[string]any{}
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		_ = json.NewDecoder(r.Body).Decode(&last)
		w.Write([]byte(`{"ok":true,"gesehen":true}`))
	}))
	t.Cleanup(srv.Close)
	oldURL, oldKey, oldPrefix := ReportURL, ReportKey, serverPrefix
	ReportURL, ReportKey, serverPrefix = srv.URL, "schluessel", "http://127.0.0.1:"
	t.Cleanup(func() { ReportURL, ReportKey, serverPrefix = oldURL, oldKey, oldPrefix })
	return srv, &last, &n
}

func angemeldet(t *testing.T) {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	if err := os.WriteFile(settingsPath(), []byte(`{"user":{"id":"ID1","name":"Berta","email":"b@x"}}`), 0o644); err != nil {
		t.Fatal(err)
	}
}

func postMb(t *testing.T, body string) string {
	t.Helper()
	rec := httptest.NewRecorder()
	(&app{}).handleMb(rec, httptest.NewRequest(http.MethodPost, "/api/mb", strings.NewReader(body)))
	return rec.Body.String()
}

func TestHandleMbLeitetNeueFelderWeiter(t *testing.T) {
	_, last, _ := testServer(t)
	angemeldet(t)
	out := postMb(t, `{"event":"mb_korrektur","monteur":"m@x","jahr":2026,"kw":46,"auftrag":"4711","bereich":"Arbeitszeit","vorher":"1,5 h","nachher":"2,0 h"}`)
	if !strings.Contains(out, `"gesehen":true`) {
		t.Fatalf("Antwort des Servers kam nicht durch: %s", out)
	}
	for k, want := range map[string]string{"app": "montageberichte", "id": "ID1", "name": "Berta", "email": "b@x", "event": "mb_korrektur",
		"monteur": "m@x", "auftrag": "4711", "bereich": "Arbeitszeit", "vorher": "1,5 h", "nachher": "2,0 h", "key": "schluessel"} {
		if got, _ := (*last)[k].(string); got != want {
			t.Errorf("Feld %s: %q, erwartet %q", k, got, want)
		}
	}
	if (*last)["jahr"] != float64(2026) || (*last)["kw"] != float64(46) {
		t.Errorf("jahr/kw: %v/%v", (*last)["jahr"], (*last)["kw"])
	}
}

func TestHandleMbLeitetGrosseUnterschriftVollstaendigWeiter(t *testing.T) {
	_, last, _ := testServer(t)
	angemeldet(t)
	gross := "iVBOR" + strings.Repeat("A", 100000)
	postMb(t, `{"event":"mb_abzeichnen","monteur":"m@x","jahr":2026,"kw":46,"auftrag":"4711","unterschrift":"`+gross+`"}`)
	if got, _ := (*last)["unterschrift"].(string); got != gross {
		t.Fatalf("Unterschrift kam mit %d statt %d Zeichen an", len(got), len(gross))
	}
}

func TestHandleMbLeitetCodeUndIdWeiter(t *testing.T) {
	_, last, _ := testServer(t)
	angemeldet(t)
	postMb(t, `{"event":"mb_unterschrift_abholen","token":"abc123"}`)
	if (*last)["token"] != "abc123" {
		t.Errorf("token: %v", (*last)["token"])
	}
	postMb(t, `{"event":"mb_unterschrift_datei","datei":"FILE1"}`)
	if (*last)["datei"] != "FILE1" || (*last)["id"] != "ID1" {
		t.Errorf("datei/id: %v/%v (id muss die Rechner-ID bleiben)", (*last)["datei"], (*last)["id"])
	}
}

func TestHandleMbUnbekannteAnfrage(t *testing.T) {
	_, _, n := testServer(t)
	angemeldet(t)
	out := postMb(t, `{"event":"mb_loeschen"}`)
	if !strings.Contains(out, `"error":"Unbekannte Anfrage."`) || *n != 0 {
		t.Fatalf("Antwort %s, Serveraufrufe %d", out, *n)
	}
}

func TestHandleMbUebersichtWirdWeitergereicht(t *testing.T) {
	_, last, _ := testServer(t)
	angemeldet(t)
	if out := postMb(t, `{"event":"mb_uebersicht"}`); !strings.Contains(out, `"gesehen":true`) {
		t.Fatalf("mb_uebersicht wird abgelehnt: %s", out)
	}
	if (*last)["event"] != "mb_uebersicht" {
		t.Fatalf("nicht beim Server angekommen: %v", *last)
	}
}
