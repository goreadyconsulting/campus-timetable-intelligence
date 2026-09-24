"use client";
import { useCampusData } from "./data-context";
import type {
  ActivityTemplate,
  AvailabilityException,
  PublicationState,
} from "@/types/workflow";
import { createTemplatesFromData } from "@/lib/workflow";
export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function useWorkflow() {
  const c = useCampusData(),
    d = c.rawData;
  return {
    templates: (d.templates || []).filter((t) => !t.archived),
    exceptions: (d.exceptions || []).filter((e) => !e.archived),
    publication: d.publication || {
      version: 0,
      status: "Draft",
      scope: "All campuses",
      notes: "",
    },
    addTemplate: (t: ActivityTemplate) => c.save("templates", t),
    updateTemplate: (id: string, patch: Partial<ActivityTemplate>) =>
      c.save("templates", {
        ...d.templates?.find((t) => t.id === id),
        ...patch,
      }),
    refreshTemplates: async () => {
      const rows = createTemplatesFromData(d).filter(
        (t) =>
          !d.templates?.some((x) => x.moduleId === t.moduleId && !x.archived),
      );
      if (rows.length)
        await c.mutate(
          rows.map((record) => ({
            entity: "templates",
            operation: "create",
            record,
          })),
        );
    },
    addException: (e: Omit<AvailabilityException, "id" | "createdAt">) =>
      c.save("exceptions", e),
    removeException: (id: string) => c.archive("exceptions", id),
    updatePublication: (p: Partial<PublicationState>) =>
      c.run({
        action: "review",
        status: p.status,
        notes: p.notes,
        expectedDataRevision: d.dataRevision,
      }),
    publishTimetable: () => {
      throw new Error("Select the publication scope and review it first.");
    },
  };
}
