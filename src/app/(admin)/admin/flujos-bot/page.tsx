import nextDynamic from "next/dynamic";

const FlowEditor = nextDynamic(
  () => import("@/components/admin/flow-editor").then(m => m.FlowEditor),
  { ssr: false }
);

export const dynamic = "force-dynamic";

export default function FlujosBotPage() {
  return <FlowEditor />;
}
