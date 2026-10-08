import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { getSafeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return <AuthForm mode="signup" next={getSafeNextPath(params.next)} />;
}
