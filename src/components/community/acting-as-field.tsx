"use client";

import { Field, Select } from "@/components/ui/field";
import { useViewer } from "@/components/shell/viewer-context";

// Members who help run an organisation can list things as it. Everyone else
// lists as themselves without seeing a choice.
export function ActingAsField({ name, label, onChange }: { name: string; label: string; onChange?: (profileId: string) => void }) {
  const viewer = useViewer();
  if (!viewer) return null;
  if (viewer.organisations.length === 0) return <input type="hidden" name={name} value={viewer.id} />;
  return (
    <Field label={label} htmlFor={name}>
      <Select id={name} name={name} defaultValue={viewer.id} onChange={(event) => onChange?.(event.target.value)}>
        <option value={viewer.id}>You ({viewer.displayName})</option>
        {viewer.organisations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.displayName}
          </option>
        ))}
      </Select>
    </Field>
  );
}
