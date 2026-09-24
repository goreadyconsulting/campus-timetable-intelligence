import { MasterPage } from "@/components/master-page";
export default function Page() {
  return (
    <MasterPage
      title="Staff"
      subtitle="Teaching eligibility and authorised campuses"
      entities={["lecturers"]}
    />
  );
}
