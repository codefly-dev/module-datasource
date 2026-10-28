import { failure, refusal, write } from "@/server/host";

// The tenant writes into its own store. This is not a datasource call: the
// datasource only reads, and this is what gives it something to read.
const MAX_DOCUMENTS = 5;
const MAX_CONTENT = 16 * 1024;

export async function POST(request: Request) {
  const refused = refusal(request);
  if (refused) return refused;
  const { documents } = (await request.json()) as { documents?: { key?: string; content?: string }[] };
  if (!Array.isArray(documents) || documents.length === 0 || documents.length > MAX_DOCUMENTS) {
    return Response.json({ error: `write between 1 and ${MAX_DOCUMENTS} documents` }, { status: 400 });
  }
  for (const { key, content } of documents) {
    if (!key || key.startsWith("/") || typeof content !== "string" || content.length > MAX_CONTENT) {
      return Response.json({ error: `each document needs a relative key and at most ${MAX_CONTENT} characters` }, { status: 400 });
    }
  }
  try {
    const written = [];
    for (const { key, content } of documents) written.push(await write(key as string, content as string));
    return Response.json({ written });
  } catch (error) {
    return failure(error);
  }
}
