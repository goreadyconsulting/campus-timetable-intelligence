import { MasterPage } from "@/components/master-page";
export default function Page() {
  return (
    <MasterPage
      title="Students"
      subtitle="Individual programme and module allocations"
      entities={["students", "allocations"]}
    />
  );
}
