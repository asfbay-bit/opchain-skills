# Security Audit Checklist

Detailed checks organized by attack surface. Code-auditor's SKILL.md gives the overview;
this document gives the implementation details for each check.

---

## 1. Secrets & Credentials

### Hardcoded Secrets
```bash
# Search for common secret patterns
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" \
  -E "(api[_-]?key|secret|password|token|credential|auth).*['\"][A-Za-z0-9+/=]{16,}['\"]" . \
  | grep -v node_modules | grep -v .git | grep -v test | grep -v mock

# Search for AWS-style keys
grep -rn -E "AKIA[0-9A-Z]{16}" . | grep -v node_modules

# Search for private keys
grep -rn "BEGIN (RSA |EC |DSA )?PRIVATE KEY" . | grep -v node_modules

# Search for common env var patterns used inline
grep -rn -E "(sk-|sk_live_|pk_live_|ghp_|gho_|github_pat_)" . | grep -v node_modules | grep -v .env
```

### .env Exposure
```bash
# Check if .env is gitignored
grep -q "^\.env$" .gitignore 2>/dev/null && echo ".env is gitignored" || echo "WARNING: .env NOT in .gitignore"

# Check if .env was ever committed
git log --all --full-history -- .env 2>/dev/null | head -5

# Check for .env.example completeness
if [[ -f .env.example ]]; then
  echo "=== .env.example exists ==="
  # Compare keys (not values) between .env and .env.example
  diff <(grep -oP '^[A-Z_]+' .env 2>/dev/null | sort) <(grep -oP '^[A-Z_]+' .env.example | sort) 2>/dev/null
else
  echo "WARNING: No .env.example found"
fi
```

---

## 2. Authentication & Authorization

### Auth Middleware Coverage
```bash
# For Hono: find routes without auth middleware
grep -rn "app\.\(get\|post\|put\|patch\|delete\)" --include="*.ts" . | grep -v node_modules | grep -v test

# For Express: same pattern
grep -rn "router\.\(get\|post\|put\|patch\|delete\)" --include="*.ts" --include="*.js" . | grep -v node_modules

# For FastAPI: find routes without Depends(auth)
grep -rn "@app\.\(get\|post\|put\|patch\|delete\)" --include="*.py" . | grep -v test
```

Then manually check: does each route that writes data or returns user-specific data
have auth middleware applied?

### Session Management
- [ ] Session tokens have expiration
- [ ] Session tokens are HttpOnly cookies (not localStorage)
- [ ] Session invalidation on logout actually works
- [ ] Session fixation protection (regenerate on login)
- [ ] Concurrent session limit (if applicable)

### Password Handling (if applicable)
- [ ] Passwords hashed with bcrypt/argon2/scrypt (not MD5/SHA)
- [ ] No password in logs or error messages
- [ ] Rate limiting on login endpoint
- [ ] Account lockout after N failures (or progressive delay)

---

## 3. Input Validation & Injection

### SQL Injection
```bash
# Search for string concatenation in queries
grep -rn --include="*.ts" --include="*.js" --include="*.py" \
  -E "(SELECT|INSERT|UPDATE|DELETE|WHERE).*\+" . \
  | grep -v node_modules | grep -v test | grep -v ".sql"

# Search for template literals in queries
grep -rn --include="*.ts" --include="*.js" \
  -E "(SELECT|INSERT|UPDATE|DELETE|WHERE).*\$\{" . \
  | grep -v node_modules | grep -v test
```

### XSS
```bash
# Search for dangerouslySetInnerHTML in React
grep -rn "dangerouslySetInnerHTML" --include="*.tsx" --include="*.jsx" . | grep -v node_modules

# Search for innerHTML assignments
grep -rn "\.innerHTML\s*=" --include="*.ts" --include="*.js" . | grep -v node_modules

# Search for unescaped template rendering
grep -rn "v-html\|{{{" --include="*.vue" --include="*.hbs" . | grep -v node_modules
```

### Missing Input Validation
For each POST/PUT/PATCH endpoint, check:
- [ ] Request body has a schema validator (Zod, Yup, Pydantic, Joi)
- [ ] Path parameters are type-checked
- [ ] Query parameters are validated
- [ ] File uploads have size limits and type checks

---

## 4. CORS & Headers

```bash
# Search for CORS configuration
grep -rn -i "cors\|access-control" --include="*.ts" --include="*.js" --include="*.py" . \
  | grep -v node_modules | grep -v test
```

Check:
- [ ] CORS origin is not `*` when credentials are used
- [ ] CORS methods are restricted to what's needed
- [ ] Security headers present: X-Content-Type-Options, X-Frame-Options,
      Strict-Transport-Security, Content-Security-Policy

---

## 5. Rate Limiting

- [ ] Auth endpoints (login, signup, password reset) have rate limiting
- [ ] API endpoints have per-user or per-IP rate limits
- [ ] Rate limit is enforced at the edge (Cloudflare, API gateway) not just in code
- [ ] Rate limit responses return 429 with Retry-After header

---

## 6. Dependency Vulnerabilities

```bash
# Node.js
npm audit --json 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    vulns = data.get('vulnerabilities', {})
    if not vulns:
        print('No known vulnerabilities')
    for name, info in sorted(vulns.items(), key=lambda x: {'critical':0,'high':1,'moderate':2,'low':3}.get(x[1].get('severity','low'), 4)):
        sev = info.get('severity', '?')
        title = info.get('title', info.get('via', [{}])[0].get('title', '?') if isinstance(info.get('via', [{}])[0], dict) else '?')
        print(f'{sev:10s} {name}: {title}')
except: print('Could not parse npm audit output')
"

# Python
pip-audit --format=json 2>/dev/null || echo "pip-audit not available"
```

---

## 7. Cloudflare-Specific (Workers/D1/KV)

If the project runs on Cloudflare Workers:

- [ ] Secrets are in wrangler.toml `[vars]` or Workers secrets (not hardcoded)
- [ ] D1 queries use parameterized statements (`.bind()`)
- [ ] KV keys don't contain user secrets
- [ ] R2 buckets have appropriate access controls
- [ ] Service bindings use least-privilege
- [ ] `wrangler.toml` doesn't contain production secrets

```bash
# Check wrangler.toml for secrets
grep -n "password\|secret\|token\|key" wrangler.toml 2>/dev/null | grep -vi "binding\|name\|account_id\|compatibility"
```
