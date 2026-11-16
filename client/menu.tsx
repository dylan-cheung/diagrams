import { useEffect, useRef, useState, type ReactNode } from "react";

export type MenuItem = { label: string; danger?: boolean; onSelect: () => void };

// A button that opens a list of actions. A click outside the list or Escape closes it.
export const MenuButton = ({ label, icon, items }: { label: string; icon: ReactNode; items: MenuItem[] }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="row-actions" ref={root} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="icon" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon}
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger === true ? "danger" : undefined}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
