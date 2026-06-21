// Enum-like string constants (SQLite has no native enums).

export const PlatformRole = {
  USER: "USER",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;
export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

export const TenantRole = {
  MEMBER: "MEMBER",
  ADMIN: "ADMIN",
} as const;
export type TenantRole = (typeof TenantRole)[keyof typeof TenantRole];

export const MembershipStatus = {
  /** Account email not yet verified — hidden from the admin queue (FR-1 AC#2). */
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  /** Email verified, awaiting admin review. Shown in the admin queue. */
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type MembershipStatus =
  (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const Visibility = {
  PUBLIC: "PUBLIC",
  RESTRICTED: "RESTRICTED",
} as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const TokenPurpose = {
  EMAIL_VERIFY: "EMAIL_VERIFY",
} as const;
export type TokenPurpose = (typeof TokenPurpose)[keyof typeof TokenPurpose];
