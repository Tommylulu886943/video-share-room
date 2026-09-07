"use client";
import type { MemberField } from "@/lib/member-fields";

export function MemberFieldEditor({ fields, onChange }: {
  fields: MemberField[]; onChange: (fields: MemberField[]) => void;
}) {
  return <section className="space-y-3 border-t border-slate-200 pt-4">
    <h3 className="text-sm font-semibold">成員自訂欄位（{fields.length}/10）</h3>
    <p className="text-xs text-slate-500">例如年齡、職業、級數。管理者及加入社團的成員都需填寫必填欄位。</p>
    {fields.map((field, index) => <div key={field.id} className="flex flex-wrap items-center gap-3">
      <input className="input flex-1" aria-label={`欄位 ${index + 1} 名稱`} placeholder="欄位名稱" required maxLength={60}
        value={field.label} onChange={e => onChange(fields.map(f => f.id === field.id ? { ...f, label: e.target.value } : f))} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required}
        onChange={e => onChange(fields.map(f => f.id === field.id ? { ...f, required: e.target.checked } : f))} />必填</label>
      <button type="button" className="btn-outline" aria-label={`移除欄位 ${index + 1}`}
        onClick={() => onChange(fields.filter(f => f.id !== field.id))}>移除</button>
    </div>)}
    <button type="button" className="btn-outline" disabled={fields.length >= 10}
      onClick={() => onChange([...fields, { id: crypto.randomUUID(), label: "", required: false }])}>＋ 新增欄位</button>
  </section>;
}
