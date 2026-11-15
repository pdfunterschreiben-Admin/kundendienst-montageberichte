package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func aufruf(t *testing.T, h http.HandlerFunc, methode, url, body string) map[string]any {
	t.Helper()
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(methode, url, strings.NewReader(body)))
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("keine JSON-Antwort (%d): %s", rec.Code, rec.Body.String())
	}
	return m
}

func umgebung(t *testing.T) string {
	home := t.TempDir()
	t.Setenv("USERPROFILE", home)
	t.Setenv("APPDATA", t.TempDir())
	return home
}

func TestAblageOrdnerStandardUndWechsel(t *testing.T) {
	home := umgebung(t)
	standard := filepath.Join(home, "Documents", "Kundendienst Montageberichte")
	if ablageOrdner() != standard {
		t.Fatalf("Standard: %s", ablageOrdner())
	}
	ziel := t.TempDir()
	m := aufruf(t, (&app{}).handleAblageWahl, http.MethodPut, "/api/ablage/ordner", `{"pfad":`+jsonText(ziel)+`}`)
	if m["ok"] != true || m["pfad"] != ziel {
		t.Fatalf("PUT: %v", m)
	}
	if ablageOrdner() != ziel {
		t.Fatalf("nach dem Wechsel: %s", ablageOrdner())
	}
	d, _ := kwOrdner("Max Muster", 2026, 45)
	if !strings.HasPrefix(d, ziel) {
		t.Fatalf("KW-Ordner liegt nicht im gewählten Ordner: %s", d)
	}
	m = aufruf(t, (&app{}).handleAblageWahl, http.MethodPut, "/api/ablage/ordner", `{"pfad":""}`)
	if m["ok"] != true || ablageOrdner() != standard {
		t.Fatalf("zurück zum Standard: %v %s", m, ablageOrdner())
	}
}

func TestAblageOrdnerNurVorhandeneOrdner(t *testing.T) {
	umgebung(t)
	datei := filepath.Join(t.TempDir(), "x.txt")
	_ = os.WriteFile(datei, []byte("x"), 0o644)
	for _, p := range []string{filepath.Join(t.TempDir(), "gibtsnicht"), datei, "relativ\\ordner"} {
		m := aufruf(t, (&app{}).handleAblageWahl, http.MethodPut, "/api/ablage/ordner", `{"pfad":`+jsonText(p)+`}`)
		if m["ok"] != false {
			t.Errorf("%q wurde angenommen", p)
		}
	}
}

func TestAblageOrdnerVerschwundenGiltStandard(t *testing.T) {
	home := umgebung(t)
	ziel := filepath.Join(t.TempDir(), "netz")
	_ = os.Mkdir(ziel, 0o755)
	aufruf(t, (&app{}).handleAblageWahl, http.MethodPut, "/api/ablage/ordner", `{"pfad":`+jsonText(ziel)+`}`)
	_ = os.Remove(ziel)
	m := aufruf(t, (&app{}).handleAblageWahl, http.MethodGet, "/api/ablage/ordner", "")
	if m["fehlt"] != true || m["gewaehlt"] != ziel {
		t.Fatalf("verschwundener Ordner muss gemeldet werden: %v", m)
	}
	_ = home
}

func TestOrdnerListe(t *testing.T) {
	umgebung(t)
	basis := t.TempDir()
	for _, n := range []string{"Bremen", "aachen", "Celle"} {
		_ = os.Mkdir(filepath.Join(basis, n), 0o755)
	}
	_ = os.WriteFile(filepath.Join(basis, "datei.pdf"), []byte("x"), 0o644)
	m := aufruf(t, (&app{}).handleOrdnerListe, http.MethodGet, "/api/ordner?pfad="+basis, "")
	got, _ := json.Marshal(m["ordner"])
	if m["ok"] != true || string(got) != `["aachen","Bremen","Celle"]` || m["eltern"] != filepath.Dir(basis) {
		t.Fatalf("%v", m)
	}
	if m := aufruf(t, (&app{}).handleOrdnerListe, http.MethodGet, "/api/ordner?pfad="+filepath.Join(basis, "fehlt"), ""); m["ok"] != false {
		t.Fatalf("fehlender Ordner: %v", m)
	}
	if m := aufruf(t, (&app{}).handleOrdnerListe, http.MethodGet, "/api/ordner", ""); m["ok"] != true || len(m["ordner"].([]any)) == 0 {
		t.Fatalf("Startliste (Laufwerke/Orte): %v", m)
	}
}

func jsonText(s string) string { b, _ := json.Marshal(s); return string(b) }
