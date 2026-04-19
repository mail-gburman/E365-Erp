import React, { useState, useRef, useEffect, useMemo } from "react";
import { FLAT_INDIAN_LOCATIONS } from "../data/indianLocations";

/**
 * LocationAutocomplete — predictive dropdown for Indian location fields.
 * Searches through States, Cities, and Localities.
 * Also merges in any extra suggestions (e.g. previously used values from DB).
 *
 * Props:
 *   value        – controlled value
 *   onChange      – callback(newValue)
 *   extraSuggestions – array of additional strings to include (e.g. existing DB values)
 *   placeholder  – input placeholder
 *   required     – HTML required attribute
 *   className    – additional CSS class
 */
export default function LocationAutocomplete({
  value,
  onChange,
  extraSuggestions = [],
  placeholder = "Search location...",
  required = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const wrapRef = useRef(null);

  // Merge extra suggestions with Indian locations (deduplicated)
  const allSuggestions = useMemo(() => {
    const extras = extraSuggestions.filter(Boolean);
    if (!extras.length) return FLAT_INDIAN_LOCATIONS;
    const set = new Set(FLAT_INDIAN_LOCATIONS);
    extras.forEach(s => set.add(s));
    return Array.from(set);
  }, [extraSuggestions]);

  useEffect(() => {
    if (!value || !value.trim()) {
      setFiltered([]);
      return;
    }
    const q = value.toLowerCase().trim();
    const tokens = q.split(/[\s,]+/).filter(Boolean);

    // Score-based matching: prioritize starts-with and multi-token matches
    const scored = [];
    for (const s of allSuggestions) {
      const lower = s.toLowerCase();
      if (lower === q) continue; // skip exact match

      // All tokens must appear somewhere in the string
      const allMatch = tokens.every(t => lower.includes(t));
      if (!allMatch) continue;

      // Score: starts-with gets priority, then position-based
      let score = 0;
      if (lower.startsWith(q)) score += 100;
      else if (lower.includes(`, ${q}`)) score += 80;
      tokens.forEach(t => {
        if (lower.startsWith(t)) score += 50;
        const idx = lower.indexOf(t);
        if (idx >= 0) score += Math.max(0, 30 - idx);
      });

      scored.push({ text: s, score });
    }

    scored.sort((a, b) => b.score - a.score);
    setFiltered(scored.slice(0, 12).map(x => x.text));
  }, [value, allSuggestions]);

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
    <div className="autocompleteWrap locationAutocomplete" ref={wrapRef}>
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
        <div className="autocompleteDropdown locationDropdown">
          {filtered.map((s, i) => {
            // Highlight matching parts
            const parts = s.split(", ");
            return (
              <div
                key={i}
                className="autocompleteOption locationOption"
                onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}
              >
                <span className="locMain">{parts[0]}</span>
                {parts.length > 1 && <span className="locSub">{parts.slice(1).join(", ")}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
