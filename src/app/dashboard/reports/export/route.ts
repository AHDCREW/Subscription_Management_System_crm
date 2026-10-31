import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseReportFilters, urlParamReader } from "@/lib/reports/filters";
import { EXPORT_HEADERS, csvStream, exportRows } from "@/lib/reports/export";
import { reportToday, resolveFilters } from "@/lib/reports/queries";

// GET /dashboard/reports/export?tab=…&from=…&to=…&status=…&q=…&plan=…
// Downloads the filtered rows of a report tab as CSV (capped at EXPORT_ROW_LIMIT).
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to export reports.", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "STAFF") return new Response("Not allowed.", { status: 403 });

  const filters = await resolveFilters(parseReportFilters(urlParamReader(request.nextUrl.searchParams)));
  const today = reportToday();
  const filename = `subflow-${filters.tab}-${today.toISOString().slice(0, 10)}.csv`;

  return new Response(csvStream(EXPORT_HEADERS[filters.tab], exportRows(filters.tab, filters, today)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
