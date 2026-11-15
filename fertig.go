package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Ordner für fertige (abgezeichnete) Berichte, z. B. ein Netzlaufwerk, das die IT anlegt. Dort holt das Büro
// die Aufträge zur Weiterbearbeitung ab. Ohne gewählten Ordner wird nichts kopiert.
// Ablage flach: <Ordner>\<Auftragsnummer>.pdf. Es wird nie überschrieben: eine neue Abzeichnung desselben
// Auftrags heißt „<Nr> (2).pdf“ usw. Dieselbe Abzeichnung (Kennung, steht auch in der PDF) kommt nur einmal hin.
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
		Datei   string `json:"datei"`
		B64     string `json:"b64"`
		Kennung string `json:"kennung"`
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
	if in.Kennung != "" {
		if f := schonAbgelegt(ziel, n, in.Kennung); f != "" {
			writeJSON(w, map[string]any{"ok": true, "pfad": f, "schon": true})
			return
		}
	}
	p := filepath.Join(ziel, n+".pdf")
	for i := 2; ; i++ {
		if _, err := os.Stat(p); os.IsNotExist(err) {
			break
		}
		if i > 999 {
			writeJSON(w, map[string]any{"ok": false, "error": "Zu viele Fassungen von " + n + "."})
			return
		}
		p = filepath.Join(ziel, fmt.Sprintf("%s (%d).pdf", n, i))
	}
	tmp := p + ".neu"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": "Speichern fehlgeschlagen: " + err.Error()})
		return
	}
	if err := os.Rename(tmp, p); err != nil {
		_ = os.Remove(tmp)
		writeJSON(w, map[string]any{"ok": false, "error": "Speichern fehlgeschlagen: " + err.Error()})
		return
	}
	if in.Kennung != "" {
		merkeAbgelegt(in.Kennung, p)
	}
	writeJSON(w, map[string]any{"ok": true, "pfad": p})
}

// Schon abgelegt? Erst im eigenen Gedächtnis (auch wenn das Büro die Datei inzwischen weggenommen hat),
// dann in den Dateien „<Nr>.pdf“ und „<Nr> (k).pdf“ im Ordner (falls ein anderer Rechner sie abgelegt hat).
func fertigLogPfad() string { return filepath.Join(dataDir(), "fertig-abgelegt.json") }

func fertigLog() map[string]string {
	m := map[string]string{}
	if b, err := os.ReadFile(fertigLogPfad()); err == nil {
		_ = json.Unmarshal(b, &m)
	}
	return m
}

func merkeAbgelegt(kennung, pfad string) {
	m := fertigLog()
	m[kennung] = pfad
	if b, err := json.Marshal(m); err == nil {
		_ = os.WriteFile(fertigLogPfad(), b, 0o600)
	}
}

func schonAbgelegt(ziel, n, kennung string) string {
	if p, ok := fertigLog()[kennung]; ok {
		return p
	}
	eintraege, err := os.ReadDir(ziel)
	if err != nil {
		return ""
	}
	for _, e := range eintraege {
		name := e.Name()
		if e.IsDir() || !(name == n+".pdf" || (strings.HasPrefix(name, n+" (") && strings.HasSuffix(name, ").pdf"))) {
			continue
		}
		p := filepath.Join(ziel, name)
		if b, err := os.ReadFile(p); err == nil && bytes.Contains(b, []byte(kennung)) {
			merkeAbgelegt(kennung, p)
			return p
		}
	}
	return ""
}
