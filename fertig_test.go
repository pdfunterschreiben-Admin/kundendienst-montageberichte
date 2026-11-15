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
	// Nochmal abgezeichnet: wird ersetzt
	pdf2 := base64.StdEncoding.EncodeToString([]byte("%PDF-1.7 neu"))
	aufruf(t, (&app{}).handleFertig, http.MethodPost, "/api/fertig", `{"datei":"25706666","b64":"`+pdf2+`"}`)
	if b, _ := os.ReadFile(filepath.Join(ziel, "25706666.pdf")); string(b) != "%PDF-1.7 neu" {
		t.Fatalf("nicht ersetzt: %q", b)
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
