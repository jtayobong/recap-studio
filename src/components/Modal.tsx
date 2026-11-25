import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Thin wrapper around the native <dialog> element: the browser handles focus trapping,
 * Escape to close, and the inert background for us.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  /** Set when we close the dialog ourselves, so its (asynchronous) close event isn't reported. */
  const closingRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      closingRef.current = false;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      closingRef.current = true;
      dialog.close();
    }
  }, [open]);

  // Report only closes the user caused (Escape). A close we triggered because `open` became false
  // fires its event later, possibly after the dialog was reopened; reporting it then would close
  // the new dialog straight away.
  const handleClose = () => {
    if (closingRef.current) {
      closingRef.current = false;
      return;
    }
    if (ref.current?.open) return;
    onClose();
  };

  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onClose={handleClose}>
      {open && (
        <>
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          {children}
        </>
      )}
    </dialog>
  );
}
