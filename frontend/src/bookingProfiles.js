const BASE_FEATURES = {
  maintenance: true,
  warranty: true,
  serviceJobs: true,
  returns: true,
  accessories: true,
  thirdParty: true,
  paxPrimary: false,
  contractTracking: false,
  consumableStock: true,
  riders: false,
  individualAvailability: false,
  attendance: false,
  conditionQc: true,
  dispatchReturn: true,
  subSpaces: false,
  warehouse: true,
};

const BASE_DATES = ["travel_day", "setup_date", "technical_date", "shoot_date", "off_day", "end_day", "return_day"];
const NO_RETURN_DATES = ["setup_date", "technical_date", "shoot_date", "off_day", "end_day"];

const COMMON = {
  eventTitle: "Event",
  bookingLabel: "Booking",
  crewLabel: "Crew",
  personnelLabel: "Personnel",
};

const equipmentTypes = [
  ["device", "Device - standalone bookable unit"],
  ["accessory", "Accessory - travels with a device"],
  ["kit", "Kit - named collection (auto-expands in booking)"],
  ["bundle", "Bundle - pre-packaged multi-device set"],
  ["third_party_equipment", "Third-Party Equipment - rented from vendor"],
  ["consumable", "Consumable - stock-depleted item"],
];

const baseReplacements = [
  ["Shoots", "Events"], ["shoots", "events"], ["SHOOTS", "EVENTS"],
  ["Shoot", "Event"], ["shoot", "event"], ["SHOOT", "EVENT"],
];

function profile({
  value,
  label,
  addLabel,
  registryLabel,
  resourceLabel,
  resourcePlural,
  utilizationLabel,
  complianceLabel,
  serviceLabel,
  conflictLabel,
  returnLabel,
  thirdPartyLabel,
  operationsLabel,
  vendorsLabel,
  features,
  itemTypes,
  replacements = [],
  extraFields = {},
  documents = {},
  dateTypes,
  workflow = {},
}) {
  return {
    ...COMMON,
    value,
    label,
    addLabel,
    registryLabel,
    resourceLabel,
    resourcePlural,
    utilizationLabel,
    complianceLabel,
    serviceLabel,
    conflictLabel,
    returnLabel,
    thirdPartyLabel,
    operationsLabel,
    vendorsLabel,
    features: { ...BASE_FEATURES, ...features },
    itemTypes,
    replacements: [...baseReplacements, ...replacements],
    extraFields,
    documents: {
      gatePass: "Gate Pass",
      jobCard: "Job Card",
      challan: "Road Challan",
      manpower: "Manpower Sheet",
      damage: "Damage Report",
      ...documents,
    },
    dateTypes: dateTypes || BASE_DATES,
    workflow,
  };
}

export const BOOKING_PROFILES = [
  profile({
    value: "equipment",
    label: "Equipment Booking",
    addLabel: "Additions",
    registryLabel: "Master Registry",
    resourceLabel: "Equipment",
    resourcePlural: "Equipment",
    utilizationLabel: "Equipment Utilization",
    complianceLabel: "Warranty Expiring Soon",
    serviceLabel: "Equipment in Service",
    conflictLabel: "Equipment conflicts",
    returnLabel: "Returns due today",
    thirdPartyLabel: "3rd Party Equipment",
    operationsLabel: "Papers & QC",
    vendorsLabel: "Vendors & Procurement",
    itemTypes: equipmentTypes,
    extraFields: {
      inventory: ["Calibration notes", "Insurance policy", "Replacement value"],
    },
  }),
  profile({
    value: "artist",
    label: "Artist Booking",
    addLabel: "Add Artist",
    registryLabel: "Artist Registry",
    resourceLabel: "Artist",
    resourcePlural: "Artists",
    utilizationLabel: "Artist Booking Load",
    complianceLabel: "Contracts / Riders Pending",
    serviceLabel: "Artist Holds",
    conflictLabel: "Artist conflicts",
    returnLabel: "Follow-ups due today",
    thirdPartyLabel: "External Artists",
    operationsLabel: "Contracts & Riders",
    vendorsLabel: "Agencies & Managers",
    features: { maintenance: false, warranty: false, serviceJobs: false, returns: false, accessories: false, warehouse: false, contractTracking: true, riders: true, individualAvailability: true, conditionQc: false, dispatchReturn: false, consumableStock: false },
    itemTypes: [["device", "Solo Artist"], ["kit", "Band / Group"], ["bundle", "Artist Package"], ["third_party_equipment", "External Artist / Agency"]],
    dateTypes: NO_RETURN_DATES,
    documents: { gatePass: "Performance Call Sheet", jobCard: "Show Brief / Technical Rider", challan: "Travel Sheet", damage: "Cancellation / No-Show Report" },
    extraFields: {
      inventory: ["Genre / Category", "Performance duration", "Technical rider requirements", "Hospitality rider requirements", "Agent / Manager contact", "Contract expiry date", "Blackout dates", "Base fee / day rate", "Travel requirements", "Playlist / set list attachment"],
      booking: ["Performance slot", "Green room requirement", "Soundcheck time", "Hospitality notes"],
      vendor: ["Agency commission", "Manager contact", "Contract template"],
    },
    replacements: [
      ["Vendors & Procurement", "Agencies & Managers"], ["Equipment Master", "Artist Category"], ["equipment master", "artist category"],
      ["Master Registry", "Artist Registry"], ["Additions", "Add Artist"], ["Inventory", "Artist Roster"], ["inventory", "artist roster"], ["INVENTORY", "ARTIST ROSTER"],
      ["Equipments", "Artists"], ["equipments", "artists"], ["EQUIPMENTS", "ARTISTS"],
      ["Asset Code", "Artist Code"], ["Serial Number", "Contract ID"], ["Warranty Expiring Soon", "Contracts / Riders Pending"],
      ["Warranty", "Contract"], ["warranty", "contract"], ["Service Jobs", "Contract Follow-ups"], ["In Service", "On Hold"], ["in Service", "on Hold"], ["in_service", "on_hold"],
      ["Returns due today", "Follow-ups due today"], ["under repair / maintenance", "availability / booking hold"], ["Warehouse", "Availability Group"], ["warehouse", "availability group"],
      ["Equipment Utilization", "Artist Booking Load"], ["3rd Party Equipment", "External Artists"], ["Equipment in Service", "Artist Holds"], ["Equipment conflicts", "Artist conflicts"],
      ["Papers & QC", "Contracts & Riders"], ["Gate Pass", "Performance Call Sheet"], ["Job Card", "Show Brief"], ["Damage / Missing", "Cancellation / No-Show"],
      ["Equipment", "Artist"], ["equipment", "artist"], ["EQUIPMENT", "ARTIST"],
    ],
  }),
  profile({
    value: "venue",
    label: "Venue Booking",
    addLabel: "Add Venue",
    registryLabel: "Venue Registry",
    resourceLabel: "Venue",
    resourcePlural: "Venues",
    utilizationLabel: "Venue Occupancy",
    complianceLabel: "Permits / Licenses Pending",
    serviceLabel: "Venue Maintenance Holds",
    conflictLabel: "Venue conflicts",
    returnLabel: "Check-outs due today",
    thirdPartyLabel: "Partner Venues",
    operationsLabel: "Contracts & Permits",
    vendorsLabel: "Venue Partners",
    features: { warranty: false, returns: false, accessories: false, paxPrimary: true, contractTracking: true, attendance: true, subSpaces: true, dispatchReturn: false },
    itemTypes: [["device", "Room / Hall"], ["kit", "Zone / Floor"], ["bundle", "Full Venue Buyout"], ["third_party_equipment", "Partner Venue"]],
    dateTypes: NO_RETURN_DATES,
    documents: { gatePass: "Venue Access Letter", jobCard: "Event Layout / Setup Brief", challan: "Vendor Entry Pass", damage: "Venue Damage Report" },
    extraFields: {
      inventory: ["Capacity - seated", "Capacity - theatre", "Capacity - cocktail", "Setup time buffer", "Breakdown time buffer", "Amenities checklist", "Permit / License number", "Permit expiry", "Floor plan / layout file", "Indoor / Outdoor", "Power load capacity (KW)", "Sub-spaces"],
      booking: ["Expected guest count", "Layout style", "Vendor entry window", "Check-in coordinator"],
    },
    replacements: [
      ["Vendors & Procurement", "Venue Partners"], ["Equipment Master", "Venue Type"], ["equipment master", "venue type"],
      ["Master Registry", "Venue Registry"], ["Additions", "Add Venue"], ["Inventory", "Venue Spaces"], ["inventory", "venue spaces"], ["INVENTORY", "VENUE SPACES"],
      ["Equipments", "Venues"], ["equipments", "venues"], ["EQUIPMENTS", "VENUES"],
      ["Warehouse", "Venue Cluster"], ["warehouse", "venue cluster"], ["Asset Code", "Venue Code"], ["Serial Number", "License No."],
      ["Warranty Expiring Soon", "Permits / Licenses Pending"], ["Warranty", "Permit"], ["warranty", "permit"], ["Returns due today", "Check-outs due today"],
      ["Equipment Utilization", "Venue Occupancy"], ["Equipment in Service", "Venue Maintenance Holds"], ["Equipment conflicts", "Venue conflicts"], ["3rd Party Equipment", "Partner Venues"],
      ["Papers & QC", "Contracts & Permits"], ["Gate Pass", "Venue Access Letter"], ["Job Card", "Event Layout Brief"], ["Road Challan", "Vendor Entry Pass"],
      ["Equipment", "Venue"], ["equipment", "venue"], ["EQUIPMENT", "VENUE"],
    ],
  }),
  profile({
    value: "decor",
    label: "Decor Booking",
    addLabel: "Add Decor",
    registryLabel: "Decor Registry",
    resourceLabel: "Decor Item",
    resourcePlural: "Decor Items",
    utilizationLabel: "Decor Utilization",
    complianceLabel: "Condition Checks Due",
    serviceLabel: "Decor Under Repair",
    conflictLabel: "Decor conflicts",
    returnLabel: "Returns due today",
    thirdPartyLabel: "Vendor Decor",
    operationsLabel: "Papers & Condition QC",
    vendorsLabel: "Decor Vendors",
    features: { warranty: false, contractTracking: false },
    itemTypes: [["device", "Decor Item"], ["accessory", "Decor Sub-item"], ["kit", "Theme Kit"], ["bundle", "Decor Package"], ["third_party_equipment", "Vendor Decor"], ["consumable", "Consumable Decor"]],
    documents: { damage: "Condition Report" },
    extraFields: {
      inventory: ["Color / theme tag", "Material type", "Condition rating", "Customization notes", "Owned vs vendor-sourced", "Fragility level", "Event-specific theme tag"],
      booking: ["Theme brief", "Installation notes", "Strike / removal notes"],
    },
    replacements: [
      ["Vendors & Procurement", "Decor Vendors"], ["Equipment Master", "Decor Catalogue"], ["equipment master", "decor catalogue"],
      ["Master Registry", "Decor Registry"], ["Additions", "Add Decor"], ["Inventory", "Decor Inventory"], ["inventory", "decor inventory"], ["INVENTORY", "DECOR INVENTORY"],
      ["Equipments", "Decor Items"], ["equipments", "decor items"], ["EQUIPMENTS", "DECOR ITEMS"],
      ["Asset Code", "Decor Code"], ["Serial Number", "Batch / Set No."], ["Warranty Expiring Soon", "Condition Checks Due"], ["Warranty", "Condition"], ["warranty", "condition"],
      ["Equipment Utilization", "Decor Utilization"], ["Equipment in Service", "Decor Under Repair"], ["Equipment conflicts", "Decor conflicts"], ["3rd Party Equipment", "Vendor Decor"],
      ["Papers & QC", "Papers & Condition QC"], ["Damage Report", "Condition Report"], ["Equipment", "Decor Item"], ["equipment", "decor item"], ["EQUIPMENT", "DECOR ITEM"],
    ],
  }),
  profile({
    value: "catering",
    label: "Catering Booking",
    addLabel: "Add Catering",
    registryLabel: "Catering Registry",
    resourceLabel: "Menu",
    resourcePlural: "Menus",
    utilizationLabel: "Menu Booking Load",
    complianceLabel: "Menu / FSSAI Pending",
    serviceLabel: "Prep Holds",
    conflictLabel: "Kitchen conflicts",
    returnLabel: "Final guest counts due",
    thirdPartyLabel: "Catering Partners",
    operationsLabel: "Menus & Compliance",
    vendorsLabel: "Catering Partners",
    features: { maintenance: false, warranty: false, serviceJobs: false, returns: false, accessories: false, warehouse: false, paxPrimary: true, contractTracking: true, conditionQc: false, dispatchReturn: false },
    itemTypes: [["device", "Menu Package"], ["kit", "Cuisine Station"], ["bundle", "Buffet Package"], ["consumable", "Consumable / Ingredient"], ["third_party_equipment", "Partner Caterer"]],
    dateTypes: NO_RETURN_DATES,
    documents: { gatePass: "Kitchen Brief", jobCard: "Banquet Event Order (BEO)", challan: "F&B Delivery Challan", manpower: "Service Staff Deployment", damage: "Not applicable" },
    extraFields: {
      inventory: ["Cuisine type", "Meal type", "Dietary options", "Service style", "FSSAI / Batch No.", "Tasting notes", "Ingredient notes"],
      booking: ["Pax count", "Meal slot", "Final pax count deadline", "Veg / Jain / allergen count", "Live counter requirements", "Service staff count", "Tasting session date"],
      vendor: ["FSSAI license", "Kitchen contact", "Service manager"],
    },
    replacements: [
      ["Vendors & Procurement", "Catering Partners"], ["Equipment Master", "Menu Master"], ["equipment master", "menu master"],
      ["Master Registry", "Catering Registry"], ["Additions", "Add Catering"], ["Inventory", "Menu Packages"], ["inventory", "menu packages"], ["INVENTORY", "MENU PACKAGES"],
      ["Equipments", "Menus"], ["equipments", "menus"], ["EQUIPMENTS", "MENUS"],
      ["Asset Code", "Package Code"], ["Serial Number", "FSSAI / Batch No."], ["Warranty Expiring Soon", "Menu / FSSAI Pending"], ["Warranty", "FSSAI"], ["warranty", "FSSAI"],
      ["Service Jobs", "Prep Follow-ups"], ["In Service", "In Prep"], ["in Service", "in Prep"], ["Returns due today", "Final guest counts due"], ["under repair / maintenance", "menu / prep hold"],
      ["Equipment Utilization", "Menu Booking Load"], ["Equipment in Service", "Prep Holds"], ["Equipment conflicts", "Kitchen conflicts"], ["3rd Party Equipment", "Catering Partners"],
      ["Papers & QC", "Menus & Compliance"], ["Gate Pass", "Kitchen Brief"], ["Job Card", "Banquet Event Order"], ["Road Challan", "F&B Delivery Challan"], ["Manpower Sheet", "Service Staff Deployment"],
      ["Equipment", "Menu"], ["equipment", "menu"], ["EQUIPMENT", "MENU"],
    ],
  }),
  profile({
    value: "staffing",
    label: "Staffing Booking",
    addLabel: "Add Staff",
    registryLabel: "Staff Registry",
    resourceLabel: "Staff",
    resourcePlural: "Staff",
    utilizationLabel: "Staff Utilization",
    complianceLabel: "Documents Pending",
    serviceLabel: "Availability Holds",
    conflictLabel: "Staff conflicts",
    returnLabel: "Shift close-outs due",
    thirdPartyLabel: "Freelance Staff",
    operationsLabel: "Contracts & ID Docs",
    vendorsLabel: "Staffing Agencies",
    features: { maintenance: false, warranty: false, serviceJobs: false, returns: false, accessories: false, warehouse: false, paxPrimary: true, contractTracking: true, individualAvailability: true, attendance: true, conditionQc: false, dispatchReturn: false, consumableStock: false },
    itemTypes: [["device", "Staff Member"], ["kit", "Staff Team"], ["bundle", "Shift Package"], ["third_party_equipment", "Agency Staff"]],
    dateTypes: NO_RETURN_DATES,
    documents: { gatePass: "Staff Deployment Sheet", jobCard: "Staff Briefing Document", manpower: "Shift Assignment Sheet", damage: "Attendance / Incident Report" },
    extraFields: {
      inventory: ["Role / Designation", "Shift start / end time", "Skills / certifications", "ID document type + number", "ID expiry", "Dress code / uniform", "In-house vs agency", "Daily / hourly rate", "Blackout dates", "Background check status", "Emergency contact"],
      booking: ["Shift start", "Shift end", "Reporting manager", "Uniform requirement", "Attendance checkpoint"],
      vendor: ["Agency SPOC", "Replacement policy", "Rate card"],
    },
    replacements: [
      ["Vendors & Procurement", "Staffing Agencies"], ["Equipment Master", "Role Master"], ["equipment master", "role master"],
      ["Master Registry", "Staff Registry"], ["Additions", "Add Staff"], ["Inventory", "Staff Roster"], ["inventory", "staff roster"], ["INVENTORY", "STAFF ROSTER"],
      ["Equipments", "Staff"], ["equipments", "staff"], ["EQUIPMENTS", "STAFF"],
      ["Asset Code", "Staff Code"], ["Serial Number", "Contract ID"], ["Warranty Expiring Soon", "Documents Pending"], ["Warranty", "ID Document"], ["warranty", "ID document"],
      ["Service Jobs", "Availability Follow-ups"], ["In Service", "On Hold"], ["in Service", "on Hold"], ["Returns due today", "Shift close-outs due"], ["under repair / maintenance", "availability / shift hold"],
      ["Equipment Utilization", "Staff Utilization"], ["Equipment in Service", "Availability Holds"], ["Equipment conflicts", "Staff conflicts"], ["3rd Party Equipment", "Freelance Staff"],
      ["Papers & QC", "Contracts & ID Docs"], ["Gate Pass", "Staff Deployment Sheet"], ["Job Card", "Staff Briefing Document"], ["Manpower Sheet", "Shift Assignment Sheet"], ["Damage Report", "Attendance / Incident Report"],
      ["Equipment", "Staff"], ["equipment", "staff"], ["EQUIPMENT", "STAFF"],
    ],
  }),
];

export function getBookingProfile(type = "equipment") {
  return BOOKING_PROFILES.find((profileItem) => profileItem.value === type) || BOOKING_PROFILES[0];
}

export function getEnabledDateTypes(type = "equipment") {
  return getBookingProfile(type).dateTypes || BASE_DATES;
}

export function isFeatureEnabled(type = "equipment", feature) {
  return Boolean(getBookingProfile(type).features?.[feature]);
}

export function applyBookingProfileText(text, type = "equipment") {
  let next = String(text || "");
  const replacements = [...getBookingProfile(type).replacements].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of replacements) {
    next = next.replaceAll(from, to);
  }
  return next;
}
