import { readEvidence } from "@/lib/server/evidence";
import { apiHandler } from "@/lib/server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Evidence image bytes (level access). Immutable → cached privately by the browser. */
export const GET = apiHandler<{ id: string }>({}, async ({ user, params }) => {
  const { mime, data } = await readEvidence(user, params.id);
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      Vary: "Authorization",
    },
  });
});
