export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    {
      service: "numerology-web",
      status: "ok",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 200,
    },
  );
}
