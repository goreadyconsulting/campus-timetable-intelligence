import { MasterPage } from "@/components/master-page";
export default function Page() {
  return (
    <MasterPage
      title="Availability"
      subtitle="Weekly patterns and dated exceptions in the resource time zone"
      entities={["availabilityRules", "exceptions"]}
    />
  );
}
