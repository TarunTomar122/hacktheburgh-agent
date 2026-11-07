import { searchDirectory } from "../../../lib/directory";

export async function POST() {
  try {
    const result = await searchDirectory({
      location: "Edinburgh",
      areaOfLaw: "Accident and injury",
      limit: 10,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
