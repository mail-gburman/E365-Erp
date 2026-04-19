import React from "react";

const CODES = [
  ["+91","🇮🇳 IN"],["+1","🇺🇸 US"],["+44","🇬🇧 UK"],["+971","🇦🇪 AE"],
  ["+65","🇸🇬 SG"],["+49","🇩🇪 DE"],["+61","🇦🇺 AU"],["+81","🇯🇵 JP"],
  ["+86","🇨🇳 CN"],["+33","🇫🇷 FR"],["+7","🇷🇺 RU"],["+966","🇸🇦 SA"],
  ["+974","🇶🇦 QA"],["+968","🇴🇲 OM"],["+973","🇧🇭 BH"],["+60","🇲🇾 MY"],
];

/** Single-string phone — stores "+91XXXXXXXXXX" in one field */
export default function PhoneInput({ value, onChange, placeholder = "Phone number", required }) {
  let cc = "+91", num = value || "";
  for (const [code] of CODES) {
    if ((value || "").startsWith(code)) {
      cc = code;
      num = (value || "").slice(code.length);
      break;
    }
  }
  return (
    <div style={{ display:"flex", gap:4 }}>
      <select value={cc} style={{ width:108, flexShrink:0 }} onChange={e => onChange(e.target.value + num)}>
        {CODES.map(([code, label]) => <option key={code} value={code}>{label} {code}</option>)}
      </select>
      <input value={num} placeholder={placeholder} style={{ flex:1 }} required={required}
        onChange={e => onChange(cc + e.target.value)} />
    </div>
  );
}

/** Country-code select only — for forms that store code + number separately */
export function CountryCodeSelect({ value, onChange }) {
  return (
    <select value={value || "+91"} onChange={e => onChange(e.target.value)} style={{ width:108 }}>
      {CODES.map(([code, label]) => <option key={code} value={code}>{label} {code}</option>)}
    </select>
  );
}
