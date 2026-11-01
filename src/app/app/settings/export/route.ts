import { requireUser } from "@/lib/auth/session";
import { exportUserData } from "@/lib/services/account";
import { overLimit } from "@/lib/services/rate-limit";

/** Everything stored about the user, as JSON (right of access and portability). */
export async function GET() {
  const user = await requireUser();
  // Each export reads everything the account holds, including the original CV file.
  if (await overLimit(`export:${user.id}`, 10, 60 * 60_000)) return new Response("You've downloaded your data several times in the last hour. Try again later.", { status: 429, headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "3600" } });
  return new Response(JSON.stringify(await exportUserData(user), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="shortlist-data.json"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
