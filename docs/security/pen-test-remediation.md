# Pen-test remediation — manual dashboard steps

The Supabase Auth rate-limit (H1b) and captcha (M2) controls
are managed in the Supabase dashboard, not the database. Apply
both as soon as you're in front of the console.

## H1b — Rate-limit the anon RPCs

Without SQL-based rate limiting, anon RPCs have no per-call
budget. Configure per-function rate limits in the dashboard:

1. Open https://supabase.com/dashboard/project/orivktxrtiqggemxetyc/database/functions
2. For each of these functions, click into it and set a rate limit:
   - `anon_lookup_voters_by_join_code`
   - `anon_cast_vote_by_name`
   - `anon_cast_vote_by_token`
   - `anon_fetch_today_poll`
   - `anon_fetch_today_tally`
3. Recommended starting values:
   - Read-only (`anon_lookup_*`, `anon_fetch_today_*`): **60 calls / minute**
   - Write (`anon_cast_vote_*`): **10 calls / minute**
4. Save and test by re-running the original probe burst.

## M2 — Enable captcha for email signup

1. Open https://supabase.com/dashboard/project/orivktxrtiqggemxetyc/auth/providers
2. Click **Email**.
3. Toggle **Confirm email** to ON (already ON in your config — `mailer_autoconfirm: false`).
4. Open https://supabase.com/dashboard/project/orivktxrtiqggemxetyc/auth/rate-limits
   and add a signup rate limit: **5 attempts / hour / IP**.
5. Optionally: open https://www.cloudflare.com/products/turnstile/,
   create a site key, paste it under **Auth → Bot Protection**.
   Supabase will then require a Turnstile token on `/auth/v1/signup`.

## Why these aren't in SQL

- Function rate limits are enforced by Supabase's edge gateway,
  not Postgres. The dashboard is the source of truth.
- Captcha is a Supabase Auth provider setting, not a column or
  function. Configured per-project, not per-row.

## Migration history (database-side fixes that DID land)

These are already applied to the production database. You can
view them in https://supabase.com/dashboard/project/orivktxrtiqggemxetyc/database/migrations:

- `pen_test_remediation_v1` — drops permissive anon SELECT on `households`, tightens `anon_lookup_voters_by_join_code` to require a voter token before echoing invite_code, adds voter_token requirement to `anon_cast_vote_by_name`, generic auth error in `reset_household_data`.
- `drop_broken_rate_limit_v1` — removes the first SQL rate-limit attempt (transactions rolled back the count).
- `rate_limit_via_dblink_v1` — attempts the rate limit via `dblink` (also failed; managed Postgres requires a password for dblink connections that anon can't supply).
- `drop_broken_dblink_rate_limit_v1` — cleans up the dblink helpers.
- `wire_dblink_rate_limit_into_anon_rpcs_v1` — recreated anon RPCs with broken rate calls.
- `rewire_anon_rpcs_without_rate_limit_v1` — final version, anon RPCs work correctly without the SQL rate check; rate limiting deferred to dashboard config above.

## Client-side work that may be needed later

The new `anon_cast_vote_by_name` requires `p_voter_token`. The
existing "name picker" fallback in `App.tsx:3984` will surface
the new error to users. Two options when you want to fix this:

1. **Token-only voting** — break the name picker, require the
   share URL to include `?voter=<invite_code>`. Simpler security,
   tighter UX.
2. **Token-gated name picker** — VoterLanding asks for the
   invite_code after the name picker, before voting. Preserves
   the "type your name" flow but adds a step.

Not changed in this remediation pass because either path is a
UX change that should be its own commit.