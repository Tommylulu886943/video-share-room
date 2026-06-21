import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeEmailVerifyToken } from "@/lib/tokens";
import { promoteVerifiedMemberships } from "@/lib/members";
import { ApiError, jsonOk, readJson, route } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().min(1) });

export const POST = route(async (req: Request) => {
  const { token } = schema.parse(await readJson(req));

  const userId = await consumeEmailVerifyToken(token);
  if (!userId) throw new ApiError(400, "驗證連結無效或已過期");

  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
  });
  // Promote applications that were waiting on verification (FR-1 AC#2/#3).
  await promoteVerifiedMemberships(userId);

  return jsonOk({ verified: true });
});
