import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { loadSessionUser, setSessionCookie } from "@/lib/session";
import { landingPathFor } from "@/lib/nav";
import { loginSchema } from "@/lib/validation";
import { ApiError, jsonOk, readJson, route } from "@/lib/api";

export const runtime = "nodejs";

// A real cost-10 bcrypt hash (60 chars) compared against when no user matches,
// so login latency doesn't reveal whether an account exists.
const DUMMY_HASH =
  "$2b$10$i2mO8DnrHDgf1aG3KFK28uLcyiHFX.pDmaK53GW2rY4cs9S1bTVJq";

export const POST = route(async (req: Request) => {
  const { identifier, password } = loginSchema.parse(await readJson(req));

  const id = identifier.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: id }, { email: id.toLowerCase() }] },
  });

  // Constant-ish path: always run a compare to reduce username enumeration timing.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new ApiError(401, "帳號或密碼錯誤");

  await setSessionCookie({
    sub: user.id,
    username: user.username,
    platformRole: user.platformRole,
  });

  const session = await loadSessionUser(user.id);
  const redirect = session ? landingPathFor(session) : "/pending";

  return jsonOk({ redirect, emailVerified: user.emailVerified });
});
