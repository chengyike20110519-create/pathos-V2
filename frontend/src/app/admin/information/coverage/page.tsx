import { redirect } from "next/navigation";
import CoverageDashboard from "@/components/admin/CoverageDashboard";
import { ForbiddenError, requireAdvisor } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/session";
import { DatabaseNotConfiguredError } from "@/server/db";
import { buildInformationCoverageReport } from "@/server/information/coverage-service";
import type { CoverageReport } from "@/domain/information/coverage";

export const dynamic = "force-dynamic";

interface CoverageLoad {
  report: CoverageReport | null;
  errorCode: string | null;
  errorMessage: string | null;
}

async function loadDashboard(): Promise<CoverageLoad> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/information/coverage");

  try {
    await requireAdvisor();
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return {
        report: null,
        errorCode: e.code,
        errorMessage: "覆盖率后台仅对组织 owner / advisor 开放。",
      };
    }
    if (e instanceof DatabaseNotConfiguredError) {
      return { report: null, errorCode: e.code, errorMessage: e.message };
    }
    return {
      report: null,
      errorCode: "DB_UNREACHABLE",
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    return { report: await buildInformationCoverageReport(), errorCode: null, errorMessage: null };
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return { report: null, errorCode: e.code, errorMessage: e.message };
    }
    return {
      report: null,
      errorCode: "INFORMATION_COVERAGE_UNAVAILABLE",
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

export default async function AdminInformationCoveragePage(): Promise<JSX.Element> {
  const { report, errorCode, errorMessage } = await loadDashboard();
  return (
    <CoverageDashboard
      report={report}
      errorCode={errorCode}
      errorMessage={errorMessage}
    />
  );
}
