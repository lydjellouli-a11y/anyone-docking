// Téléchargement de l'historique (Excel ou CSV). Les données sont lues avec
// les droits de l'utilisatrice connectée (RLS) : sans accès, réponse 404.
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { loadAssignmentHistory } from "@/lib/history/load";
import { exportFileName, historyToCsv, historyToXlsx } from "@/lib/history/export";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/espace/[institutionId]/enseignements/[assignmentId]/export">,
) {
  const { institutionId, assignmentId } = await ctx.params;
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  if (!z.uuid().safeParse(institutionId).success || !z.uuid().safeParse(assignmentId).success) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  const { supabase } = await requireUser();
  const result = await loadAssignmentHistory(supabase, institutionId, assignmentId);
  if (!result) return new NextResponse("Introuvable", { status: 404 });

  const fileName = exportFileName(result.meta, format);
  const headers = {
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  };
  if (format === "csv") {
    return new NextResponse(historyToCsv(result.meta, result.history), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  const body = await historyToXlsx(result.meta, result.history);
  return new NextResponse(new Uint8Array(body), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}
