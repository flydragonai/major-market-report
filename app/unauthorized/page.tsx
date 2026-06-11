import { loginWithToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SP = { bad?: string };

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const showBad = sp.bad === "1";
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-6">
      <form action={loginWithToken} className="w-full max-w-sm space-y-4">
        <h1
          className="text-2xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Admin token required
        </h1>
        <p className="text-sm text-muted">
          Paste the admin token below to load the report.
        </p>
        <input
          type="password"
          name="token"
          required
          autoFocus
          placeholder="Token"
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/40"
        />
        {showBad && (
          <p className="text-xs text-red-600">
            That token didn&apos;t match. Try again.
          </p>
        )}
        <button
          type="submit"
          className="w-full bg-zinc-900 text-zinc-50 rounded-md py-2 text-xs uppercase tracking-widest"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Enter
        </button>
      </form>
    </main>
  );
}
