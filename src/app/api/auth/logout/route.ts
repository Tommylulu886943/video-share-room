import { clearSessionCookie } from "@/lib/session";
import { jsonOk, route } from "@/lib/api";

export const runtime = "nodejs";

export const POST = route(async () => {
  await clearSessionCookie();
  return jsonOk({ ok: true });
});
