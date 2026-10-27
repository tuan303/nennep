import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isRegulationId } from "@/components/app/shell/routes";
import { RegulationScreen } from "@/components/regulations/regulation-screen";
import { REGULATION_IDS, REGULATION_LABELS } from "@/lib/constants";

type Params = Promise<{ id: string }>;

/** Both pages are known at build time; any other id renders the in-shell 404. */
export function generateStaticParams() {
  return REGULATION_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: isRegulationId(id) ? REGULATION_LABELS[id].title : "Không tìm thấy" };
}

/**
 * Quy chế khen thưởng (/quy-che/khen-thuong) · Quy chế kỷ luật (/quy-che/ky-luat): every signed-in user (no permission
 * guard – the app shell already requires a signed-in, active account). Content is loaded by the client screen.
 */
export default async function RegulationPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!isRegulationId(id)) notFound();
  return <RegulationScreen key={id} id={id} />;
}
