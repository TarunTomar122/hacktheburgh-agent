import { connection } from "next/server";
import { z } from "zod";
import { isLive, liveInput, subscribeLive, type LiveEvent } from "../../../lib/liveview";

/**
 * GET  -> server-sent events with the agent's browser as JPEG frames (see lib/liveview.ts, D32).
 *         Events: {type:"frame",data,url,width,height} | {type:"end"} | {type:"control",enabled}.
 *         Frames are dropped, not queued, when the client is slow, so the view never lags behind.
 * POST -> one user input forwarded to the live page (only sent by the panel in "Take control" mode).
 */
export async function GET(req: Request) {
  await connection(); // never prerender: this is a live stream

  const enc = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const write = (e: LiveEvent | { type: "idle" }) => {
        // Drop frames while the client is still reading the previous one; always deliver control messages.
        if (e.type === "frame" && (controller.desiredSize ?? 1) <= 0) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          unsubscribe();
        }
      };
      if (!isLive()) write({ type: "idle" });
      unsubscribe = subscribeLive(write);
      ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          /* closed */
        }
      }, 15000);
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      unsubscribe();
      clearInterval(ping);
    },
  }, { highWaterMark: 2 });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

const Input = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({ type: z.literal("wheel"), x: z.number(), y: z.number(), dx: z.number(), dy: z.number() }),
  z.object({ type: z.literal("key"), key: z.string().min(1).max(40) }),
  z.object({ type: z.literal("text"), text: z.string().min(1).max(200) }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("close") }),
]);

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad input" }, { status: 400 });
  try {
    return Response.json({ result: await liveInput(parsed.data) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.split("\n")[0] : String(e) }, { status: 500 });
  }
}
