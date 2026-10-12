import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { AccountWorkspace } from "@/components/account-settings";
export const metadata = { title: "Account" };
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount");
  return <><PageHeader eyebrow="YOUR WORKSPACE" title="My Account" description="Your account, security and private knowledge." /><AccountWorkspace email={user.email ?? "Signed-in user"} verified={Boolean(user.email_confirmed_at)} joined={user.created_at} /></>;
}
