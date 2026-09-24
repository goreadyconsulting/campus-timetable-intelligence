import type { AppData } from "@/types";
import type { Mutation, PublicationVersion } from "@/types/scheduling";
import { entities, records, assertRecord, assertArchive } from "./validation";
import { resolveOccurrences } from "./recurrence";
import { detectOccurrenceConflicts } from "./constraints";
import { validDate, datePlus } from "./academic";
export { migrateData, resolveOccurrences } from "./recurrence";
export { detectOccurrenceConflicts } from "./constraints";
export { entities, assertRecord, assertArchive } from "./validation";
export function applyMutations(
  source: AppData,
  mutations: Mutation[],
  expected: number,
  requestId: string,
  uuid: () => string,
  now: string,
) {
  if (expected !== source.dataRevision)
    throw new Error(
      "STALE: Shared data changed. Refresh and review your changes.",
    );
  if (!Array.isArray(mutations) || !mutations.length || mutations.length > 300)
    throw new Error("Submit between 1 and 300 records per request.");
  const data = JSON.parse(JSON.stringify(source)) as AppData;
  const ids: Record<string, string> = {};
  mutations.forEach((m) => {
    if (m.operation === "create" && m.record?.id)
      ids[String(m.record.id)] = uuid();
  });
  const remap = (v: any): any =>
    typeof v === "string"
      ? ids[v] || v
      : Array.isArray(v)
        ? v.map(remap)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]))
          : v;
  const changes: any[] = [];
  for (const mutation of mutations) {
    const m = remap(mutation) as Mutation;
    if (
      !entities.includes(m.entity) ||
      !["create", "update", "archive", "delete"].includes(m.operation)
    )
      throw new Error("Unsupported mutation.");
    const rows = records(data, m.entity),
      old = rows.find((r) => r.id === m.id);
    if (
      m.operation !== "create" &&
      (!old || old.revision !== m.expectedRevision)
    )
      throw new Error("STALE: Record changed. Refresh before saving.");
    if (
      m.operation === "delete" &&
      !["variants", "exceptions"].includes(m.entity)
    )
      throw new Error("Archive master records instead of deleting them.");
    if (m.operation === "archive") assertArchive(data, m.entity, m.id!);
    const id = old?.id || String(m.record?.id || uuid());
    if (m.operation === "create" && rows.some((r) => r.id === id))
      throw new Error("Duplicate record ID.");
    const record = {
      ...(old || {}),
      ...(m.record || {}),
      id,
      revision: (old?.revision || 0) + 1,
      updatedAt: now,
      ...(m.operation === "archive" || m.operation === "delete"
        ? { archived: true }
        : {}),
      ...(m.entity === "variants" ? { status: "Draft" } : {}),
    };
    record.createdAt = old?.createdAt || now;
    if (
      m.entity === "campuses" &&
      old &&
      (old.name !== record.name || old.timeZone !== record.timeZone)
    )
      assertArchive(source, "campuses", old.id);
    if (old) rows[rows.indexOf(old)] = record;
    else rows.push(record);
    (data as any)[m.entity] = rows;
    changes.push({
      entity: m.entity,
      record,
      before: old || null,
      operation: m.operation,
      reason: m.reason || String(record.reason || ""),
    });
  }
  for (const change of [...changes]) {
    if (change.entity !== "students" || change.record.archived) continue;
    const student = change.record;
    const beforeCodes = change.before?.moduleCodes || [];
    for (const allocation of data.allocations || []) {
      const module = data.modules.find((m) => m.id === allocation.moduleId);
      if (
        !allocation.archived &&
        allocation.studentId === student.id &&
        (!module ||
          module.campus !== student.campus ||
          !student.moduleCodes.includes(module.code))
      ) {
        const updated = {
          ...allocation,
          archived: true,
          revision: (allocation.revision || 1) + 1,
          updatedAt: now,
        };
        data.allocations = data.allocations!.map((a) =>
          a.id === allocation.id ? updated : a,
        );
        changes.push({
          entity: "allocations",
          record: updated,
          before: allocation,
          operation: "archive",
          reason: "Student module allocation updated",
        });
      }
    }
    for (const code of student.moduleCodes) {
      if (
        beforeCodes.includes(code) &&
        change.before?.campus === student.campus
      )
        continue;
      const module = data.modules.find(
        (m) => m.code === code && m.campus === student.campus,
      );
      const year = data.academicYears?.find((y) => !y.archived);
      if (!module || !year) continue;
      if (
        data.allocations?.some(
          (a) =>
            !a.archived &&
            a.studentId === student.id &&
            a.moduleId === module.id,
        )
      )
        continue;
      const allocation = {
        id: uuid(),
        studentId: student.id,
        moduleId: module.id!,
        startDate: year.startDate,
        endDate: year.endDate,
        status: "Active" as const,
        revision: 1,
        updatedAt: now,
      };
      data.allocations = [...(data.allocations || []), allocation];
      changes.push({
        entity: "allocations",
        record: allocation,
        before: null,
        operation: "create",
        reason: "Student module allocation updated",
      });
    }
  }
  for (const change of changes)
    assertRecord(data, change.entity, change.record);
  // Calendar changes and base edits must not create ambiguous or invalid existing overrides.
  if (
    changes.some((c) =>
      [
        "series",
        "variants",
        "teachingWeeks",
        "academicYears",
        "terms",
        "campuses",
      ].includes(c.entity),
    )
  ) {
    for (const v of data.variants || [])
      if (
        !v.archived &&
        !data.series?.find((s) => s.id === v.seriesId)?.archived
      )
        assertRecord(data, "variants", v);
  }
  data.dataRevision = expected + 1;
  data.publication = {
    ...(data.publication || { version: 0, scope: "All campuses", notes: "" }),
    status: "Draft",
    dataRevision: data.dataRevision,
  };
  const audit = changes.map((c) => ({
    id: uuid(),
    timestamp: now,
    action: c.operation,
    entityType: c.entity,
    entityId: c.record.id,
    actor: "Timetabling team",
    before: c.before,
    after: c.record,
    reason: c.reason,
    requestId,
    appVersion: "5.0.0",
  }));
  return { data, changes, audit, ids };
}
export function publicationReadiness(
  data: AppData,
  start: string,
  end: string,
  campusIds: string[],
  academicYearId: string,
) {
  if (
    !validDate(start) ||
    !validDate(end) ||
    start > end ||
    end > datePlus(start, 370)
  )
    throw new Error("Choose a date range of at most 370 days.");
  const year = data.academicYears?.find(
    (y) => y.id === academicYearId && !y.archived,
  );
  if (!year || start < year.startDate || end > year.endDate)
    throw new Error("Publication dates must be within the academic year.");
  if (
    !campusIds.length ||
    campusIds.some(
      (id) =>
        !data.campuses?.some((c) => c.id === id && !c.archived && c.active),
    )
  )
    throw new Error("Choose active campuses.");
  const all = resolveOccurrences(
    data,
    datePlus(start, -1),
    datePlus(end, 1),
    true,
  );
  const sessions = all.filter(
    (s) =>
      s.date! >= start &&
      s.date! <= end &&
      s.academicYearId === academicYearId &&
      campusIds.includes(s.campusId!),
  );
  const selected = new Set(sessions.map((s) => s.id));
  const conflicts = detectOccurrenceConflicts(data, all).filter(
    (c) =>
      c.occurrenceIds?.some((id) => selected.has(id)) &&
      ["Critical", "High"].includes(c.severity),
  );
  const missing: string[] = [];
  for (const t of data.templates || []) {
    if (
      t.archived ||
      t.academicYearId !== academicYearId ||
      !data.campuses?.some(
        (c) => campusIds.includes(c.id) && c.name === t.campus,
      )
    )
      continue;
    try {
      assertRecord(data, "templates", t);
    } catch (e) {
      missing.push(`${t.name}: ${(e as Error).message}`);
      continue;
    }
    for (const w of data.teachingWeeks || []) {
      if (
        w.archived ||
        !w.isTeachingWeek ||
        w.academicYearId !== academicYearId ||
        !t.teachingWeeks.includes(w.weekNumber) ||
        w.endDate < start ||
        w.startDate > end
      )
        continue;
      const n = sessions.filter(
        (s) =>
          s.teachingWeek === w.weekNumber &&
          data.series?.find((x) => x.id === s.seriesId)?.activityTemplateId ===
            t.id,
      ).length;
      if (n < t.weeklySessions)
        missing.push(
          `${t.name}, week ${w.weekNumber}: ${n}/${t.weeklySessions} sessions`,
        );
    }
  }
  return {
    sessions,
    conflicts,
    missing,
    ready: sessions.length > 0 && !conflicts.length && !missing.length,
  };
}
export function makePublication(
  data: AppData,
  scope: {
    startDate: string;
    endDate: string;
    campusIds: string[];
    academicYearId: string;
    notes: string;
    publishedBy: string;
  },
  uuid: () => string,
  now: string,
) {
  if (
    data.publication?.status !== "Approved" ||
    data.publication.dataRevision !== data.dataRevision
  )
    throw new Error("Approve the current data revision before publishing.");
  const result = publicationReadiness(
    data,
    scope.startDate,
    scope.endDate,
    scope.campusIds,
    scope.academicYearId,
  );
  if (!result.ready)
    throw new Error(
      `Publication blocked: ${result.conflicts.length} hard conflicts and ${result.missing.length} incomplete activities.`,
    );
  const publication: PublicationVersion = {
    ...scope,
    id: uuid(),
    version:
      Math.max(0, ...(data.publications || []).map((p) => p.version)) + 1,
    status: "Published",
    publishedAt: now,
    sessionCount: result.sessions.length,
    variantCount: new Set(
      result.sessions.map((s) => s.variantId).filter(Boolean),
    ).size,
    dataRevision: data.dataRevision!,
  };
  return { publication, data: JSON.parse(JSON.stringify(data)) as AppData };
}
export function publishedVariantChanges(
  data: AppData,
  p: PublicationVersion,
  now: string,
) {
  return (data.variants || [])
    .filter((v) => {
      if (v.archived) return false;
      const series = data.series?.find((s) => s.id === v.seriesId);
      if (
        !series ||
        series.archived ||
        series.academicYearId !== p.academicYearId ||
        !p.campusIds.includes(series.campusId)
      )
        return false;
      const dates = resolveOccurrences(
        { ...data, variants: [v], series: [series] },
        series.startDate,
        series.endDate,
        true,
      ).filter((o) => o.variantId === v.id);
      return (
        dates.length > 0 &&
        dates.every((o) => o.date! >= p.startDate && o.date! <= p.endDate)
      );
    })
    .map((v) => ({
      entity: "variants",
      record: {
        ...v,
        status: "Published",
        revision: (v.revision || 1) + 1,
        updatedAt: now,
      },
    }));
}
