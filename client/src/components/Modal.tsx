// Native <dialog> gives focus trapping, Escape, and an inert background for free.
import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  /** Full-screen for safety prompts. */
  fullScreen?: boolean;
  /** Right-hand drawer for the Care Team patient detail. */
  drawer?: boolean;
  /** Panel anchored to the bottom-right corner that slides up (the floating chat). */
  corner?: boolean;
  /** Close when the dimmed area outside the panel is tapped. */
  closeOnBackdrop?: boolean;
  className?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, labelledBy, describedBy, fullScreen, drawer, corner, closeOnBackdrop, className = '', children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the <dialog> itself (not its content) is a click on the backdrop.
      onClick={closeOnBackdrop ? (e) => e.target === e.currentTarget && onClose() : undefined}
      className={`bg-paper text-ink shadow-2xl backdrop:bg-ink/50 ${
        fullScreen
          ? 'm-0 h-full max-h-none w-full max-w-none p-0'
          : drawer
            ? 'm-0 ml-auto h-full max-h-none w-[min(44rem,100%)] max-w-none p-0'
            : corner
              ? 'slide-up-corner fixed inset-auto bottom-4 right-4 m-0 max-h-[calc(100%-2rem)] w-[min(36rem,calc(100%-2rem))] max-w-none rounded-blob p-0'
              : 'w-[min(36rem,calc(100%-2rem))] rounded-blob p-0'
      } ${className}`}
    >
      {open && children}
    </dialog>
  );
}
