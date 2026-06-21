import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "fr_session";

const secretKey = new TextEncoder().encode(env.authSecret);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface SessionClaims {
  sub: string; // userId
  username: string;
  platformRole: string;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ username: claims.username, platformRole: claims.platformRole })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.sessionTtlSeconds}s`)
    .sign(secretKey);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      username: String(payload.username ?? ""),
      platformRole: String(payload.platformRole ?? "USER"),
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: env.sessionTtlSeconds,
  };
}
