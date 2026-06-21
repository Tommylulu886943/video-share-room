import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { landingPathFor } from "@/lib/nav";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(landingPathFor(session));
}
