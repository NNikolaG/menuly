// Package mail sends transactional emails (invitations, password reset).
// Without SMTP settings messages are only logged, which is what local
// development and tests use.
package mail

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Message struct {
	To      string
	Subject string
	Text    string
}

type Mailer interface {
	Send(ctx context.Context, m Message) error
}

// Log writes messages to the log instead of sending them.
type Log struct{}

func (Log) Send(ctx context.Context, m Message) error {
	slog.InfoContext(ctx, "email (not sent, SMTP not configured)", "to", m.To, "subject", m.Subject, "body", m.Text)
	return nil
}

// Memory keeps messages, for tests.
type Memory struct {
	mu   sync.Mutex
	Sent []Message
}

func (m *Memory) Send(_ context.Context, msg Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Sent = append(m.Sent, msg)
	return nil
}

// Last returns the last message sent to addr.
func (m *Memory) Last(addr string) (Message, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := len(m.Sent) - 1; i >= 0; i-- {
		if strings.EqualFold(m.Sent[i].To, addr) {
			return m.Sent[i], true
		}
	}
	return Message{}, false
}

// SMTP sends through an SMTP server with STARTTLS when offered (port 587)
// and PLAIN auth when a username is set.
type SMTP struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string // "Menuly <no-reply@menuly.app>"
}

func (s SMTP) Send(ctx context.Context, m Message) error {
	addr := net.JoinHostPort(s.Host, strconv.Itoa(s.Port))
	var auth smtp.Auth
	if s.Username != "" {
		auth = smtp.PlainAuth("", s.Username, s.Password, s.Host)
	}
	from := s.From
	if i := strings.LastIndex(from, "<"); i >= 0 {
		from = strings.Trim(from[i:], "<>")
	}
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\n",
		s.From, m.To, mimeHeader(m.Subject), time.Now().Format(time.RFC1123Z))
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n")
	b.WriteString(strings.ReplaceAll(m.Text, "\n", "\r\n"))
	done := make(chan error, 1)
	go func() { done <- smtp.SendMail(addr, auth, from, []string{m.To}, []byte(b.String())) }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// mimeHeader encodes non-ASCII subjects (č, ć, š, ž, đ).
func mimeHeader(s string) string {
	for _, r := range s {
		if r > 127 {
			return "=?UTF-8?B?" + b64(s) + "?="
		}
	}
	return s
}

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }
