import { MasterPage } from "@/components/master-page";
export default function Page() {
  return (
    <MasterPage
      title="Programmes & Modules"
      subtitle="Campus-owned academic records"
      entities={["programmes", "modules"]}
    />
  );
}
