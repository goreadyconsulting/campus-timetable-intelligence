"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  placement = "center",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
  placement?: "center" | "side";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className={`${placement === "side" ? "fixed inset-y-0 left-auto right-0 m-0 h-[100dvh] max-h-[100dvh] w-full max-w-[560px] rounded-none backdrop:bg-slate-950/20" : "w-[min(94vw,880px)] max-h-[90vh] rounded-2xl backdrop:bg-slate-950/50"} overflow-y-auto bg-white p-0 shadow-2xl`}
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
    <label className="grid content-start gap-1 text-sm font-medium text-slate-700">
      {label}
      {Children.map(children, (child) =>
        isValidElement<{ "aria-label"?: string }>(child) &&
        typeof child.type === "string" &&
        ["input", "select", "textarea"].includes(child.type)
          ? cloneElement(child, {
              "aria-label": child.props["aria-label"] || label,
            })
          : child,
      )}
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
