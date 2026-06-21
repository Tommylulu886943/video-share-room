import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma/client";

const tursoUrl = process.env.TURSO_DATABASE_URL;
const adapter = tursoUrl
  ? new PrismaLibSql({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
  : new PrismaLibSql({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const hash = (pw: string) => bcrypt.hash(pw, 10);

// A few real, embeddable YouTube ids so thumbnails/players work in the demo.
const YT = [
  "dQw4w9WgXcQ",
  "9bZkp7q19f0",
  "kJQP7kiw5Fk",
  "3JZ_D3ELwOQ",
  "OPf0YbXqDm0",
  "fLexgOxsZu0",
  "ScMzIvxBSi4",
  "e-ORhEE9VVg",
];

async function createUser(
  username: string,
  email: string,
  pw: string,
  opts: { verified?: boolean; platformRole?: string } = {},
) {
  return prisma.user.create({
    data: {
      username,
      email,
      passwordHash: await hash(pw),
      emailVerified: opts.verified ?? true,
      platformRole: opts.platformRole ?? "USER",
    },
  });
}

async function main() {
  console.log("Wiping existing data…");
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  // --- Platform owner (Super Admin) ---
  const superAdmin = await createUser(
    process.env.SEED_SUPERADMIN_USERNAME || "superadmin",
    process.env.SEED_SUPERADMIN_EMAIL || "zjiasheng@fortinet.com",
    process.env.SEED_SUPERADMIN_PASSWORD || "superadmin123",
    { verified: true, platformRole: "SUPER_ADMIN" },
  );
  console.log(`Super admin: ${superAdmin.username}`);

  // ============ Tenant 1: 基隆劍道 ============
  const kendo = await prisma.tenant.create({
    data: {
      slug: "keelung-kendo",
      name: "基隆劍道",
      brandColor: "#b91c1c",
      brandLogo: "🥋",
    },
  });

  const kendoAdmin = await createUser(
    "kendo_admin",
    "kendo_admin@example.com",
    "password123",
  );
  await prisma.membership.create({
    data: {
      userId: kendoAdmin.id,
      tenantId: kendo.id,
      name: "劍道社管理者",
      level: "五段",
      role: "ADMIN",
      status: "APPROVED",
    },
  });

  const kendoTaro = await createUser("kendo_taro", "taro@example.com", "password123");
  const kendoTaroM = await prisma.membership.create({
    data: {
      userId: kendoTaro.id,
      tenantId: kendo.id,
      name: "太郎",
      level: "三段",
      role: "MEMBER",
      status: "APPROVED",
    },
  });

  const kendoHana = await createUser("kendo_hana", "hana@example.com", "password123");
  await prisma.membership.create({
    data: {
      userId: kendoHana.id,
      tenantId: kendo.id,
      name: "花子",
      level: "初段",
      role: "MEMBER",
      status: "APPROVED",
    },
  });

  // A pending application so the admin queue has something to review.
  const kendoNew = await createUser("kendo_new", "newbie@example.com", "password123");
  await prisma.membership.create({
    data: {
      userId: kendoNew.id,
      tenantId: kendo.id,
      name: "新進學員",
      level: "無級",
      role: "MEMBER",
      status: "PENDING",
    },
  });

  // Categories (two-level)
  const kTeach = await prisma.category.create({
    data: { tenantId: kendo.id, name: "教學", sortOrder: 0 },
  });
  const kBasic = await prisma.category.create({
    data: { tenantId: kendo.id, name: "基本動作", parentId: kTeach.id, sortOrder: 0 },
  });
  const kAdvanced = await prisma.category.create({
    data: { tenantId: kendo.id, name: "進階技術", parentId: kTeach.id, sortOrder: 1 },
  });
  const kMatch = await prisma.category.create({
    data: { tenantId: kendo.id, name: "比賽", sortOrder: 1 },
  });
  const kFormal = await prisma.category.create({
    data: { tenantId: kendo.id, name: "正式比賽", parentId: kMatch.id, sortOrder: 0 },
  });

  const kTagNames = ["素振", "切返", "面", "小手", "胴", "初學者"];
  const kTags = await Promise.all(
    kTagNames.map((name, i) =>
      prisma.tag.create({ data: { tenantId: kendo.id, name, sortOrder: i } }),
    ),
  );
  const kTag = (n: string) => kTags.find((t) => t.name === n)!.id;

  await prisma.video.create({
    data: {
      tenantId: kendo.id,
      youtubeId: YT[0],
      title: "基本素振教學",
      notes: "從握刀到上下素振的基礎。",
      visibility: "PUBLIC",
      categoryId: kBasic.id,
      uploadedById: kendoAdmin.id,
      tags: { create: [{ tagId: kTag("素振") }, { tagId: kTag("初學者") }] },
    },
  });
  await prisma.video.create({
    data: {
      tenantId: kendo.id,
      youtubeId: YT[1],
      title: "縣大會決賽 — 面取得",
      visibility: "PUBLIC",
      categoryId: kFormal.id,
      uploadedById: kendoAdmin.id,
      tags: { create: [{ tagId: kTag("面") }] },
    },
  });
  // Restricted: only 太郎 is on the allow-list; 花子 cannot see it at all.
  await prisma.video.create({
    data: {
      tenantId: kendo.id,
      youtubeId: YT[2],
      title: "進階連續技（段位限定）",
      notes: "僅開放給指定學員。",
      visibility: "RESTRICTED",
      categoryId: kAdvanced.id,
      uploadedById: kendoAdmin.id,
      tags: { create: [{ tagId: kTag("小手") }, { tagId: kTag("胴") }] },
      access: { create: [{ membershipId: kendoTaroM.id }] },
    },
  });

  // ============ Tenant 2: 橘郡羽球 ============
  const badminton = await prisma.tenant.create({
    data: {
      slug: "oc-badminton",
      name: "橘郡羽球",
      brandColor: "#059669",
      brandLogo: "🏸",
    },
  });

  const bdAdmin = await createUser(
    "badminton_admin",
    "badminton_admin@example.com",
    "password123",
  );
  await prisma.membership.create({
    data: {
      userId: bdAdmin.id,
      tenantId: badminton.id,
      name: "羽球社管理者",
      level: "A 組",
      role: "ADMIN",
      status: "APPROVED",
    },
  });

  const bdAlice = await createUser("bd_alice", "alice@example.com", "password123");
  const bdAliceM = await prisma.membership.create({
    data: {
      userId: bdAlice.id,
      tenantId: badminton.id,
      name: "Alice",
      level: "B 組",
      role: "MEMBER",
      status: "APPROVED",
    },
  });
  const bdBob = await createUser("bd_bob", "bob@example.com", "password123");
  await prisma.membership.create({
    data: {
      userId: bdBob.id,
      tenantId: badminton.id,
      name: "Bob",
      level: "C 組",
      role: "MEMBER",
      status: "APPROVED",
    },
  });
  const bdPending = await createUser("bd_pending", "pending@example.com", "password123");
  await prisma.membership.create({
    data: {
      userId: bdPending.id,
      tenantId: badminton.id,
      name: "待審球友",
      level: "C 組",
      role: "MEMBER",
      status: "PENDING",
    },
  });

  const bTeach = await prisma.category.create({
    data: { tenantId: badminton.id, name: "技術教學", sortOrder: 0 },
  });
  const bServe = await prisma.category.create({
    data: { tenantId: badminton.id, name: "發球", parentId: bTeach.id, sortOrder: 0 },
  });
  const bSmash = await prisma.category.create({
    data: { tenantId: badminton.id, name: "殺球", parentId: bTeach.id, sortOrder: 1 },
  });
  const bMatch = await prisma.category.create({
    data: { tenantId: badminton.id, name: "比賽影片", sortOrder: 1 },
  });
  const bDouble = await prisma.category.create({
    data: { tenantId: badminton.id, name: "雙打", parentId: bMatch.id, sortOrder: 0 },
  });

  const bTagNames = ["發球", "殺球", "防守", "初學者", "雙打"];
  const bTags = await Promise.all(
    bTagNames.map((name, i) =>
      prisma.tag.create({ data: { tenantId: badminton.id, name, sortOrder: i } }),
    ),
  );
  const bTag = (n: string) => bTags.find((t) => t.name === n)!.id;

  await prisma.video.create({
    data: {
      tenantId: badminton.id,
      youtubeId: YT[3],
      title: "正手發球教學",
      visibility: "PUBLIC",
      categoryId: bServe.id,
      uploadedById: bdAdmin.id,
      tags: { create: [{ tagId: bTag("發球") }, { tagId: bTag("初學者") }] },
    },
  });
  await prisma.video.create({
    data: {
      tenantId: badminton.id,
      youtubeId: YT[4],
      title: "雙打前後場輪轉戰術",
      visibility: "PUBLIC",
      categoryId: bDouble.id,
      uploadedById: bdAdmin.id,
      tags: { create: [{ tagId: bTag("雙打") }] },
    },
  });
  await prisma.video.create({
    data: {
      tenantId: badminton.id,
      youtubeId: YT[5],
      title: "殺球發力進階（教練限定）",
      visibility: "RESTRICTED",
      categoryId: bSmash.id,
      uploadedById: bdAdmin.id,
      tags: { create: [{ tagId: bTag("殺球") }] },
      access: { create: [{ membershipId: bdAliceM.id }] },
    },
  });

  // ============ Cross-tenant account (D7): belongs to BOTH clubs ============
  const multi = await createUser("multi", "multi@example.com", "password123");
  await prisma.membership.create({
    data: {
      userId: multi.id,
      tenantId: kendo.id,
      name: "多棲太郎",
      level: "二段",
      role: "MEMBER",
      status: "APPROVED",
    },
  });
  await prisma.membership.create({
    data: {
      userId: multi.id,
      tenantId: badminton.id,
      name: "多棲 Bob",
      level: "B 組",
      role: "MEMBER",
      status: "APPROVED",
    },
  });

  console.log("Seed complete.");
  console.log("Logins (password = password123 unless noted):");
  console.log("  superadmin / superadmin123  → 平台管理 (super admin)");
  console.log("  kendo_admin                 → 基隆劍道 管理者");
  console.log("  badminton_admin             → 橘郡羽球 管理者");
  console.log("  kendo_taro                  → 基隆劍道 成員（可看受限影片）");
  console.log("  kendo_hana                  → 基隆劍道 成員（看不到受限影片）");
  console.log("  multi                       → 同時屬於兩個社團（顯示切換器）");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
