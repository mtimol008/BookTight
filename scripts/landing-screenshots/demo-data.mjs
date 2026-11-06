// Invented demo data for the landing-page screenshots. Every person,
// business and street name here is made up; coordinates are rough points in
// real South Manchester suburbs so distances look believable. Postcodes are
// district-only (M20, SK4…) so no line points at a real address.

export const DEMO_TIMEZONE = "Europe/London";

export const DEMO_PROFILE = {
  full_name: "Sam Harper",
  business_name: "Harper Electrical",
  home_address: "Harper Electrical, Chorlton, Manchester M21",
  home_latitude: 53.4416,
  home_longitude: -2.2766,
  distance_unit: "mi",
  max_travel_range_km: 40,
  max_jobs_per_day: 5,
  buffer_minutes: 15,
  working_hours: {
    mon: { enabled: true, start: "08:00", end: "17:30" },
    tue: { enabled: true, start: "08:00", end: "17:30" },
    wed: { enabled: true, start: "08:00", end: "17:30" },
    thu: { enabled: true, start: "08:00", end: "17:30" },
    fri: { enabled: true, start: "08:00", end: "16:00" },
    sat: { enabled: true, start: "08:30", end: "13:00" },
    sun: { enabled: false, start: "08:00", end: "17:00" },
  },
};

// dayOffset: 0 = Monday of the demo week.
export const DEMO_JOBS = [
  // Monday — Sale / Stretford / Urmston
  { dayOffset: 0, customer_name: "Priya Nair", description: "Consumer unit swap", address: "18 Copperbeech Mews, Sale M33", latitude: 53.4247, longitude: -2.3226, time_slot_type: "specific", specific_time: "08:30", duration_minutes: 180 },
  { dayOffset: 0, customer_name: "Tom Ellison", description: "Outdoor socket and garden lights", address: "4 Tanners Yard, Stretford M32", latitude: 53.4463, longitude: -2.3086, time_slot_type: "afternoon", duration_minutes: 90 },
  { dayOffset: 0, customer_name: "Rowan Pike", description: "Fault-find: tripping RCD", address: "27 Millward Close, Urmston M41", latitude: 53.4487, longitude: -2.3542, time_slot_type: "afternoon", duration_minutes: 60 },

  // Tuesday — Didsbury / Withington / Burnage
  { dayOffset: 1, customer_name: "Greaves & Co. Dental", description: "EICR — two-storey surgery", address: "Unit 3, Holloway Court, Didsbury M20", latitude: 53.4167, longitude: -2.231, time_slot_type: "specific", specific_time: "08:15", duration_minutes: 150 },
  { dayOffset: 1, customer_name: "Hannah Clarke", description: "Kitchen downlights", address: "9 Orchard Lane, West Didsbury M20", latitude: 53.4239, longitude: -2.2441, time_slot_type: "morning", duration_minutes: 120 },
  { dayOffset: 1, customer_name: "Marcus Bell", description: "Extractor fan replacement", address: "52 Fernley Road, Burnage M19", latitude: 53.4307, longitude: -2.2008, time_slot_type: "afternoon", duration_minutes: 60 },

  // Wednesday — Altrincham / Timperley / Hale
  { dayOffset: 2, customer_name: "The Fernhill Café", description: "New circuit for coffee machine", address: "2 Station Parade, Altrincham WA14", latitude: 53.3868, longitude: -2.3489, time_slot_type: "specific", specific_time: "07:30", duration_minutes: 120 },
  { dayOffset: 2, customer_name: "Jo Marsh", description: "Rewire — upstairs lighting", address: "15 Brackenfield Way, Timperley WA15", latitude: 53.3958, longitude: -2.3279, time_slot_type: "all_day", duration_minutes: 300 },
  { dayOffset: 2, customer_name: "David Osei", description: "Smoke alarms (mains)", address: "6 Lindale Gardens, Hale WA15", latitude: 53.3785, longitude: -2.3466, time_slot_type: "afternoon", duration_minutes: 75 },

  // Thursday — Levenshulme / Fallowfield / Rusholme
  { dayOffset: 3, customer_name: "Aisha Rahman", description: "EV charger survey", address: "41 Kingsmere Avenue, Levenshulme M19", latitude: 53.444, longitude: -2.1914, time_slot_type: "morning", duration_minutes: 60 },
  { dayOffset: 3, customer_name: "Fallowfield Lettings", description: "Landlord safety check, 4-bed HMO", address: "88 Ashgrove Street, Fallowfield M14", latitude: 53.4412, longitude: -2.2192, time_slot_type: "morning", duration_minutes: 120 },
  { dayOffset: 3, customer_name: "Neil Fraser", description: "Shower isolator", address: "11 Calder Row, Rusholme M14", latitude: 53.4545, longitude: -2.224, time_slot_type: "afternoon", duration_minutes: 45 },

  // Friday — Heaton Moor / Stockport
  { dayOffset: 4, customer_name: "Ellie Turner", description: "Loft lighting and sockets", address: "23 Beechwood Drive, Heaton Moor SK4", latitude: 53.4213, longitude: -2.1849, time_slot_type: "morning", duration_minutes: 150 },
  { dayOffset: 4, customer_name: "Kwame Asante", description: "Garage power supply", address: "7 Weaver's Court, Stockport SK1", latitude: 53.4106, longitude: -2.1575, time_slot_type: "afternoon", duration_minutes: 120 },

  // Saturday — close to home
  { dayOffset: 5, customer_name: "Lucy Grant", description: "Replace light fittings", address: "30 Wilbraham Terrace, Chorlton M21", latitude: 53.443, longitude: -2.281, time_slot_type: "morning", duration_minutes: 90 },
];

// The job typed into Add a job for the suggestion screenshot. Seeded into
// the geocode cache so the app finds it without calling Mapbox.
export const DEMO_NEW_JOB = {
  address: "7 Larkspur Row, Withington, Manchester M20",
  latitude: 53.4352,
  longitude: -2.2318,
  customer_name: "Ben Adeyemi",
  description: "Two double sockets in home office",
  hours: "1",
  minutes: "30",
};

export const HINT_IDS = ["drag-reorder", "suggestion-panel", "warning-block"];
