"use client";

import { FormEvent, useState } from "react";
import {
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Send,
  Star,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { submitSuggestion } from "@/lib/backend";

const initialForm = {
  name: "",
  email: "",
  area: "Overall platform",
  category: "Improvement",
  rating: 4,
  suggestion: "",
  page: "General",
};

export default function SuggestionsPage() {
  const { backendConfig, backendStatus } = useCampusData();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{
    id: string;
    submittedAt: string;
  } | null>(null);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess(null);
    if (form.suggestion.trim().length < 10) {
      setError(
        "Please include a little more detail so the feedback can be understood and reviewed.",
      );
      return;
    }
    setLoading(true);
    try {
      const result = await submitSuggestion(backendConfig, {
        ...form,
        suggestion: form.suggestion.trim(),
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      });
      setSuccess({ id: result.suggestionId, submittedAt: result.submittedAt });
      setForm(initialForm);
    } catch (submissionError) {
      console.error(submissionError);
      setError(
        "The suggestion could not be saved to the shared feedback sheet. Check the backend connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Suggestions"
      subtitle="Share feedback with the timetabling team"
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <form onSubmit={submit} className="enterprise-card p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
              <MessageSquareText size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-navy">
                Submit a suggestion
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Use this form for process gaps, confusing wording, missing
                features, errors and ideas that would make the platform easier
                to use.
              </p>
            </div>
          </div>

          {success && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 font-semibold text-emerald-800">
                <CheckCircle2 size={18} />
                Suggestion received
              </p>
              <p className="mt-1 text-sm text-emerald-700">
                Reference {success.id}. It has been added to the shared Google
                Sheet for review.
              </p>
            </div>
          )}
          {error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Name (optional)">
              <input
                className="input w-full"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Your name"
              />
            </Field>
            <Field label="Email (optional)">
              <input
                className="input w-full"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                placeholder="Only needed for follow-up"
              />
            </Field>
            <Field label="Platform area">
              <select
                className="input w-full"
                value={form.area}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    area: event.target.value,
                  }))
                }
              >
                <option>Overall platform</option>
                <option>Dashboard</option>
                <option>Activity Planning</option>
                <option>Availability</option>
                <option>Timetable</option>
                <option>Room Booking</option>
                <option>Lecturers</option>
                <option>Student Schedules</option>
                <option>Conflict Alerts</option>
                <option>Review & Publication</option>
                <option>Analytics</option>
                <option>Reports</option>
                <option>AI Assistant</option>
                <option>Data Import</option>
              </select>
            </Field>
            <Field label="Feedback type">
              <select
                className="input w-full"
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              >
                <option>Improvement</option>
                <option>Missing feature</option>
                <option>Process question</option>
                <option>Usability issue</option>
                <option>Incorrect result</option>
                <option>Technical problem</option>
                <option>Positive feedback</option>
              </select>
            </Field>
            <Field label="Page or task">
              <input
                className="input w-full"
                value={form.page}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    page: event.target.value,
                  }))
                }
                placeholder="For example: moving a class"
              />
            </Field>
            <Field label="Overall rating">
              <div className="flex h-10 items-center gap-1 rounded-xl border border-slate-200 px-3">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({ ...current, rating: value }))
                    }
                    className={
                      value <= form.rating ? "text-amber-500" : "text-slate-300"
                    }
                    aria-label={`${value} stars`}
                  >
                    <Star size={20} fill="currentColor" />
                  </button>
                ))}
              </div>
            </Field>
            <label className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Suggestion or feedback
              </span>
              <textarea
                className="min-h-44 w-full rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none ring-tealBrand/20 focus:ring-4"
                value={form.suggestion}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    suggestion: event.target.value,
                  }))
                }
                placeholder="Explain what you were trying to do, what happened, and what you expected to happen."
                maxLength={3000}
              />
              <span className="mt-1 block text-right text-xs text-slate-400">
                {form.suggestion.length}/3000
              </span>
            </label>
          </div>

          <button
            disabled={loading || backendStatus !== "Connected"}
            className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <Send size={17} />
            )}
            Submit suggestion
          </button>
        </form>

        <aside className="space-y-5">
          <div className="enterprise-card p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                <Lightbulb size={20} />
              </div>
              <div>
                <h3 className="font-bold text-navy">Useful feedback</h3>
                <p className="text-xs text-slate-500">
                  Specific examples are easiest to act on.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <Tip
                title="Describe the task"
                text="What were you trying to schedule, review or export?"
              />
              <Tip
                title="Describe the problem"
                text="What was unclear, missing, slow or incorrect?"
              />
              <Tip
                title="Describe the expected result"
                text="What should the platform have done instead?"
              />
            </div>
          </div>
          <div className="enterprise-card p-5">
            <h3 className="font-bold text-navy">Connection status</h3>
            <p className="mt-2 text-sm text-slate-500">
              Feedback submissions are stored in the Suggestions tab of the
              shared timetable Google Sheet.
            </p>
            <div
              className={
                backendStatus === "Connected"
                  ? "mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"
                  : "mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700"
              }
            >
              Backend: {backendStatus}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Tip({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="font-semibold text-navy">{title}</p>
      <p className="mt-1 text-slate-500">{text}</p>
    </div>
  );
}
