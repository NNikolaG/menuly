// Package auth implements password hashing, JWT access tokens and opaque
// refresh tokens.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Roles inside a tenant.
const (
	RoleOwner   = "owner"
	RoleManager = "manager"
	RoleStaff   = "staff"
)

var ErrInvalidToken = errors.New("invalid token")

func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// dummyHash is compared against when a user does not exist so that login
// timing does not reveal which emails are registered.
var dummyHash, _ = HashPassword("menuly-timing-equalizer")

func CheckPasswordDummy(pw string) { _ = CheckPassword(dummyHash, pw) }

// Claims carried by an access token.
type Claims struct {
	TenantID uuid.UUID `json:"tid"`
	Role     string    `json:"role"`
	jwt.RegisteredClaims
}

func (c Claims) UserID() (uuid.UUID, error) { return uuid.Parse(c.Subject) }

type Issuer struct {
	secret     []byte
	issuer     string
	accessTTL  time.Duration
	refreshTTL time.Duration
	now        func() time.Time
}

func NewIssuer(secret, issuer string, accessTTL, refreshTTL time.Duration) *Issuer {
	return &Issuer{secret: []byte(secret), issuer: issuer, accessTTL: accessTTL, refreshTTL: refreshTTL, now: time.Now}
}

func (i *Issuer) AccessTTL() time.Duration  { return i.accessTTL }
func (i *Issuer) RefreshTTL() time.Duration { return i.refreshTTL }

func (i *Issuer) IssueAccess(userID, tenantID uuid.UUID, role string) (string, time.Time, error) {
	now := i.now()
	exp := now.Add(i.accessTTL)
	claims := Claims{
		TenantID: tenantID,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			Issuer:    i.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
			ID:        uuid.NewString(),
		},
	}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(i.secret)
	return s, exp, err
}

func (i *Issuer) ParseAccess(token string) (*Claims, error) {
	var c Claims
	_, err := jwt.ParseWithClaims(token, &c, func(t *jwt.Token) (any, error) {
		return i.secret, nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(i.issuer),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(i.now),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}
	if _, err := c.UserID(); err != nil || c.TenantID == uuid.Nil {
		return nil, ErrInvalidToken
	}
	return &c, nil
}

// NewRefreshToken returns an opaque token for the client and the hash that
// is stored in the database.
func NewRefreshToken() (token string, hash []byte, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", nil, err
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	return token, HashRefreshToken(token), nil
}

func HashRefreshToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}
