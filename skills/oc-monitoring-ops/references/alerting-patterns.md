# Alerting Patterns

Channel setup, alert transport code, SLO math, and escalation patterns.

---

## Alert Channel Setup

### Telegram (aidops default — free, instant, mobile)

**Setup:**
1. Create a bot via @BotFather → get `BOT_TOKEN`
2. Create a group/channel, add the bot → get `CHAT_ID`
3. Store both as wrangler secrets:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```

**Transport:**
```typescript
// src/lib/alerting.ts
interface AlertPayload {
  severity: "info" | "warn" | "critical";
  title: string;
  message: string;
  project: string;
  timestamp?: string;
}

export async function sendTelegramAlert(env: Env, alert: AlertPayload) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  const emoji = { info: "ℹ️", warn: "⚠️", critical: "🚨" }[alert.severity];
  const text = [
    `${emoji} *${alert.severity.toUpperCase()}* — ${alert.project}`,
    `*${alert.title}*`,
    alert.message,
    `_${alert.timestamp || new Date().toISOString()}_`,
  ].join("\n");

  await fetch(`https://oc-api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  }).catch(() => console.error("Telegram alert delivery failed"));
}
```

### Slack (team environments)

**Setup:**
1. Create a Slack app → add Incoming Webhooks → get webhook URL
2. Store as secret: `npx wrangler secret put SLACK_WEBHOOK_URL`

**Transport:**
```typescript
export async function sendSlackAlert(env: Env, alert: AlertPayload) {
  if (!env.SLACK_WEBHOOK_URL) return;

  const color = { info: "#36a64f", warn: "#ffa500", critical: "#ff0000" }[alert.severity];

  await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attachments: [{
        color,
        title: `${alert.severity.toUpperCase()}: ${alert.title}`,
        text: alert.message,
        footer: alert.project,
        ts: Math.floor(Date.now() / 1000),
      }],
    }),
  }).catch(() => console.error("Slack alert delivery failed"));
}
```

### PagerDuty (on-call teams, T3)

**Transport:**
```typescript
export async function sendPagerDutyAlert(env: Env, alert: AlertPayload) {
  if (!env.PAGERDUTY_ROUTING_KEY) return;

  const severity = alert.severity === "critical" ? "critical" :
                   alert.severity === "warn" ? "warning" : "info";

  await fetch("https://events.pagerduty.com/v2/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      routing_key: env.PAGERDUTY_ROUTING_KEY,
      event_action: "trigger",
      payload: {
        summary: `[${alert.project}] ${alert.title}`,
        severity,
        source: alert.project,
        custom_details: { message: alert.message },
      },
    }),
  }).catch(() => console.error("PagerDuty alert delivery failed"));
}
```

### Unified Alert Dispatcher

```typescript
// src/lib/alerting.ts — continued
export async function dispatchAlert(env: Env, alert: AlertPayload) {
  // Send to all configured channels
  const dispatchers = [
    env.TELEGRAM_BOT_TOKEN && sendTelegramAlert(env, alert),
    env.SLACK_WEBHOOK_URL && sendSlackAlert(env, alert),
    env.PAGERDUTY_ROUTING_KEY && sendPagerDutyAlert(env, alert),
  ].filter(Boolean);

  await Promise.allSettled(dispatchers);
}
```

---

## SLO / Error Budget Math

### Definitions

- **SLI (Service Level Indicator):** A quantitative measure of service health
  (e.g., "proportion of requests faster than 500ms")
- **SLO (Service Level Objective):** A target for an SLI (e.g., "99% of requests
  under 500ms over a 30-day window")
- **Error Budget:** The amount of unreliability you can tolerate before violating
  the SLO. `Error Budget = 1 - SLO`

### Error Budget Calculation

```
Monthly error budget:

SLO 99%    → 1% budget → 7.3 hours downtime/month → 14.4 min/day
SLO 99.9%  → 0.1% budget → 43.8 min downtime/month → 1.4 min/day
SLO 99.99% → 0.01% budget → 4.4 min downtime/month → 8.6 sec/day
```

For aidops-scale apps, 99% (7.3 hours/month) is plenty. That's roughly one full
outage per month with time to spare. Don't chase nines you don't need.

### Burn Rate Alerting

Instead of alerting on instantaneous SLO violation, alert when the error budget
is being consumed too fast.

```
Burn rate = actual error rate / error budget rate

If SLO = 99% over 30 days:
  Error budget rate = 1% / 30 days = 0.033% per day
  
  Burn rate 1.0 = using budget at exactly the planned pace
  Burn rate 14.4 = will exhaust budget in ~2 days
  Burn rate 36.0 = will exhaust budget in ~20 hours
```

**Multi-window alerting (Google SRE approach):**

| Alert | Long Window | Short Window | Burn Rate | Budget Consumed | Action |
|---|---|---|---|---|---|
| Page (critical) | 1 hour | 5 min | 14.4 | 2% in 1h | Wake someone up |
| Ticket (warn) | 6 hours | 30 min | 6.0 | 5% in 6h | Investigate today |
| Log (info) | 3 days | 6 hours | 1.0 | 10% in 3d | Track, investigate this week |

**Why two windows:** The long window prevents flapping (brief spike → recover → alert
→ resolve → repeat). The short window ensures the problem is still happening NOW, not
a historical blip.

### SLO Implementation (Workers)

```typescript
// Simplified SLO tracking via KV
// Run on a scheduled worker (cron trigger) every 5 minutes

export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // Read counters from KV (set by request middleware)
    const total = parseInt(await env.KV.get("metrics:requests:total") || "0");
    const errors = parseInt(await env.KV.get("metrics:requests:errors") || "0");

    if (total === 0) return;

    const errorRate = errors / total;
    const sloTarget = 0.01; // 99% availability = 1% error budget
    const burnRate = errorRate / sloTarget;

    if (burnRate > 14.4) {
      await dispatchAlert(env, {
        severity: "critical",
        title: "SLO burn rate critical",
        message: `Error rate ${(errorRate * 100).toFixed(2)}% — budget will exhaust in ~${Math.round(30 / burnRate)} days`,
        project: "app-name",
      });
    } else if (burnRate > 6.0) {
      await dispatchAlert(env, {
        severity: "warn",
        title: "SLO burn rate elevated",
        message: `Error rate ${(errorRate * 100).toFixed(2)}% — investigate today`,
        project: "app-name",
      });
    }

    // Reset counters for next window
    // NOTE: This is the simplest approach (fixed windows). It loses data at window
    // boundaries — a spike at minute 4:59 disappears at minute 5:00. For production
    // SLO tracking, use a sliding window: store per-minute counters in KV with TTL
    // and sum the last N minutes on each check. The fixed-window approach is acceptable
    // for T0-T1 where SLO precision isn't critical.
    await env.KV.put("metrics:requests:total", "0");
    await env.KV.put("metrics:requests:errors", "0");
  },
};
```

---

## Escalation Matrix Template

| Level | Trigger | Who | Response Time | Actions |
|---|---|---|---|---|
| L0 | Automated alert | On-call (self) | 5 min | Check runbook, attempt fix |
| L1 | L0 can't resolve in 30 min | Tech lead / partner | 15 min | Deeper diagnosis, possible rollback |
| L2 | L1 can't resolve in 1 hour | External support | 30 min | Vendor escalation, domain expert |
| L3 | Data loss or security breach | Legal / compliance | Immediate | Incident commander, comms plan |

For solo developers (aidops-scale), L0 and L1 are the same person. L2 is "post on
the framework's Discord." L3 is "call a lawyer."

---

## Alert Hygiene Rules

1. **Review alert volume weekly.** If you're getting >5 alerts/day, you have too
   many or your thresholds are wrong.
2. **Every alert resolved without action → tighten the threshold or delete the alert.**
3. **Alert fatigue kills.** 100 noisy alerts train you to ignore alerts. 5 meaningful
   alerts train you to respond.
4. **Test alerts monthly.** Trigger each alert intentionally to verify delivery.
5. **Deduplicate.** If the same failure triggers 3 alerts, merge them into one.
