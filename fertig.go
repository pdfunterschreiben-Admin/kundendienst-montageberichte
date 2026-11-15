package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Ordner für fertige (abgezeichnete) Berichte, z. B. ein Netzlaufwerk, das die IT anlegt. Dort holt das Büro
// die Aufträge zur Weiterbearbeitung ab. Ohne gewählten Ordner wird nichts kopiert.
// Ablage flach: <Ordner>\<Auftragsnummer>.pdf – eine neue Abzeichnung ersetzt die Datei.
func fertigWahlPfad() string { return filepath.Join(dataDir(), "fertigordner.txt") }

func fertigOrdner() string { return gemerkterOrdner(fertigWahlPfad()) }

// GET: {pfad, fehlt} · PUT {pfad}: wählen ("" = aus)
func (a *app) handleFertigWahl(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		p := fertigOrdner()
		writeJSON(w, map[string]any{"ok": true, "pfad": p, "fehlt": p != "" && !istOrdner(p)})
	case http.MethodPut:
		var in struct {
			Pfad string `json:"pfad"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": "Ungültige Anfrage."})
			return
		}
		p, err := ordnerMerken(fertigWahlPfad(), in.Pfad)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "pfad": p})
	default:
		http.Error(w, "GET oder PUT", http.StatusMethodNotAllowed)
	}
}

// POST {datei, b64}: abgezeichnete PDF in den Fertig-Ordner legen
func (a *app) handleFertig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST", http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		Datei string `json:"datei"`
		B64   string `json:"b64"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 80<<20)).Decode(&in); err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": "Ungültige Anfrage."})
		return
	}
	ziel := fertigOrdner()
	if ziel == "" {
		writeJSON(w, map[string]any{"ok": false, "aus": true})
		return
	}
	if !istOrdner(ziel) {
		writeJSON(w, map[string]any{"ok": false, "error": "Der Ordner für fertige Berichte ist nicht erreichbar: " + ziel})
		return
	}
	n := sauber(strings.TrimSuffix(in.Datei, ".pdf"))
	data, err := base64.StdEncoding.DecodeString(in.B64)
	if n == "" || err != nil || !bytes.HasPrefix(data, []byte("%PDF")) {
		writeJSON(w, map[string]any{"ok": false, "error": "Keine gültige PDF."})
		return
	}
	p := filepath.Join(ziel, n+".pdf")
	tmp := p + ".neu"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": "Speichern fehlgeschlagen: " + err.Error()})
		return
	}
	_ = os.Remove(p)
	if err := os.Rename(tmp, p); err != nil {
		_ = os.Remove(tmp)
		writeJSON(w, map[string]any{"ok": false, "error": "Speichern fehlgeschlagen: " + err.Error()})
		return
	}
	writeJSON(w, map[string]any{"ok": true, "pfad": p})
}
