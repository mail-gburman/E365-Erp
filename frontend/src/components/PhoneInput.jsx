import React from "react";

const CODES = [
  // India first (default)
  ["+91","🇮🇳 India"],
  // South Asia
  ["+92","🇵🇰 Pakistan"],["+880","🇧🇩 Bangladesh"],["+94","🇱🇰 Sri Lanka"],
  ["+977","🇳🇵 Nepal"],["+975","🇧🇹 Bhutan"],["+960","🇲🇻 Maldives"],
  ["+93","🇦🇫 Afghanistan"],
  // Southeast Asia
  ["+65","🇸🇬 Singapore"],["+60","🇲🇾 Malaysia"],["+62","🇮🇩 Indonesia"],
  ["+63","🇵🇭 Philippines"],["+66","🇹🇭 Thailand"],["+84","🇻🇳 Vietnam"],
  ["+95","🇲🇲 Myanmar"],["+856","🇱🇦 Laos"],["+855","🇰🇭 Cambodia"],
  ["+673","🇧🇳 Brunei"],["+670","🇹🇱 East Timor"],
  // East Asia
  ["+86","🇨🇳 China"],["+81","🇯🇵 Japan"],["+82","🇰🇷 South Korea"],
  ["+852","🇭🇰 Hong Kong"],["+853","🇲🇴 Macau"],["+886","🇹🇼 Taiwan"],
  ["+850","🇰🇵 North Korea"],
  // Middle East / Gulf
  ["+971","🇦🇪 UAE"],["+966","🇸🇦 Saudi Arabia"],["+974","🇶🇦 Qatar"],
  ["+968","🇴🇲 Oman"],["+973","🇧🇭 Bahrain"],["+965","🇰🇼 Kuwait"],
  ["+962","🇯🇴 Jordan"],["+961","🇱🇧 Lebanon"],["+972","🇮🇱 Israel"],
  ["+964","🇮🇶 Iraq"],["+963","🇸🇾 Syria"],["+967","🇾🇪 Yemen"],
  ["+98","🇮🇷 Iran"],
  // Europe
  ["+44","🇬🇧 UK"],["+49","🇩🇪 Germany"],["+33","🇫🇷 France"],
  ["+39","🇮🇹 Italy"],["+34","🇪🇸 Spain"],["+31","🇳🇱 Netherlands"],
  ["+32","🇧🇪 Belgium"],["+41","🇨🇭 Switzerland"],["+43","🇦🇹 Austria"],
  ["+351","🇵🇹 Portugal"],["+46","🇸🇪 Sweden"],["+47","🇳🇴 Norway"],
  ["+45","🇩🇰 Denmark"],["+358","🇫🇮 Finland"],["+354","🇮🇸 Iceland"],
  ["+353","🇮🇪 Ireland"],["+30","🇬🇷 Greece"],["+90","🇹🇷 Turkey"],
  ["+48","🇵🇱 Poland"],["+420","🇨🇿 Czech Republic"],["+36","🇭🇺 Hungary"],
  ["+40","🇷🇴 Romania"],["+359","🇧🇬 Bulgaria"],["+7","🇷🇺 Russia"],
  ["+380","🇺🇦 Ukraine"],["+375","🇧🇾 Belarus"],["+370","🇱🇹 Lithuania"],
  ["+371","🇱🇻 Latvia"],["+372","🇪🇪 Estonia"],["+421","🇸🇰 Slovakia"],
  ["+386","🇸🇮 Slovenia"],["+385","🇭🇷 Croatia"],["+381","🇷🇸 Serbia"],
  ["+382","🇲🇪 Montenegro"],["+387","🇧🇦 Bosnia"],["+389","🇲🇰 North Macedonia"],
  ["+355","🇦🇱 Albania"],["+383","🇽🇰 Kosovo"],["+356","🇲🇹 Malta"],
  ["+357","🇨🇾 Cyprus"],["+352","🇱🇺 Luxembourg"],["+377","🇲🇨 Monaco"],
  // Americas
  ["+1","🇺🇸 USA / Canada"],["+52","🇲🇽 Mexico"],["+55","🇧🇷 Brazil"],
  ["+54","🇦🇷 Argentina"],["+56","🇨🇱 Chile"],["+57","🇨🇴 Colombia"],
  ["+51","🇵🇪 Peru"],["+58","🇻🇪 Venezuela"],["+593","🇪🇨 Ecuador"],
  ["+591","🇧🇴 Bolivia"],["+595","🇵🇾 Paraguay"],["+598","🇺🇾 Uruguay"],
  ["+53","🇨🇺 Cuba"],["+1787","🇵🇷 Puerto Rico"],["+502","🇬🇹 Guatemala"],
  ["+503","🇸🇻 El Salvador"],["+504","🇭🇳 Honduras"],["+505","🇳🇮 Nicaragua"],
  ["+506","🇨🇷 Costa Rica"],["+507","🇵🇦 Panama"],["+1809","🇩🇴 Dominican Republic"],
  ["+1876","🇯🇲 Jamaica"],["+1868","🇹🇹 Trinidad & Tobago"],
  // Oceania
  ["+61","🇦🇺 Australia"],["+64","🇳🇿 New Zealand"],["+679","🇫🇯 Fiji"],
  ["+675","🇵🇬 Papua New Guinea"],["+685","🇼🇸 Samoa"],
  // Africa
  ["+27","🇿🇦 South Africa"],["+234","🇳🇬 Nigeria"],["+254","🇰🇪 Kenya"],
  ["+233","🇬🇭 Ghana"],["+255","🇹🇿 Tanzania"],["+256","🇺🇬 Uganda"],
  ["+251","🇪🇹 Ethiopia"],["+20","🇪🇬 Egypt"],["+212","🇲🇦 Morocco"],
  ["+213","🇩🇿 Algeria"],["+216","🇹🇳 Tunisia"],["+218","🇱🇾 Libya"],
  ["+249","🇸🇩 Sudan"],["+260","🇿🇲 Zambia"],["+263","🇿🇼 Zimbabwe"],
  ["+225","🇨🇮 Ivory Coast"],["+237","🇨🇲 Cameroon"],["+243","🇨🇩 DR Congo"],
  ["+221","🇸🇳 Senegal"],["+223","🇲🇱 Mali"],["+250","🇷🇼 Rwanda"],
  ["+261","🇲🇬 Madagascar"],["+230","🇲🇺 Mauritius"],
];

// Sort by prefix length descending so longer prefixes match first (e.g. +1876 before +1)
const SORTED_CODES = [...CODES].sort((a, b) => b[0].length - a[0].length);

function parsePhone(value) {
  const v = value || "";
  for (const [code] of SORTED_CODES) {
    if (v.startsWith(code)) return { cc: code, num: v.slice(code.length) };
  }
  return { cc: "+91", num: v };
}

/** Single-string phone — stores "+91XXXXXXXXXX" in one field */
export default function PhoneInput({ value, onChange, placeholder = "Phone number", required }) {
  const { cc, num } = parsePhone(value);
  return (
    <div style={{ display:"flex", gap:4 }}>
      <select value={cc} style={{ width:160, flexShrink:0 }} onChange={e => onChange(e.target.value + num)}>
        {CODES.map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}
      </select>
      <input value={num} placeholder={placeholder} style={{ flex:1 }} required={required}
        onChange={e => onChange(cc + e.target.value)} />
    </div>
  );
}

/** Country-code select only — for forms that store code + number separately */
export function CountryCodeSelect({ value, onChange }) {
  return (
    <select value={value || "+91"} onChange={e => onChange(e.target.value)} style={{ width:160 }}>
      {CODES.map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}
    </select>
  );
}
