import React, { useMemo, useState } from "react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_META = {
  travel_day: { label: "Travel Day", color: "#fb7185" },
  shoot_date: { label: "Shoot Day", color: "#4ade80" },
  end_day: { label: "End Day", color: "#f87171" },
  setup_date: { label: "Setup Day", color: "#f59e0b" },
  technical_date: { label: "Technical Day", color: "#38bdf8" },
  off_day: { label: "Off Day", color: "#94a3b8" },
  return_day: { label: "Return Day", color: "#c084fc" },
};

function formatDateValue(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(day);
  return cells;
}

export default function DatePicker({ selectedDates = [], onChange, dateTypes = [] }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [activeType, setActiveType] = useState(dateTypes[0] || "shoot_date");

  const selectedLookup = useMemo(() => {
    const map = new Map();
    selectedDates.forEach((entry) => {
      if (!map.has(entry.date)) map.set(entry.date, []);
      map.get(entry.date).push(entry.type);
    });
    return map;
  }, [selectedDates]);

  const sortedSelectedDates = useMemo(() => {
    return [...selectedDates].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.type.localeCompare(b.type);
    });
  }, [selectedDates]);

  function changeMonth(offset) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  function toggleDate(day) {
    const date = formatDateValue(cursor.getFullYear(), cursor.getMonth(), day);
    const exists = selectedDates.some((entry) => entry.date === date && entry.type === activeType);
    if (exists) {
      onChange(selectedDates.filter((entry) => !(entry.date === date && entry.type === activeType)));
      return;
    }
    onChange([...selectedDates, { date, type: activeType }]);
  }

  function clearDate(date) {
    onChange(selectedDates.filter((entry) => entry.date !== date));
  }

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth());

  return (
    <div className="datePickerCard">
      <div className="datePickerToolbar">
        <div className="dateTypeToolbar">
          {dateTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={`dateTypeBtn ${activeType === type ? "dateTypeBtnActive" : ""}`}
              style={{
                "--date-type-color": TYPE_META[type]?.color || "#e5e7eb",
              }}
              onClick={() => setActiveType(type)}
            >
              <span className="dateTypeDot" />
              {TYPE_META[type]?.label || type}
            </button>
          ))}
        </div>
        <div className="datePickerMonthNav">
          <button type="button" className="ghostBtn compactBtn" onClick={() => changeMonth(-1)}>&larr;</button>
          <strong>{cursor.toLocaleString("default", { month: "long", year: "numeric" })}</strong>
          <button type="button" className="ghostBtn compactBtn" onClick={() => changeMonth(1)}>&rarr;</button>
        </div>
      </div>

      <div className="datePickerGrid">
        {DAY_NAMES.map((name) => <div key={name} className="datePickerDayLabel">{name}</div>)}
        {cells.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} className="datePickerCell datePickerCellEmpty" />;
          const date = formatDateValue(cursor.getFullYear(), cursor.getMonth(), day);
          const dateTypesForCell = selectedLookup.get(date) || [];
          const background = dateTypesForCell.length
            ? `linear-gradient(135deg, ${dateTypesForCell.map((type, idx) => `${TYPE_META[type]?.color || "#e5e7eb"} ${idx * (100 / dateTypesForCell.length)}% ${Math.min(100, (idx + 1) * (100 / dateTypesForCell.length))}%`).join(", ")})`
            : undefined;
          return (
            <button
              key={date}
              type="button"
              className={`datePickerCell ${dateTypesForCell.includes(activeType) ? "datePickerCellActive" : ""}`}
              onClick={() => toggleDate(day)}
              style={{ background }}
            >
              <span>{day}</span>
              <span className="datePickerCellDots">
                {dateTypesForCell.map((type) => (
                  <span key={`${date}-${type}`} className="datePickerCellDot" style={{ backgroundColor: TYPE_META[type]?.color || "#fff" }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="datePickerSelection">
        <div className="datePickerSelectionHead">
          <strong>Selected Dates</strong>
          {sortedSelectedDates.length > 0 && (
            <button type="button" className="ghostBtn compactBtn" onClick={() => onChange([])}>Clear All</button>
          )}
        </div>
        {sortedSelectedDates.length === 0 ? (
          <p className="helperText">Choose a date type, then click dates on the calendar. One date can carry multiple tags.</p>
        ) : (
          <div className="selectedChips">
            {sortedSelectedDates.map((entry) => (
              <span className="chip" key={`${entry.date}-${entry.type}`}>
                <span className="datePickerChipSwatch" style={{ backgroundColor: TYPE_META[entry.type]?.color || "#fff" }} />
                {entry.date} · {TYPE_META[entry.type]?.label || entry.type}
                <button type="button" onClick={() => onChange(selectedDates.filter((item) => !(item.date === entry.date && item.type === entry.type)))}>x</button>
              </span>
            ))}
          </div>
        )}
        {[...selectedLookup.keys()].length > 0 && (
          <div className="datePickerGroupedDates">
            {[...selectedLookup.keys()].sort().map((date) => (
              <button key={date} type="button" className="ghostBtn compactBtn" onClick={() => clearDate(date)}>
                Clear {date}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
