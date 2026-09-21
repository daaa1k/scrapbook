// Dashboard variables are intentionally absent from wrangler.jsonc.
// Keep their types here so `wrangler types` can be regenerated safely.
interface DashboardEnv {
  ENVIRONMENT: string
  ALLOW_INSECURE_AUTH_BYPASS: string
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  ACCESS_ALLOWED_EMAILS: string
  CURSOR_API_KEY?: string
}

interface Env extends DashboardEnv {}

declare namespace Cloudflare {
  interface Env extends DashboardEnv {}
}
