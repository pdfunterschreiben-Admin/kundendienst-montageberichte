package main

import (
	"encoding/base64"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestFertigOrdnerAusBisGewaehlt(t *testing.T) {
	umgebung(t)
	m := aufruf(t, (&app{}).handleFertig, http.MethodPost, "/api/fertig", `{"datei":"25706666","b64":"`+base64.StdEncoding.EncodeToString([]byte("%PDF-1.7"))+`"}`)
	if m["ok"] != false || m["aus"] != true {
		t.Fatalf("ohne gewählten Ordner darf nichts passieren: %v", m)
	}
	if m := aufruf(t, (&app{}).handleFertigWahl, http.MethodGet, "/api/fertig/ordner", ""); m["pfad"] != "" {
		t.Fatalf("Standard ist kein Ordner: %v", m)
	}
}

func TestFertigLegtAuftragsnummerAlsPdfAb(t *testing.T) {
	umgebung(t)
	ziel := t.TempDir()
	if m := aufruf(t, (&app{}).handleFertigWahl, http.MethodPut, "/api/fertig/ordner", `{"pfad":`+jsonText(ziel)+`}`); m["ok"] != true {
		t.Fatalf("wählen: %v", m)
	}
	pdf := base64.StdEncoding.EncodeToString([]byte("%PDF-1.7 fertig"))
	m := aufruf(t, (&app{}).handleFertig, http.MethodPost, "/api/fertig", `{"datei":"25706666","b64":"`+pdf+`"}`)
	if m["ok"] != true {
		t.Fatalf("ablegen: %v", m)
	}
	b, err := os.ReadFile(filepath.Join(ziel, "25706666.pdf"))
	if err != nil || string(b) != "%PDF-1.7 fertig" {
		t.Fatalf("Datei: %q %v", b, err)
	}
	// Neue Abzeichnung desselben Auftrags: nichts überschreiben, zweite Fassung daneben
	pdf2 := base64.StdEncoding.EncodeToString([]byte("%PDF-1.7 neu"))
	aufruf(t, (&app{}).handleFertig, http.MethodPost, "/api/fertig", `{"datei":"25706666","b64":"`+pdf2+`","kennung":"MB-ABZ-25706666-2"}`)
	if b, _ := os.ReadFile(filepath.Join(ziel, "25706666.pdf")); string(b) != "%PDF-1.7 fertig" {
		t.Fatalf("erste Fassung wurde überschrieben: %q", b)
	}
	if b, _ := os.ReadFile(filepath.Join(ziel, "25706666 (2).pdf")); string(b) != "%PDF-1.7 neu" {
		t.Fatalf("zweite Fassung fehlt: %q", b)
	}
}

func TestFertigNurPdfUndKeinAusbruch(t *testing.T) {
	umgebung(t)
	ziel := t.TempDir()
	aufruf(t, (&app{}).handleFertigWahl, http.MethodPut, "/api/fertig/ordner", `{"pfad":`+jsonText(ziel)+`}`)
	if m := aufruf(t, (&app{}).handleFertig, http.MethodPost, "/api/fertig", `{"datei":"x","b64":"`+base64.StdEncoding.EncodeToString([]byte("kein pdf"))+`"}`); m["ok"] != false {
		t.Fatalf("keine PDF angenommen: %v", m)
	}
	pdf := base64.StdEncoding.EncodeToString([]byte("%PDF-1.7"))
	aufruf(t, (&app{}).handleFertig, http.MethodPost, "/api/fertig", `{"datei":"../../boese","b64":"`+pdf+`"}`)
	if _, err := os.Stat(filepath.Join(filepath.Dir(filepath.Dir(ziel)), "boese.pdf")); err == nil {
		t.Fatalf("Datei außerhalb des Ordners geschrieben")
	}
}

func TestFertigDieselbeAbzeichnungNurEinmal(t *testing.T) {
	umgebung(t)
	ziel := t.TempDir()
	aufruf(t, (&app{}).handleFertigWahl, http.MethodPut, "/api/fertig/ordner", `{"pfad":`+jsonText(ziel)+`}`)
	// Die PDF wird bei jedem Neuerstellen etwas anders (Zeitstempel), die Kennung der Abzeichnung steht darin
	for i, inhalt := range []string{"%PDF-1.7 A MB-ABZ-4711-99", "%PDF-1.7 B MB-ABZ-4711-99"} {
		m := aufruf(t, (&app{}).handleFertig, http.MethodPost, "/api/fertig", `{"datei":"4711","b64":"`+base64.StdEncoding.EncodeToString([]byte(inhalt))+`","kennung":"MB-ABZ-4711-99"}`)
		if m["ok"] != true {
			t.Fatalf("Lauf %d: %v", i, m)
		}
	}
	if _, err := os.Stat(filepath.Join(ziel, "4711 (2).pdf")); err == nil {
		t.Fatalf("dieselbe Abzeichnung wurde doppelt abgelegt")
	}
	// auch von einem anderen Rechner (ohne eigenes Gedächtnis): die Kennung in der Datei zählt
	t.Setenv("APPDATA", t.TempDir())
	_ = os.WriteFile(fertigWahlPfad(), []byte(ziel), 0o600)
	aufruf(t, (&app{}).handleFertig, http.MethodPost, "/api/fertig", `{"datei":"4711","b64":"`+base64.StdEncoding.EncodeToString([]byte("%PDF-1.7 C MB-ABZ-4711-99"))+`","kennung":"MB-ABZ-4711-99"}`)
	if _, err := os.Stat(filepath.Join(ziel, "4711 (2).pdf")); err == nil {
		t.Fatalf("anderer Rechner hat doppelt abgelegt")
	}
}
