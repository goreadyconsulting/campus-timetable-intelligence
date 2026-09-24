"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useCampusData } from "./data-context";
import { Modal, Field } from "./modal";
import { askGemini } from "@/lib/backend";
export function HelpAssistant() {
  const c = useCampusData(),
    path = usePathname();
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [messages, setMessages] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const question = q.trim();
    setQ("");
    let answer = "";
    const matches = c.data.conflicts.filter(
      (x) =>
        question.toLowerCase().includes(x.module.toLowerCase()) ||
        question.toLowerCase().includes(x.room.toLowerCase()),
    );
    if (/why|conflict|clash|capacity/i.test(question)) {
      answer = matches.length
        ? matches
            .slice(0, 5)
            .map((x) => `${x.module}, ${x.time}: ${x.description}`)
            .join("\n")
        : `There are ${c.data.conflicts.length} conflicts in ${c.campus} for the week starting ${c.weekStart}. Open Conflict Alerts for each dated constraint and allocation previews. Include the module code or location to inspect a specific issue.`;
    } else if (/move|drag|cancel|change/i.test(question))
      answer =
        "Open an occurrence in Timetable, select the change scope and enter a reason. Preview the affected teaching weeks and new conflicts before saving. Changes can be edited or reverted on the Changes page.";
    else if (/publish|review/i.test(question))
      answer = `The working timetable is ${c.rawData.publication?.status || "Draft"}. Select a publication range, submit for review and approve the current revision. Publication requires scheduled activities and no hard conflicts. Later changes preserve published snapshots.`;
    else if (/availability/i.test(question))
      answer =
        "Availability supports multiple weekly windows per day and dated exceptions. Unavailable exceptions take priority; an Available exception replaces the regular windows for that date. Each resource uses its own time zone.";
    else if (
      /student|staff|room|location|module|programme|create|add/i.test(question)
    )
      answer =
        "Use the relevant master-data page to add, edit or archive records. Programmes, modules, students and locations have one owning campus. Staff require explicit additional-campus authorisation. Select individual students in each activity.";
    else {
      try {
        answer =
          (await askGemini(
            c.backendConfig,
            `${question}\nPage: ${path}; campus: ${c.campus}; academic year: ${c.academicYearId}; week: ${c.weekStart}`,
            c.data,
          )) ||
          "Ask about scoped changes, publication, availability, or a specific conflict in this week. I do not have enough information to answer that question.";
      } catch {
        answer =
          "The online assistant is unavailable. You can still ask about scoped changes, publication, availability and current conflicts.";
      }
    }
    setMessages((m) => [...m, `You: ${question}`, answer]);
    setBusy(false);
  }
  return (
    <>
      <button
        className="fixed bottom-5 right-5 z-30 rounded-2xl bg-navy px-5 py-3 font-semibold text-white shadow-lg print:hidden"
        onClick={() => setOpen(true)}
      >
        Help
      </button>
      {open && (
        <Modal title="Timetable assistant" onClose={() => setOpen(false)}>
          <p className="mb-4 text-xs text-slate-500">
            {c.campus} · {c.weekStart} ·{" "}
            {c.canWrite ? "Shared data" : "Last available data"}
          </p>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {messages.map((m, i) => (
              <p
                key={i}
                className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm"
              >
                {m}
              </p>
            ))}
          </div>
          <form className="mt-4" onSubmit={ask}>
            <Field label="Question">
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Why does this module have a conflict?"
              />
            </Field>
            <button className="btn-primary mt-3" disabled={busy || !q.trim()}>
              {busy ? "Checking…" : "Ask"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
