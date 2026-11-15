package main

import (
	"net/http"
	"net/http/httptest"
	neturl "net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func pdfAbrufen(t *testing.T, q neturl.Values, methode string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	(&app{}).handleAblagePdf(rec, httptest.NewRequest(methode, "/api/ablage/pdf?"+q.Encode(), nil))
	return rec
}

func abfrage(monteur, datei string) neturl.Values {
	return neturl.Values{"monteur": {monteur}, "jahr": {"2026"}, "kw": {"46"}, "datei": {datei}}
}

func TestAblagePdfLiefertDieDatei(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	ordner, _ := kwOrdner("Max Muster", 2026, 46)
	_ = os.MkdirAll(ordner, 0o755)
	_ = os.WriteFile(filepath.Join(ordner, "12345.pdf"), []byte("%PDF-1.7 test"), 0o644)
	rec := pdfAbrufen(t, abfrage("Max Muster", "12345"), http.MethodGet)
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "application/pdf" || rec.Body.String() != "%PDF-1.7 test" {
		t.Fatalf("%d %q %q", rec.Code, rec.Header().Get("Content-Type"), rec.Body.String())
	}
	if !strings.HasPrefix(rec.Header().Get("Content-Disposition"), "inline") {
		t.Errorf("muss im Fenster angezeigt werden: %q", rec.Header().Get("Content-Disposition"))
	}
}

func TestAblagePdfNichtVorhanden(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	if rec := pdfAbrufen(t, abfrage("Max Muster", "99999"), http.MethodGet); rec.Code != 404 {
		t.Fatalf("fehlende Datei: %d", rec.Code)
	}
}

func TestAblagePdfKeinAusbruchAusDemOrdner(t *testing.T) {
	home := t.TempDir()
	t.Setenv("USERPROFILE", home)
	_ = os.WriteFile(filepath.Join(home, "geheim.pdf"), []byte("GEHEIM"), 0o644)
	for _, datei := range []string{"../../../../geheim", `..\..\..\..\geheim`, "../../geheim.pdf"} {
		rec := pdfAbrufen(t, abfrage("Max Muster", datei), http.MethodGet)
		if rec.Code == 200 || strings.Contains(rec.Body.String(), "GEHEIM") {
			t.Errorf("%q kam aus dem Ablageordner heraus", datei)
		}
	}
	if rec := pdfAbrufen(t, abfrage("../..", "x"), http.MethodGet); rec.Code == 200 {
		t.Errorf("Monteur-Name mit .. wurde angenommen")
	}
}

func TestAblagePdfNurLesen(t *testing.T) {
	t.Setenv("USERPROFILE", t.TempDir())
	if rec := pdfAbrufen(t, abfrage("Max Muster", "1"), http.MethodPost); rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST: %d", rec.Code)
	}
}
