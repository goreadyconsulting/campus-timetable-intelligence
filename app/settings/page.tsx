import { MasterPage } from "@/components/master-page";
export default function Settings() {
  return (
    <MasterPage
      title="Settings"
      subtitle="Campus travel allowances and shared configuration"
      entities={["travelRules", "campuses"]}
    />
  );
}
