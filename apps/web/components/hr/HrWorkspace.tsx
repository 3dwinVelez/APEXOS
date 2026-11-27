import type { ReactNode } from "react";
import styles from "./HrWorkspace.module.css";

export { styles as hrStyles };

export function HrKpis({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <div className={styles.kpis}>{items.map(item => (
    <div className={styles.kpi} key={item.label}>
      <small>{item.label}</small><strong>{item.value}</strong>
    </div>
  ))}</div>;
}

export function HrSteps({ labels }: { labels: string[] }) {
  return <div className={styles.steps} aria-label="Etapas del proceso">{labels.map((label, index) => (
    <span key={label}><b>{index + 1}</b>{label}</span>
  ))}</div>;
}

export function HrNet({ label = "Neto a pagar", value }: { label?: string; value: ReactNode }) {
  return <div className={styles.net}><small>{label}</small><strong>{value}</strong></div>;
}

export function HrSegmented({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  return <fieldset><legend className="text-sm font-medium">{label}</legend>
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  </fieldset>;
}
