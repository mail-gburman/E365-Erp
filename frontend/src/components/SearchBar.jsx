import React, { useId, useMemo } from "react";

function flattenValue(value, parts = []) {
  if (value == null) return parts;
  if (["string", "number", "boolean"].includes(typeof value)) {
    const text = String(value).trim();
    if (text) parts.push(text);
    return parts;
  }
  if (Array.isArray(value)) {
    value.forEach(item => flattenValue(item, parts));
    return parts;
  }
  if (typeof value === "object") {
    Object.values(value).forEach(item => flattenValue(item, parts));
  }
  return parts;
}

export function searchableText(row) {
  return flattenValue(row).join(" ").toLowerCase();
}

export function buildSuggestions(rows, max = 80) {
  const values = new Set();
  rows.forEach(row => {
    flattenValue(row).forEach(text => {
      const cleaned = String(text).trim();
      if (cleaned && cleaned.length <= 80) values.add(cleaned);
    });
  });
  return Array.from(values).slice(0, max);
}

export function useSearch(rows, query) {
  return useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => searchableText(row).includes(q));
  }, [rows, query]);
}

export default function SearchBar({ value, onChange, suggestions = [], placeholder = "Search by name, number, code, job card..." }) {
  const id = useId();
  const options = useMemo(() => Array.from(new Set(suggestions.filter(Boolean))).slice(0, 80), [suggestions]);
  return (
    <div className="predictiveSearchWrap">
      <input
        className="predictiveSearchInput"
        list={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <datalist id={id}>
        {options.map(option => <option key={option} value={option} />)}
      </datalist>
    </div>
  );
}
