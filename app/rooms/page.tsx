import { MasterPage } from "@/components/master-page";
export default function Page() {
  return (
    <MasterPage
      title="Locations"
      subtitle="Capacity, suitability and campus ownership"
      entities={["rooms"]}
    />
  );
}
