import React, { useState, useRef, useEffect } from "react";

/**
 * AutocompleteInput – predictive dropdown for text fields.
 *
 * Props:
 *   value        – controlled value
 *   onChange      – callback(newValue)
 *   suggestions  – array of strings to filter from
 *   placeholder  – input placeholder
 *   required     – HTML required attribute
 *   className    – additional CSS class
 */
export default function AutocompleteInput({ value, onChange, suggestions = [], placeholder = "", required = false, className = "" }) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!value || !value.trim()) {
      setFiltered([]);
      return;
    }
    const q = value.toLowerCase();
    const matches = suggestions
      .filter(s => s && s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      .slice(0, 8);
    setFiltered(matches);
  }, [value, suggestions]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="autocompleteWrap" ref={wrapRef}>
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        required={required}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="autocompleteDropdown">
          {filtered.map((s, i) => (
            <div
              key={i}
              className="autocompleteOption"
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
