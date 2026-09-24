import { MasterPage } from "@/components/master-page";
export default function Page() {
  return (
    <MasterPage
      title="Academic Calendar"
      subtitle="Campuses, local time zones, terms and teaching weeks"
      entities={["campuses", "academicYears", "terms", "teachingWeeks"]}
    />
  );
}
