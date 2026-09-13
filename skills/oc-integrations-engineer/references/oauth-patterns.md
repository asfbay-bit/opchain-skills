# OAuth 2.0 Integration Patterns

Implementation patterns for OAuth 2.0 on Cloudflare Workers.

---

## Authorization Code Flow (most common)

For services where a user authorizes your app: Salesforce, Google, Slack, GitHub.

### Step 1: Redirect to authorize

```typescript
app.get('/auth/:service/start', (c) => {
  const service = c.req.param('service');
  const config = OAUTH_CONFIGS[service];

  const state = crypto.randomUUID();
  // Store state in KV to verify on callback (CSRF protection)
  await c.env.KV.put(`oauth-state:${state}`, service, { expirationTtl: 600 });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${c.env.BASE_URL}/auth/${service}/callback`,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  });

  return c.redirect(`${config.authorizeUrl}?${params}`);
});
```

### Step 2: Handle callback

```typescript
app.get('/auth/:service/callback', async (c) => {
  const { code, state, error } = c.req.query();

  if (error) return c.json({ error }, 400);

  // Verify state (CSRF protection)
  const storedService = await c.env.KV.get(`oauth-state:${state}`);
  if (!storedService) return c.json({ error: 'Invalid state' }, 400);
  await c.env.KV.delete(`oauth-state:${state}`);

  const service = c.req.param('service');
  const config = OAUTH_CONFIGS[service];

  // Exchange code for tokens
  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: c.env[`${service.toUpperCase()}_CLIENT_SECRET`],
      redirect_uri: `${c.env.BASE_URL}/auth/${service}/callback`,
    }),
  });

  const tokens = await tokenResponse.json();

  // Store tokens securely in KV
  await c.env.KV.put(`tokens:${service}:${userId}`, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  }));

  return c.redirect('/dashboard?connected=' + service);
});
```

### Step 3: Auto-refresh on use

```typescript
async function getAccessToken(kv: KVNamespace, service: string, userId: string, env: Env): Promise<string> {
  const stored = await kv.get(`tokens:${service}:${userId}`, 'json');
  if (!stored) throw new Error(`No tokens for ${service}`);

  // If token is still valid (with 60s buffer), use it
  if (stored.expires_at > Date.now() + 60000) {
    return stored.access_token;
  }

  // Refresh the token
  const config = OAUTH_CONFIGS[service];
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
      client_id: config.clientId,
      client_secret: env[`${service.toUpperCase()}_CLIENT_SECRET`],
    }),
  });

  if (!response.ok) {
    // Refresh failed — user needs to re-authorize
    await kv.delete(`tokens:${service}:${userId}`);
    throw new Error(`Token refresh failed for ${service}. Re-authorization required.`);
  }

  const newTokens = await response.json();
  await kv.put(`tokens:${service}:${userId}`, JSON.stringify({
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token || stored.refresh_token,
    expires_at: Date.now() + (newTokens.expires_in * 1000),
  }));

  return newTokens.access_token;
}
```

---

## Service-Specific Configs

```typescript
const OAUTH_CONFIGS: Record<string, OAuthConfig> = {
  salesforce: {
    authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    clientId: 'from_env',
    scopes: ['api', 'refresh_token'],
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: 'from_env',
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  },
  slack: {
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientId: 'from_env',
    scopes: ['chat:write', 'channels:read'],
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientId: 'from_env',
    scopes: ['repo', 'read:user'],
  },
};
```

---

## Security Checklist for OAuth

- [ ] State parameter generated per request (CSRF protection)
- [ ] State verified on callback before exchanging code
- [ ] Tokens stored in KV with encryption, not in cookies or localStorage
- [ ] Refresh tokens never exposed to the frontend
- [ ] Client secret in wrangler secrets, not in code
- [ ] Token auto-refresh with graceful re-auth on failure
- [ ] Scopes are minimal (request only what you need)
- [ ] Redirect URI is exact-match (no wildcards)
