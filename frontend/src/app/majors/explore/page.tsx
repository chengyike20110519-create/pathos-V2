import { Suspense } from "react";
import ProgramExplorer from "@/components/major/ProgramExplorer";

export default function ProgramExplorePage() {
  return <Suspense fallback={<p className="p-8">正在打开专业…</p>}><ProgramExplorer /></Suspense>;
}
