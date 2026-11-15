package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// Der Ablageordner ist frei wählbar (z. B. ein Netzlaufwerk). Die Wahl steht in einer eigenen Datei,
// weil einstellungen.json von der Oberfläche als Ganzes überschrieben wird.
func ablageWahlPfad() string { return filepath.Join(dataDir(), "ablageordner.txt") }

func standardAblage() string {
	home, _ := os.UserHomeDir()
	if p := os.Getenv("USERPROFILE"); p != "" {
		home = p
	}
	return filepath.Join(home, "Documents", "Kundendienst Montageberichte")
}

func gewaehlteAblage() string { return gemerkterOrdner(ablageWahlPfad()) }

func istOrdner(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// ablageOrdner: der gewählte Ordner, solange es ihn gibt – sonst der Standard unter Dokumente
func ablageOrdner() string {
	if p := gewaehlteAblage(); p != "" && istOrdner(p) {
		return p
	}
	return standardAblage()
}

// GET: {pfad, standard, gewaehlt, fehlt} · PUT {pfad}: wählen ("" = zurück zum Standard)
func (a *app) handleAblageWahl(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		g := gewaehlteAblage()
		writeJSON(w, map[string]any{"ok": true, "pfad": ablageOrdner(), "standard": standardAblage(), "gewaehlt": g, "fehlt": g != "" && !istOrdner(g)})
	case http.MethodPut:
		var in struct {
			Pfad string `json:"pfad"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": "Ungültige Anfrage."})
			return
		}
		p, err := ordnerMerken(ablageWahlPfad(), in.Pfad)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		if p == "" {
			p = ablageOrdner()
		}
		writeJSON(w, map[string]any{"ok": true, "pfad": p})
	default:
		http.Error(w, "GET oder PUT", http.StatusMethodNotAllowed)
	}
}

// ordnerMerken prüft den Ordner (vorhanden, beschreibbar) und schreibt ihn in die Datei datei.
// Leerer Pfad löscht die Wahl. Rückgabe: der gemerkte Pfad ("" = keiner).
func ordnerMerken(datei, pfad string) (string, error) {
	p := strings.TrimSpace(pfad)
	if p == "" {
		_ = os.Remove(datei)
		return "", nil
	}
	p = filepath.Clean(p)
	if !filepath.IsAbs(p) || !istOrdner(p) {
		return "", errors.New("Diesen Ordner gibt es nicht.")
	}
	probe, err := os.CreateTemp(p, ".schreibtest-*")
	if err != nil {
		return "", errors.New("In diesen Ordner darf nicht geschrieben werden.")
	}
	probe.Close()
	_ = os.Remove(probe.Name())
	if err := os.WriteFile(datei, []byte(p), 0o600); err != nil {
		return "", errors.New("Speichern fehlgeschlagen: " + err.Error())
	}
	return p, nil
}

func gemerkterOrdner(datei string) string {
	b, err := os.ReadFile(datei)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// GET ?pfad=…: Unterordner zum Auswählen. Ohne pfad: Startorte (Dokumente, Desktop, Laufwerke).
func (a *app) handleOrdnerListe(w http.ResponseWriter, r *http.Request) {
	p := strings.TrimSpace(r.URL.Query().Get("pfad"))
	if p == "" {
		var orte []string
		home := filepath.Dir(filepath.Dir(standardAblage()))
		for _, o := range []string{filepath.Join(home, "Documents"), filepath.Join(home, "Desktop")} {
			if istOrdner(o) {
				orte = append(orte, o)
			}
		}
		if runtime.GOOS == "windows" {
			for c := 'A'; c <= 'Z'; c++ {
				if d := string(c) + `:\`; istOrdner(d) {
					orte = append(orte, d)
				}
			}
		} else {
			orte = append(orte, "/")
		}
		writeJSON(w, map[string]any{"ok": true, "pfad": "", "eltern": "", "start": true, "ordner": orte})
		return
	}
	p = filepath.Clean(p)
	eintraege, err := os.ReadDir(p)
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": "Ordner kann nicht gelesen werden."})
		return
	}
	ordner := []string{}
	for _, e := range eintraege {
		n := e.Name()
		if strings.HasPrefix(n, ".") || strings.HasPrefix(n, "$") {
			continue
		}
		if e.IsDir() || (e.Type()&os.ModeSymlink != 0 && istOrdner(filepath.Join(p, n))) {
			ordner = append(ordner, n)
		}
	}
	sort.Slice(ordner, func(i, j int) bool { return strings.ToLower(ordner[i]) < strings.ToLower(ordner[j]) })
	eltern := filepath.Dir(p)
	if eltern == p {
		eltern = "" // Laufwerk oben: zurück zu den Startorten
	}
	writeJSON(w, map[string]any{"ok": true, "pfad": p, "eltern": eltern, "ordner": ordner})
}
