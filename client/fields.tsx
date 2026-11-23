import { useEffect, useState, type KeyboardEvent } from "react";
import { formatPropertyValue, parsePropertyValue, type Properties, type Term } from "../model.ts";

// The attributes that stop password managers from offering to fill a text field.
export const NO_FILL = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-bwignore": true, "data-form-type": "other" } as const;

// A text without a label, edited in place. It saves when it loses focus. With required, an empty text keeps the old one.
export const InlineText = ({
  value,
  label,
  onCommit,
  onFocus,
  placeholder,
  multiline = false,
  required = false,
  className,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  className?: string;
}) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (required && text.trim() === "") setText(value);
    else if (text !== value) onCommit(text);
  };
  const shared = {
    className,
    value: text,
    placeholder,
    "aria-label": label,
    onFocus,
    onBlur: commit,
    ...NO_FILL,
  };
  return multiline ? (
    <textarea
      {...shared}
      rows={Math.max(2, text.split("\n").length)}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setText(value);
      }}
    />
  ) : (
    <input
      {...shared}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setText(value);
      }}
    />
  );
};

export const TextField = ({
  label,
  value,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
}) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") setText(value);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={onKeyDown} />
    </label>
  );
};

export const TextAreaField = ({
  label,
  value,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
}) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") setText(value);
        }}
      />
    </label>
  );
};

export const SelectField = ({
  label,
  value,
  options,
  empty,
  onCommit,
}: {
  label: string;
  value: string | null;
  options: Term[];
  empty: string;
  onCommit: (value: string | null) => void;
}) => {
  const selected = options.find(({ id }) => id === value);
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => onCommit(e.target.value === "" ? null : e.target.value)}>
        <option value="">{empty}</option>
        {value != null && selected == null && <option value={value}>{value} (not in the libraries of this graph)</option>}
        {options.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      {selected != null && selected.description !== "" && <small className="hint">{selected.description}</small>}
    </label>
  );
};

type Row = { key: string; value: string };

const toRows = (properties: Properties): Row[] =>
  Object.entries(properties).map(([key, value]) => ({ key, value: formatPropertyValue(value) }));

const toProperties = (rows: Row[]): Properties =>
  Object.fromEntries(rows.filter(({ key }) => key.trim() !== "").map(({ key, value }) => [key.trim(), parsePropertyValue(value)]));

export const PropertiesField = ({
  properties,
  onCommit,
}: {
  properties: Properties;
  onCommit: (properties: Properties) => void;
}) => {
  const [rows, setRows] = useState(() => toRows(properties));
  useEffect(() => setRows(toRows(properties)), [properties]);
  const commit = (next: Row[]) => {
    const value = toProperties(next);
    if (JSON.stringify(value) !== JSON.stringify(properties)) onCommit(value);
  };
  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="field">
      <span>Properties</span>
      {rows.map((row, index) => (
        <div className="property" key={index}>
          <input placeholder="key" value={row.key} onChange={(e) => update(index, { key: e.target.value })} onBlur={() => commit(rows)} />
          <input placeholder="value" value={row.value} onChange={(e) => update(index, { value: e.target.value })} onBlur={() => commit(rows)} />
          <button
            type="button"
            className="icon"
            aria-label="Remove property"
            onClick={() => {
              const next = rows.filter((_, i) => i !== index);
              setRows(next);
              commit(next);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { key: "", value: "" }])}>
        Add property
      </button>
    </div>
  );
};
