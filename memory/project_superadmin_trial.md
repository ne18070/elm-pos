---
name: Superadmin isolation & trial system
description: Superadmin sees only /backoffice; new businesses get 7-day trial via SQL trigger
type: project
---

## Superadmin backoffice-only restriction

Superadmin is detected via `is_superadmin` boolean on the `users` table. Changes made in 4 places:

1. `renderer/app/login/page.tsx` — early return after profile load: skips business/subscription loading, calls `router.replace('/backoffice')`
2. `renderer/app/providers/auth-provider.tsx` — same guard on session restore
3. `renderer/app/(dashboard)/layout.tsx` — guard in useEffect: `if (isSuperAdmin) router.replace('/backoffice')`
4. `renderer/app/backoffice/layout.tsx` — guard + logout with full store cleanup (`setSubscription(null)`, `setLoaded(false)`, `clear()`)

**Why:** Superadmin should only manage the platform backoffice, not operate any POS terminal.

**How to apply:** Any new protected route must check `is_superadmin` similarly.

## 7-day trial system

- SQL trigger `on_business_created` auto-inserts a row in `subscriptions` with status `'trial'` and `trial_ends_at = now() + interval '7 days'`
- Client: `BusinessSwitcher` reloads subscription via `getSubscription()` after `handleSwitch()` and `handleCreated()`
- `TrialBanner` shows welcome message when `days >= 6`, countdown when lower, urgent red when `days <= 2`
- Layout redirects to `/billing` when status is `'expired'` OR `'none'`

**Why:** Give new users 7 days free to evaluate the app before requiring payment.
