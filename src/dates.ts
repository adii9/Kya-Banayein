// Asia/Kolkata-aware YYYY-MM-DD key.
//
// JS Date.toISOString() is always UTC, so an Indian user at 11pm IST
// would get "tomorrow" on the slot selector and "yesterday" in their
// meal history. en-CA gives the ISO-8601 date shape we need for the
// plan_date key, and the explicit timeZone keeps the boundary stable
// across machines (the caller's locale doesn't matter).
//
// This helper is the ONE source of truth for "today" in this app.
// api.ts writes votes.poll_date with it; App.tsx reads todayKey with
// it. Without sharing, the day key on the wire drifts from the day
// key in the UI and votes silently go missing after 8:30pm IST.
const IST_TZ = 'Asia/Kolkata'
export const istDateKey = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ }).format(d)
