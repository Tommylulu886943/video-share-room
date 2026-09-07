"use client";

import type { MemberField } from "@/lib/member-fields";

export function MemberFields({ fields, values, onChange, prefix = "attribute" }: {
  fields: MemberField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  prefix?: string;
}) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {fields.map(field => <div key={field.id}>
      <label className="label" htmlFor={`${prefix}-${field.id}`}>
        {field.label}（{field.required ? "必填" : "選填"}）
      </label>
      <input id={`${prefix}-${field.id}`} className="input" maxLength={500}
        required={field.required} value={values[field.id] ?? ""}
        onChange={e => onChange({ ...values, [field.id]: e.target.value })} />
    </div>)}
  </div>;
}
