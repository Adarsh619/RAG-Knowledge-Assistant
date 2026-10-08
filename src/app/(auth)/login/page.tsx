import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { getSafeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="login"
      next={getSafeNextPath(params.next)}
      confirmationFailed={params.error === "confirmation"}
    />
  );
}
