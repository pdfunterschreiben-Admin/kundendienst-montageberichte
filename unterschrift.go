package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

// Die Unterschrift liegt nur lokal, je Windows-Benutzer: %APPDATA%\Kundendienst Montageberichte\unterschrift.png
// Zum Server geht sie erst beim Abzeichnen (mb_abzeichnen).
const maxUnterschrift = 150 << 10

func unterschriftPfad() string { return filepath.Join(dataDir(), "unterschrift.png") }

// GET: {ok, vorhanden, b64} · PUT {b64}: speichern (nur PNG) · DELETE: entfernen
func (a *app) handleUnterschrift(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		b, err := os.ReadFile(unterschriftPfad())
		if err != nil {
			writeJSON(w, map[string]any{"ok": true, "vorhanden": false, "b64": ""})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "vorhanden": true, "b64": base64.StdEncoding.EncodeToString(b)})
	case http.MethodPut:
		var in struct {
			B64 string `json:"b64"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": "Ungültige Anfrage."})
			return
		}
		data, err := base64.StdEncoding.DecodeString(in.B64)
		if err != nil || !bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")) {
			writeJSON(w, map[string]any{"ok": false, "error": "Keine gültige PNG-Datei."})
			return
		}
		if len(data) > maxUnterschrift {
			writeJSON(w, map[string]any{"ok": false, "error": "Unterschrift zu groß."})
			return
		}
		ziel := unterschriftPfad()
		tmp := ziel + ".neu"
		if err := os.WriteFile(tmp, data, 0o600); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": "Speichern fehlgeschlagen: " + err.Error()})
			return
		}
		if err := os.Rename(tmp, ziel); err != nil {
			_ = os.Remove(tmp)
			writeJSON(w, map[string]any{"ok": false, "error": "Speichern fehlgeschlagen: " + err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	case http.MethodDelete:
		_ = os.Remove(unterschriftPfad())
		writeJSON(w, map[string]any{"ok": true})
	default:
		http.Error(w, "GET, PUT oder DELETE", http.StatusMethodNotAllowed)
	}
}
