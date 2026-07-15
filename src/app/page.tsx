import Link from "next/link";

import { Button } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">SaaS Boilerplate</h1>
        <p className="text-black/60 dark:text-white/60">
          Email/password authentication is wired up. Create an account to get started.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/signup">
          <Button>Create account</Button>
        </Link>
        <Link href="/login">
          <Button variant="ghost">Log in</Button>
        </Link>
      </div>
    </main>
  );
}
