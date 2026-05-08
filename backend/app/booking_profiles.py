import json


BOOKING_TYPE_PROFILES = {
    "equipment": {
        "label": "Equipment Booking",
        "service_label": "Service & Repair Jobs",
        "service_item_label": "Service Job",
        "features": {
            "maintenance": True, "warranty": True, "serviceJobs": True, "returns": True,
            "accessories": True, "warehouse": True, "conditionQc": True, "dispatchReturn": True,
        },
        "modules": ["company_profile", "dashboard", "additions", "registry", "bookings", "calendar", "operations", "services", "vendors", "accounts", "audit", "admin", "system"],
    },
    "artist": {
        "label": "Artist Booking",
        "service_label": "Contract Follow-ups",
        "service_item_label": "Artist Hold",
        "features": {
            "maintenance": False, "warranty": False, "serviceJobs": False, "returns": False,
            "accessories": False, "warehouse": False, "conditionQc": False, "dispatchReturn": False,
            "contractTracking": True, "riders": True, "individualAvailability": True,
        },
        "modules": ["company_profile", "dashboard", "additions", "registry", "bookings", "calendar", "operations", "vendors", "accounts", "audit", "admin", "system"],
    },
    "venue": {
        "label": "Venue Booking",
        "service_label": "Repairs & Maintenance",
        "service_item_label": "Repair Ticket",
        "features": {
            "maintenance": True, "warranty": False, "serviceJobs": True, "returns": False,
            "accessories": False, "warehouse": False, "conditionQc": True, "dispatchReturn": False,
            "contractTracking": True, "permits": True, "subSpaces": True,
        },
        "modules": ["company_profile", "dashboard", "additions", "registry", "bookings", "calendar", "operations", "services", "vendors", "accounts", "audit", "admin", "system"],
    },
    "decor": {
        "label": "Decor Booking",
        "service_label": "Repair & Refurbishment",
        "service_item_label": "Repair Ticket",
        "features": {
            "maintenance": True, "warranty": False, "serviceJobs": True, "returns": True,
            "accessories": True, "warehouse": True, "conditionQc": True, "dispatchReturn": True,
            "consumableStock": True,
        },
        "modules": ["company_profile", "dashboard", "additions", "registry", "bookings", "calendar", "operations", "services", "vendors", "accounts", "audit", "admin", "system"],
    },
    "catering": {
        "label": "Catering Booking",
        "service_label": "Prep Follow-ups",
        "service_item_label": "Prep Follow-up",
        "features": {
            "maintenance": False, "warranty": False, "serviceJobs": False, "returns": False,
            "accessories": False, "warehouse": False, "conditionQc": False, "dispatchReturn": False,
            "contractTracking": True, "paxPrimary": True,
        },
        "modules": ["company_profile", "dashboard", "additions", "registry", "bookings", "calendar", "operations", "vendors", "accounts", "audit", "admin", "system"],
    },
    "staffing": {
        "label": "Staffing Booking",
        "service_label": "Availability Follow-ups",
        "service_item_label": "Availability Hold",
        "features": {
            "maintenance": False, "warranty": False, "serviceJobs": False, "returns": False,
            "accessories": False, "warehouse": False, "conditionQc": False, "dispatchReturn": False,
            "contractTracking": True, "individualAvailability": True, "attendance": True,
        },
        "modules": ["company_profile", "dashboard", "additions", "registry", "bookings", "calendar", "operations", "vendors", "accounts", "audit", "admin", "system"],
    },
}

VALID_BOOKING_TYPES = set(BOOKING_TYPE_PROFILES)


def get_booking_profile(booking_type: str | None) -> dict:
    return BOOKING_TYPE_PROFILES.get(booking_type or "equipment", BOOKING_TYPE_PROFILES["equipment"])


def user_booking_type(user) -> str:
    company = getattr(user, "company", None)
    return getattr(company, "booking_type", None) or "equipment"


def user_booking_profile(user) -> dict:
    return get_booking_profile(user_booking_type(user))


def feature_enabled_for_user(user, feature: str) -> bool:
    return bool(user_booking_profile(user).get("features", {}).get(feature))


def profile_json(profile: dict, key: str) -> str:
    return json.dumps(profile.get(key, {}))
