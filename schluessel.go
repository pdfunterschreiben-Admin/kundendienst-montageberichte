package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Verschlüsselte Montageberichte
//
// Die Service-Mappe verschlüsselt jeden Bericht mit dem ÖFFENTLICHEN Schlüssel des Büros, bevor er zum Server
// (Google) geht. Öffnen kann ihn nur, wer den GEHEIMEN Schlüssel hat – dieses Programm. Der geheime Schlüssel
// liegt zusätzlich mit dem Schlüssel-Passwort verschlüsselt auf dem Server, damit jeder Büro-Rechner ihn mit
// dem Passwort einmal einrichten kann. Ohne Passwort kann auch Google ihn nicht öffnen.
//
// Bericht:  "SMB1" | 2 Byte Länge | RSA-OAEP-SHA256(AES-Schlüssel) | 12 Byte Nonce | AES-256-GCM(PDF)
// Schlüssel: "SMK1" | 16 Byte Salz | 4 Byte Runden | 12 Byte Nonce | AES-256-GCM(PKCS#8), Schlüssel = PBKDF2-SHA256(Passwort)

var (
	berichtMagie   = []byte("SMB1")
	schluesselMag  = []byte("SMK1")
	schluesselRund = 600000
)

func schluesselPfad() string { return filepath.Join(dataDir(), "montageberichte-schluessel.pem") }

func lokalerSchluessel() *rsa.PrivateKey {
	b, err := os.ReadFile(schluesselPfad())
	if err != nil {
		return nil
	}
	blk, _ := pem.Decode(b)
	if blk == nil {
		return nil
	}
	k, err := x509.ParsePKCS8PrivateKey(blk.Bytes)
	if err != nil {
		return nil
	}
	rk, _ := k.(*rsa.PrivateKey)
	return rk
}

func fingerabdruck(pub *rsa.PublicKey) string {
	der, _ := x509.MarshalPKIXPublicKey(pub)
	h := sha256.Sum256(der)
	return strings.ToUpper(hex.EncodeToString(h[:6]))
}

func berichtIstVerschluesselt(b []byte) bool { return bytes.HasPrefix(b, berichtMagie) }

func berichtEntschluesseln(k *rsa.PrivateKey, b []byte) ([]byte, error) {
	if len(b) < 6 {
		return nil, errors.New("zu kurz")
	}
	l := int(binary.BigEndian.Uint16(b[4:6]))
	if len(b) < 6+l+12+16 {
		return nil, errors.New("zu kurz")
	}
	aesKey, err := rsa.DecryptOAEP(sha256.New(), nil, k, b[6:6+l], nil)
	if err != nil {
		return nil, errors.New("falscher Schlüssel")
	}
	blk, err := aes.NewCipher(aesKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(blk)
	if err != nil {
		return nil, err
	}
	n := 6 + l
	return gcm.Open(nil, b[n:n+12], b[n+12:], nil)
}

func schluesselSichern(k *rsa.PrivateKey, passwort string) ([]byte, error) {
	der, err := x509.MarshalPKCS8PrivateKey(k)
	if err != nil {
		return nil, err
	}
	salz := make([]byte, 16)
	nonce := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, salz); err != nil {
		return nil, err
	}
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	key, err := pbkdf2.Key(sha256.New, passwort, salz, schluesselRund, 32)
	if err != nil {
		return nil, err
	}
	blk, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(blk)
	out := append(append([]byte{}, schluesselMag...), salz...)
	out = binary.BigEndian.AppendUint32(out, uint32(schluesselRund))
	out = append(out, nonce...)
	return gcm.Seal(out, nonce, der, nil), nil
}

func schluesselOeffnen(b []byte, passwort string) (*rsa.PrivateKey, error) {
	if !bytes.HasPrefix(b, schluesselMag) || len(b) < 4+16+4+12+16 {
		return nil, errors.New("ungültige Schlüsseldatei")
	}
	salz, runden, nonce := b[4:20], int(binary.BigEndian.Uint32(b[20:24])), b[24:36]
	if runden < 100000 || runden > 10000000 {
		return nil, errors.New("ungültige Schlüsseldatei")
	}
	key, err := pbkdf2.Key(sha256.New, passwort, salz, runden, 32)
	if err != nil {
		return nil, err
	}
	blk, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(blk)
	der, err := gcm.Open(nil, nonce, b[36:], nil)
	if err != nil {
		return nil, errors.New("Das Passwort stimmt nicht.")
	}
	k, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, err
	}
	rk, ok := k.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("ungültiger Schlüssel")
	}
	return rk, nil
}

func schluesselLokalSpeichern(k *rsa.PrivateKey) error {
	der, err := x509.MarshalPKCS8PrivateKey(k)
	if err != nil {
		return err
	}
	p := schluesselPfad()
	tmp := p + ".neu"
	if err := os.WriteFile(tmp, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// Anfrage an den Server im Namen des angemeldeten Nutzers
func mbServer(event string, extra map[string]any) (map[string]any, error) {
	var s struct {
		User *reportUser `json:"user"`
	}
	if b, err := os.ReadFile(settingsPath()); err == nil {
		_ = json.Unmarshal(b, &s)
	}
	if s.User == nil || s.User.ID == "" {
		return nil, errors.New("Nicht angemeldet.")
	}
	m := map[string]any{"key": ReportKey, "app": "montageberichte", "id": s.User.ID, "name": s.User.Name,
		"email": s.User.Email, "event": event, "version": Version}
	for k, v := range extra {
		m[k] = v
	}
	payload, _ := json.Marshal(m)
	c := &http.Client{Timeout: 90 * time.Second}
	resp, err := c.Post(ReportURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		return nil, errors.New("Keine Verbindung zum Server.")
	}
	defer resp.Body.Close()
	var r map[string]any
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&r); err != nil {
		return nil, errors.New("Keine gültige Antwort vom Server.")
	}
	if r["ok"] != true {
		e, _ := r["error"].(string)
		if e == "" {
			e = "Der Server hat abgelehnt."
		}
		return nil, errors.New(e)
	}
	return r, nil
}

// GET: Stand  ·  POST {aktion:"erzeugen"|"einrichten", passwort}
func (a *app) handleSchluessel(w http.ResponseWriter, r *http.Request) {
	if !serverOK() {
		writeJSON(w, map[string]any{"ok": false, "error": "Kein Server eingestellt."})
		return
	}
	if r.Method == http.MethodGet {
		out := map[string]any{"ok": true, "lokal": false}
		if k := lokalerSchluessel(); k != nil {
			out["lokal"], out["fp"] = true, fingerabdruck(&k.PublicKey)
		}
		if s, err := mbServer("mb_schluessel_holen", nil); err == nil {
			out["server"] = s["pub"] != nil && s["pub"] != ""
			out["serverFp"] = s["fp"]
		} else {
			out["serverFehler"] = err.Error()
		}
		writeJSON(w, out)
		return
	}
	var in struct {
		Aktion   string `json:"aktion"`
		Passwort string `json:"passwort"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in)
	switch in.Aktion {
	case "erzeugen":
		if len([]rune(in.Passwort)) < 10 {
			writeJSON(w, map[string]any{"ok": false, "error": "Das Passwort muss mindestens 10 Zeichen haben."})
			return
		}
		k, err := rsa.GenerateKey(rand.Reader, 3072)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		gesichert, err := schluesselSichern(k, in.Passwort)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		pubDer, _ := x509.MarshalPKIXPublicKey(&k.PublicKey)
		fp := fingerabdruck(&k.PublicKey)
		if _, err := mbServer("mb_schluessel_setzen", map[string]any{
			"pub":  string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pubDer})),
			"priv": base64.StdEncoding.EncodeToString(gesichert), "fp": fp,
		}); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		if err := schluesselLokalSpeichern(k); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": "Lokal speichern fehlgeschlagen: " + err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "fp": fp})
	case "einrichten":
		s, err := mbServer("mb_schluessel_holen", nil)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		p, _ := s["priv"].(string)
		roh, err := base64.StdEncoding.DecodeString(p)
		if err != nil || p == "" {
			writeJSON(w, map[string]any{"ok": false, "error": "Auf dem Server ist noch kein Schlüssel eingerichtet."})
			return
		}
		k, err := schluesselOeffnen(roh, in.Passwort)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		if err := schluesselLokalSpeichern(k); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": "Lokal speichern fehlgeschlagen: " + err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "fp": fingerabdruck(&k.PublicKey)})
	default:
		writeJSON(w, map[string]any{"ok": false, "error": "Unbekannte Aktion."})
	}
}

// Antwort von mb_datei: verschlüsselte Berichte hier entschlüsseln (die Oberfläche bekommt die PDF wie bisher)
func mbDateiEntschluesseln(body []byte) []byte {
	var r map[string]any
	if json.Unmarshal(body, &r) != nil || r["ok"] != true {
		return body
	}
	s, _ := r["b64"].(string)
	roh, err := base64.StdEncoding.DecodeString(s)
	if err != nil || !berichtIstVerschluesselt(roh) {
		return body
	}
	k := lokalerSchluessel()
	if k == nil {
		b, _ := json.Marshal(map[string]any{"ok": false, "schluessel": true,
			"error": "Dieser Rechner hat den Schlüssel für die verschlüsselten Berichte noch nicht."})
		return b
	}
	pdf, err := berichtEntschluesseln(k, roh)
	if err != nil {
		b, _ := json.Marshal(map[string]any{"ok": false, "schluessel": true,
			"error": "Der Bericht passt nicht zum Schlüssel dieses Rechners – bitte den Schlüssel neu einrichten."})
		return b
	}
	r["b64"] = base64.StdEncoding.EncodeToString(pdf)
	out, _ := json.Marshal(r)
	return out
}
