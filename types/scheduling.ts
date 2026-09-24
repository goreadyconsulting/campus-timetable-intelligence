import type { AppData } from "./index";
export type Versioned = {
  revision?: number;
  updatedAt?: string;
  archived?: boolean;
};
export type Campus = Versioned & {
  id: string;
  code: string;
  name: string;
  timeZone: string;
  active: boolean;
  openingTime: string;
  closingTime: string;
};
export type AcademicYear = Versioned & {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};
export type Term = Versioned & {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
};
export type TeachingWeek = Versioned & {
  id: string;
  academicYearId: string;
  termId?: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  isTeachingWeek: boolean;
  label: string;
};
export type SeriesPatch = {
  dayOfWeek?: number;
  startLocalTime?: string;
  endLocalTime?: string;
  locationId?: string;
  staffIds?: string[];
  studentIds?: string[];
};
export type ScheduleSeries = Versioned & {
  id: string;
  campusId: string;
  programmeId: string;
  moduleId: string;
  activityTemplateId?: string;
  academicYearId: string;
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  timeZone: string;
  startDate: string;
  endDate: string;
  teachingWeeks: number[];
  staffIds: string[];
  locationId: string;
  studentIds: string[];
  plannedSize: number;
  status: "Draft" | "Scheduled" | "Published" | "Cancelled";
  createdAt: string;
  legacySessionId?: string;
};
export type VariantScope =
  | "single_occurrence"
  | "week_set"
  | "date_range"
  | "this_and_following";
export type ScheduleVariant = Versioned & {
  id: string;
  seriesId: string;
  scope: VariantScope;
  effectiveDate?: string;
  startDate?: string;
  endDate?: string;
  teachingWeeks?: number[];
  operation: "override" | "cancel" | "additional_session";
  patch: SeriesPatch;
  reason: string;
  status: "Draft" | "Published";
  createdAt: string;
};
export type AvailabilityRule = Versioned & {
  id: string;
  resourceType: "Lecturer" | "Student" | "Room";
  resourceId: string;
  timeZone: string;
  days: { dayOfWeek: number; windows: { start: string; end: string }[] }[];
};
export type TravelRule = Versioned & {
  id: string;
  fromCampusId: string;
  toCampusId: string;
  minimumMinutes: number;
};
export type Allocation = Versioned & {
  id: string;
  studentId: string;
  moduleId: string;
  startDate: string;
  endDate: string;
  status: "Active" | "Inactive";
};
export type ConflictReview = Versioned & {
  id: string;
  fingerprint: string;
  note: string;
};
export type PublicationVersion = Versioned & {
  id: string;
  version: number;
  status: "Published";
  publishedAt: string;
  publishedBy: string;
  notes: string;
  academicYearId: string;
  campusIds: string[];
  startDate: string;
  endDate: string;
  sessionCount: number;
  variantCount: number;
  dataRevision: number;
};
export type PublicationSnapshot = {
  publication: PublicationVersion;
  data: AppData;
};
export type AuditEntry = {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  before?: unknown;
  after?: unknown;
  reason: string;
  requestId: string;
  appVersion: string;
};
export type EntityName =
  | "rooms"
  | "lecturers"
  | "students"
  | "programmes"
  | "modules"
  | "templates"
  | "exceptions"
  | "campuses"
  | "academicYears"
  | "terms"
  | "teachingWeeks"
  | "series"
  | "variants"
  | "availabilityRules"
  | "travelRules"
  | "allocations"
  | "conflictReviews";
export type Mutation = {
  entity: EntityName;
  operation: "create" | "update" | "archive" | "delete";
  id?: string;
  expectedRevision?: number;
  record?: Record<string, unknown>;
  reason?: string;
};
