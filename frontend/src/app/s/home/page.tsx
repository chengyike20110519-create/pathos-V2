import V2Workbench from "@/components/v2/V2Workbench";
import { listApprovedFacts } from "@/server/information/fact-repository";
import {
  buildWorkbenchFactCoverage,
  unavailableWorkbenchFactCoverage,
} from "@/server/information/report-integration";

export const dynamic = "force-dynamic";

export default async function StudentWorkbenchPage(): Promise<JSX.Element> {
  try {
    const facts = await listApprovedFacts();
    return (
      <V2Workbench
        mode="home"
        informationCoverage={buildWorkbenchFactCoverage(facts)}
      />
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const reason =
      message.includes("facts") && message.includes("does not exist")
        ? "信息平台迁移尚未执行，已审核事实覆盖暂不可用。"
        : "已审核事实层暂不可用，当前工作台不展示推测覆盖。";
    return (
      <V2Workbench
        mode="home"
        informationCoverage={unavailableWorkbenchFactCoverage(reason)}
      />
    );
  }
}
