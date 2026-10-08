import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10"
    >
      <Link
        href="/login"
        className="mb-7 flex items-center justify-center gap-3"
      >
        <span className="rounded-xl bg-emerald-800 p-3 text-white">
          <Icon name="book" />
        </span>
        <span className="text-xl font-bold tracking-tight">Groundwork</span>
      </Link>
      {children}
    </main>
  );
}
