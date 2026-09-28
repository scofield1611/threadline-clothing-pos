import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title?: string; description?: string; actions?: ReactNode }) {
  if (!title && !description && !actions) return null;
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        {title && <h2 className="font-display text-base font-semibold">{title}</h2>}
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
