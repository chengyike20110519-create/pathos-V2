// School detail route — /university/[id]
//
// The app requires a server runtime for its Preview BFF, so school
// details are resolved on demand through the existing DataSource.
// Unknown IDs therefore follow the same fail-closed runtime path.

import { UniversityDetailView } from "@/components/university/UniversityDetailView";

export const dynamic = "force-dynamic";

export default async function UniversityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UniversityDetailView id={id} />;
}
