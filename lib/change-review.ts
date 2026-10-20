import type { AppData, Session } from "@/types";
import type { SeriesPatch } from "@/types/scheduling";
import { datePlus } from "./academic";
import { resolveOccurrences } from "./recurrence";

export type ClassDifference = {
  before?: Session;
  after?: Session;
  week: number;
};

const sorted = (ids?: string[]) => [...(ids || [])].sort().join("\u0000");

export function occurrencePatch(session: Session): SeriesPatch {
  return {
    dayOfWeek:
      [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ].indexOf(session.day) + 1,
    startLocalTime: session.start,
    endLocalTime: session.end,
    locationId: session.locationId,
    staffIds: session.staffIds,
    studentIds: session.studentIds,
  };
}

// Updating a repeating pattern must not copy a dated exception's unrelated settings.
export function editedPatch(
  original: SeriesPatch,
  edited: SeriesPatch,
  retained: SeriesPatch = {},
): SeriesPatch {
  const result: SeriesPatch = { ...retained };
  for (const key of [
    "dayOfWeek",
    "startLocalTime",
    "endLocalTime",
    "locationId",
  ] as const) {
    if (edited[key] !== original[key])
      Object.assign(result, { [key]: edited[key] });
  }
  for (const key of ["staffIds", "studentIds"] as const) {
    if (sorted(edited[key]) !== sorted(original[key]))
      result[key] = edited[key];
  }
  return result;
}

export function seriesOccurrences(data: AppData, seriesId: string): Session[] {
  const series = data.series?.find((s) => s.id === seriesId);
  if (!series || series.archived) return [];
  return resolveOccurrences(
    { ...data, series: [series] },
    datePlus(series.startDate, -7),
    datePlus(series.endDate, 7),
    true,
  );
}

function fingerprint(s: Session) {
  return JSON.stringify([
    s.date,
    s.start,
    s.end,
    s.locationId,
    sorted(s.staffIds),
    sorted(s.studentIds),
    s.status === "Cancelled",
  ]);
}

// A change to the regular weekday changes occurrence IDs. Match by teaching week
// and distinguish extra sessions so previews still pair the right classes.
function key(s: Session) {
  return `${s.teachingWeek}:${s.id.includes("+") ? s.id.slice(s.id.indexOf("+") + 1) : "base"}`;
}

export function compareClasses(
  before: AppData,
  after: AppData,
  seriesId: string,
): ClassDifference[] {
  const previous = new Map(
    seriesOccurrences(before, seriesId).map((s) => [key(s), s]),
  );
  const next = new Map(
    seriesOccurrences(after, seriesId).map((s) => [key(s), s]),
  );
  return [...new Set([...previous.keys(), ...next.keys()])]
    .flatMap((id) => {
      const a = previous.get(id),
        b = next.get(id);
      if (a && b && fingerprint(a) === fingerprint(b)) return [];
      return [{ before: a, after: b, week: (b || a)!.teachingWeek! }];
    })
    .sort(
      (a, b) =>
        a.week - b.week ||
        (a.after?.start || a.before!.start).localeCompare(
          b.after?.start || b.before!.start,
        ),
    );
}
