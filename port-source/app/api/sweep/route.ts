/** The daily sweep, triggered by Vercel Cron (see vercel.json).
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`, which is the only thing
 * stopping anyone on the internet from making your bot post.
 */

import { NextResponse } from "next/server";

import { config } from "@/lib/config";
import { todayLocal } from "@/lib/schedule";
import { sweep } from "@/lib/sweep";
import { ensureSchema } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${config.cronSecret()}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  await ensureSchema();
  const today = todayLocal();
  const result = await sweep({ today });

  console.log(`sweep ${today}: ${result.sent} sent`, result.lines);
  return NextResponse.json({ today, ...result });
}
