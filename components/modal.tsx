"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="w-[min(94vw,880px)] max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-950/50"
      aria-label={title}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5">
        <h2 className="text-xl font-bold">{title}</h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Close dialog"
          className="btn-secondary"
        >
          Close
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>,
    document.body,
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}
export function FormError({ message }: { message: string }) {
  return message ? (
    <p
      role="alert"
      className="my-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
    >
      {message}
    </p>
  ) : null;
}
