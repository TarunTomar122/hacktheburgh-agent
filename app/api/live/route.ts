import { connection } from "next/server";
import { z } from "zod";
import { isLive, liveInput, subscribeLive, type LiveEvent } from "../../../lib/liveview";

/**
 * GET  -> server-sent events with the agent's browser tabs as JPEG frames (see lib/liveview.ts).
 *         Events: {type:"pages",pages} | {type:"frame",pageId,data,url,width,height} | {type:"stats",stats}
 *                 | {type:"end"} | {type:"control",enabled} | {type:"idle"}.
 *         Frames are dropped, not queued, when the client is slow, so the view never lags behind.
 * POST -> one user input forwarded to the live page (only sent by the panel in "Take control" mode).
 */
export async function GET(req: Request) {
  await connection(); // never prerender: this is a live stream

  const enc = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  let flush: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      // While the client is still reading, keep only the newest frame per tab and send it as soon as there is
      // room, so a tile never freezes on an old picture. Everything that is not a frame is always delivered.
      const pending = new Map<string, LiveEvent>();
      const send = (e: LiveEvent | { type: "idle" }) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          unsubscribe();
        }
      };
      const write = (e: LiveEvent | { type: "idle" }) => {
        if (e.type === "frame" && (controller.desiredSize ?? 1) <= 0) {
          pending.set(e.pageId, e);
          return;
        }
        send(e);
      };
      flush = setInterval(() => {
        for (const [id, e] of pending) {
          if ((controller.desiredSize ?? 1) <= 0) break;
          pending.delete(id);
          send(e);
        }
      }, 50);
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
        clearInterval(flush);
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
      clearInterval(flush);
    },
  }, { highWaterMark: 4 });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

const pageId = z.string().max(20).optional();
const Input = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), x: z.number(), y: z.number(), pageId }),
  z.object({ type: z.literal("move"), x: z.number(), y: z.number(), pageId }),
  z.object({ type: z.literal("wheel"), x: z.number(), y: z.number(), dx: z.number(), dy: z.number(), pageId }),
  z.object({ type: z.literal("key"), key: z.string().min(1).max(40), pageId }),
  z.object({ type: z.literal("text"), text: z.string().min(1).max(200), pageId }),
  z.object({ type: z.literal("back"), pageId }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("focus"), pageId: z.string().max(20).nullable() }),
  z.object({ type: z.literal("resize"), width: z.number().int().min(200).max(4000), height: z.number().int().min(200).max(4000) }),
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
