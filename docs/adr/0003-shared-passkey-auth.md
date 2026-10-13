# 0003. Authentication: one shared passkey
**Status:** accepted (2026-10-13)

**Decision.** All IR users sign in with one passkey set by the owner as an environment variable (stored hashed). A signed httpOnly session cookie keeps them signed in; failed attempts are rate-limited using the Neon `login_attempts` table.

**Trade-offs.** No per-person audit trail, and rotating the passkey means telling everyone. Accepted for speed; per-person Google sign-in can replace it later without changing the rest of the app.
