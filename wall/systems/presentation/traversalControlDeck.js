// ── WOS Navigation Bar v5.0.0 ─────────────────────────────────────────────────
// 0529F_WOS_NavigationBarActuallyWorks_v1.0.0
// 0529H_WOS_TraversalInstrumentationPass_v1.0.0
//   Speed stepper (0.25x–80x ladder), altitude stepper, REAL/SIM HUD time,
//   actor()/speedUp/Down/altitudeUp/Down/cloudFeasibility/heroVehicleFeasibility
// Status: active
// Classification: presentation-navigation-ui
//
// What changed and why:
//   Previous versions called the airport planner (rf.origin/rf.destination/rf.plan)
//   which only works with IATA codes and never resolved "Boston" or "London".
//   This version bypasses the planner entirely.
//
//   New routing:
//     FROM = current map center (read from MapboxViewportRuntime live)
//     TO   = destination resolved from DESTINATIONS table (city name → lat/lng)
//     Route = startGeneratedTrip({ route: [fromCoord, toCoord], ... })
//
//   No IATA codes required. No planner required. Works for any city in DESTINATIONS.
//
// Placement: wall/systems/presentation/traversalControlDeck.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE         = (global.SBE = global.SBE || {});
  var VERSION     = '5.0.0';
  var STORAGE_KEY = 'wos.nav.v1';

  // ── Transport modes ───────────────────────────────────────────────────────────

  // status: 'active' | 'experimental' | 'disabled'
  // experimental = partially visible, tappable, shows "coming soon" message
  // disabled     = greyed out, not tappable (Transit — requires schedule data)

  var TRANSPORT_MODES = Object.freeze([
    { id: 'flight',  icon: '✈',  label: 'Flight',  status: 'active'       },
    { id: 'drive',   icon: '🚗', label: 'Drive',   status: 'prototype'    },
    { id: 'walk',    icon: '🚶', label: 'Walk',    status: 'experimental' },
    { id: 'bike',    icon: '🚲', label: 'Bike',    status: 'experimental' },
    { id: 'transit', icon: '🚌', label: 'Transit', status: 'disabled'     },
  ]);

  // ── Speed steps ───────────────────────────────────────────────────────────────
  // 1x = world-time reference (real flight takes real hours).
  // Below 1x = observation / slow-motion pacing.
  // Above 1x = time compression. 10x = watchable. 40-80x = debug/turbo.
  // durationMs = (routeDistanceKm / CRUISE_KMH) * 3600000 (distance-proportional)
  // real_time  = durationMs / speedMult

  // 0.05x–0.10x = ambient / wallpaper / installation / slow observation
  // 0.25x–0.5x  = careful observation pacing
  // 1x          = world-time reference (real flight takes real hours)
  // 2x–10x      = watchable compression
  // 20x–80x     = fast compression / debug
  var TRAVERSAL_SPEED_STEPS = Object.freeze([0.05, 0.10, 0.25, 0.5, 1, 2, 5, 10, 20, 40, 80]);
  var SPEED_DEFAULT_INDEX    = 4;   // 1x

  // ── Altitude steps ────────────────────────────────────────────────────────────
  // Altitude = camera operating envelope, NOT assumed aircraft type.
  // Altitude step owners what target altitude and presentation zoom/pitch.
  // At very low altitudes (drone, urban) pitch lowers so the view is more
  // forward-looking, giving context for buildings and street-level geometry.

  var FLIGHT_ALTITUDE_STEPS = Object.freeze([
    // ── Low-altitude / drone envelope ────────────────────────────────────────
    { id: 'drone',     label: 'Drone',     altitudeFt: 25,    zoom: 17.5, pitch: 30 },
    { id: 'low_drone', label: 'Low Drone', altitudeFt: 50,    zoom: 17.0, pitch: 32 },
    { id: 'urban',     label: 'Urban',     altitudeFt: 100,   zoom: 16.5, pitch: 35 },
    { id: 'rooftop',   label: 'Rooftop',   altitudeFt: 250,   zoom: 16.0, pitch: 38 },
    // ── Flight envelope ───────────────────────────────────────────────────────
    { id: 'ground',    label: 'Ground',    altitudeFt: 500,   zoom: 15.0, pitch: 42 },
    { id: 'low',       label: 'Low',       altitudeFt: 1500,  zoom: 14.0, pitch: 44 },
    { id: 'city',      label: 'City',      altitudeFt: 5000,  zoom: 13.0, pitch: 46 },
    { id: 'regional',  label: 'Regional',  altitudeFt: 12000, zoom: 12.0, pitch: 48 },
    { id: 'cruise',    label: 'Cruise',    altitudeFt: 35000, zoom: 11.0, pitch: 50 },
  ]);
  var ALTITUDE_DEFAULT_INDEX = 8;   // cruise

  // Cruise speed used to compute simulated trip duration from route distance.
  var CRUISE_SPEED_KMH = 800;

  // ── Haversine distance ────────────────────────────────────────────────────────

  function _haversineKm(lat1, lng1, lat2, lng2) {
    var R    = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Format helpers ────────────────────────────────────────────────────────────

  function _fmtSpeed(mult) {
    return mult < 1 ? mult.toFixed(2) + 'x' : mult + 'x';
  }

  function _fmtAltStep(step) {
    return step.label;
  }

  // ── Destinations: city name / IATA code → { lat, lng, label } ────────────────
  // Keyed by lowercase name. Lookup is done via _resolveDestination().

  var DESTINATIONS = Object.freeze({
    // ── United States ──────────────────────────────────────────────────────────
    'new york':        { lat: 40.7128, lng: -74.0060, label: 'New York' },
    'new york city':   { lat: 40.7128, lng: -74.0060, label: 'New York' },
    'nyc':             { lat: 40.7128, lng: -74.0060, label: 'New York' },
    'manhattan':       { lat: 40.7831, lng: -73.9712, label: 'Manhattan' },
    'brooklyn':        { lat: 40.6782, lng: -73.9442, label: 'Brooklyn' },
    'boston':          { lat: 42.3601, lng: -71.0589, label: 'Boston' },
    'los angeles':     { lat: 34.0522, lng: -118.2437,label: 'Los Angeles' },
    'la':              { lat: 34.0522, lng: -118.2437,label: 'Los Angeles' },
    'chicago':         { lat: 41.8781, lng: -87.6298, label: 'Chicago' },
    'miami':           { lat: 25.7617, lng: -80.1918, label: 'Miami' },
    'washington':      { lat: 38.9072, lng: -77.0369, label: 'Washington DC' },
    'dc':              { lat: 38.9072, lng: -77.0369, label: 'Washington DC' },
    'san francisco':   { lat: 37.7749, lng: -122.4194,label: 'San Francisco' },
    'sf':              { lat: 37.7749, lng: -122.4194,label: 'San Francisco' },
    'seattle':         { lat: 47.6062, lng: -122.3321,label: 'Seattle' },
    'philadelphia':    { lat: 39.9526, lng: -75.1652, label: 'Philadelphia' },
    'atlanta':         { lat: 33.7490, lng: -84.3880, label: 'Atlanta' },
    'dallas':          { lat: 32.7767, lng: -96.7970, label: 'Dallas' },
    'houston':         { lat: 29.7604, lng: -95.3698, label: 'Houston' },
    'denver':          { lat: 39.7392, lng: -104.9903,label: 'Denver' },
    'phoenix':         { lat: 33.4484, lng: -112.0740,label: 'Phoenix' },
    'las vegas':       { lat: 36.1699, lng: -115.1398,label: 'Las Vegas' },
    'honolulu':        { lat: 21.3069, lng: -157.8583,label: 'Honolulu' },
    'hawaii':          { lat: 21.3069, lng: -157.8583,label: 'Honolulu' },
    'new orleans':     { lat: 29.9511, lng: -90.0715, label: 'New Orleans' },
    'minneapolis':     { lat: 44.9778, lng: -93.2650, label: 'Minneapolis' },
    'portland':        { lat: 45.5051, lng: -122.6750,label: 'Portland' },
    'detroit':         { lat: 42.3314, lng: -83.0458, label: 'Detroit' },
    'san diego':       { lat: 32.7157, lng: -117.1611,label: 'San Diego' },
    'nashville':       { lat: 36.1627, lng: -86.7816, label: 'Nashville' },
    // ── Airport codes ──────────────────────────────────────────────────────────
    'jfk':             { lat: 40.6413, lng: -73.7781, label: 'JFK' },
    'lga':             { lat: 40.7769, lng: -73.8740, label: 'LaGuardia' },
    'ewr':             { lat: 40.6895, lng: -74.1745, label: 'Newark' },
    'bos':             { lat: 42.3656, lng: -71.0096, label: 'Boston Logan' },
    'lax':             { lat: 33.9425, lng: -118.4081,label: 'LAX' },
    'ord':             { lat: 41.9742, lng: -87.9073, label: "O'Hare" },
    'mia':             { lat: 25.7959, lng: -80.2870, label: 'Miami Intl' },
    'sfo':             { lat: 37.6213, lng: -122.3790,label: 'SFO' },
    'sea':             { lat: 47.4502, lng: -122.3088,label: 'Seattle-Tacoma' },
    'dfw':             { lat: 32.8998, lng: -97.0403, label: 'Dallas Fort Worth' },
    'atl':             { lat: 33.6407, lng: -84.4277, label: 'Atlanta Hartsfield' },
    'den':             { lat: 39.8561, lng: -104.6737,label: 'Denver Intl' },
    'iad':             { lat: 38.9531, lng: -77.4565, label: 'Dulles' },
    'dca':             { lat: 38.8512, lng: -77.0402, label: 'Reagan National' },
    // ── Canada ─────────────────────────────────────────────────────────────────
    'toronto':         { lat: 43.6532, lng: -79.3832, label: 'Toronto' },
    'montreal':        { lat: 45.5017, lng: -73.5673, label: 'Montreal' },
    'vancouver':       { lat: 49.2827, lng: -123.1207,label: 'Vancouver' },
    'yyc':             { lat: 51.0447, lng: -114.0719,label: 'Calgary' },
    'yyz':             { lat: 43.6777, lng: -79.6248, label: 'Toronto Pearson' },
    'yul':             { lat: 45.4707, lng: -73.7408, label: 'Montreal Trudeau' },
    'yvr':             { lat: 49.1967, lng: -123.1815,label: 'Vancouver Intl' },
    // ── Mexico / Caribbean ──────────────────────────────────────────────────────
    'mexico city':     { lat: 19.4326, lng: -99.1332, label: 'Mexico City' },
    'cancun':          { lat: 21.1619, lng: -86.8515, label: 'Cancun' },
    'havana':          { lat: 23.1136, lng: -82.3666, label: 'Havana' },
    // ── South America ───────────────────────────────────────────────────────────
    'buenos aires':    { lat: -34.6037,lng: -58.3816, label: 'Buenos Aires' },
    'sao paulo':       { lat: -23.5505,lng: -46.6333, label: 'São Paulo' },
    'rio de janeiro':  { lat: -22.9068,lng: -43.1729, label: 'Rio de Janeiro' },
    'rio':             { lat: -22.9068,lng: -43.1729, label: 'Rio de Janeiro' },
    'bogota':          { lat: 4.7110,  lng: -74.0721, label: 'Bogotá' },
    'lima':            { lat: -12.0464,lng: -77.0428, label: 'Lima' },
    'santiago':        { lat: -33.4489,lng: -70.6693, label: 'Santiago' },
    // ── Europe ──────────────────────────────────────────────────────────────────
    'london':          { lat: 51.5074, lng: -0.1278,  label: 'London' },
    'paris':           { lat: 48.8566, lng: 2.3522,   label: 'Paris' },
    'berlin':          { lat: 52.5200, lng: 13.4050,  label: 'Berlin' },
    'amsterdam':       { lat: 52.3676, lng: 4.9041,   label: 'Amsterdam' },
    'madrid':          { lat: 40.4168, lng: -3.7038,  label: 'Madrid' },
    'barcelona':       { lat: 41.3851, lng: 2.1734,   label: 'Barcelona' },
    'rome':            { lat: 41.9028, lng: 12.4964,  label: 'Rome' },
    'milan':           { lat: 45.4642, lng: 9.1900,   label: 'Milan' },
    'zurich':          { lat: 47.3769, lng: 8.5417,   label: 'Zurich' },
    'vienna':          { lat: 48.2082, lng: 16.3738,  label: 'Vienna' },
    'brussels':        { lat: 50.8503, lng: 4.3517,   label: 'Brussels' },
    'lisbon':          { lat: 38.7223, lng: -9.1393,  label: 'Lisbon' },
    'dublin':          { lat: 53.3498, lng: -6.2603,  label: 'Dublin' },
    'stockholm':       { lat: 59.3293, lng: 18.0686,  label: 'Stockholm' },
    'oslo':            { lat: 59.9139, lng: 10.7522,  label: 'Oslo' },
    'copenhagen':      { lat: 55.6761, lng: 12.5683,  label: 'Copenhagen' },
    'helsinki':        { lat: 60.1699, lng: 24.9384,  label: 'Helsinki' },
    'athens':          { lat: 37.9838, lng: 23.7275,  label: 'Athens' },
    'istanbul':        { lat: 41.0082, lng: 28.9784,  label: 'Istanbul' },
    'moscow':          { lat: 55.7558, lng: 37.6176,  label: 'Moscow' },
    'prague':          { lat: 50.0755, lng: 14.4378,  label: 'Prague' },
    'warsaw':          { lat: 52.2297, lng: 21.0122,  label: 'Warsaw' },
    'budapest':        { lat: 47.4979, lng: 19.0402,  label: 'Budapest' },
    'edinburgh':       { lat: 55.9533, lng: -3.1883,  label: 'Edinburgh' },
    'manchester':      { lat: 53.4808, lng: -2.2426,  label: 'Manchester' },
    // Airport codes
    'lhr':             { lat: 51.4700, lng: -0.4543,  label: 'London Heathrow' },
    'cdg':             { lat: 49.0097, lng: 2.5479,   label: 'Paris CDG' },
    'ams':             { lat: 52.3105, lng: 4.7683,   label: 'Amsterdam Schiphol' },
    'fra':             { lat: 50.0379, lng: 8.5622,   label: 'Frankfurt' },
    'mad':             { lat: 40.4719, lng: -3.5626,  label: 'Madrid Barajas' },
    'fco':             { lat: 41.8003, lng: 12.2389,  label: 'Rome Fiumicino' },
    'zrh':             { lat: 47.4647, lng: 8.5492,   label: 'Zurich' },
    'vie':             { lat: 48.1103, lng: 16.5697,  label: 'Vienna' },
    'ist':             { lat: 41.2753, lng: 28.7519,  label: 'Istanbul' },
    // ── Middle East ──────────────────────────────────────────────────────────────
    'dubai':           { lat: 25.2048, lng: 55.2708,  label: 'Dubai' },
    'abu dhabi':       { lat: 24.4539, lng: 54.3773,  label: 'Abu Dhabi' },
    'doha':            { lat: 25.2854, lng: 51.5310,  label: 'Doha' },
    'riyadh':          { lat: 24.7136, lng: 46.6753,  label: 'Riyadh' },
    'tel aviv':        { lat: 32.0853, lng: 34.7818,  label: 'Tel Aviv' },
    'dxb':             { lat: 25.2532, lng: 55.3657,  label: 'Dubai Intl' },
    'doh':             { lat: 25.2609, lng: 51.6138,  label: 'Hamad Intl' },
    // ── Asia ─────────────────────────────────────────────────────────────────────
    'tokyo':           { lat: 35.6762, lng: 139.6503, label: 'Tokyo' },
    'osaka':           { lat: 34.6937, lng: 135.5023, label: 'Osaka' },
    'beijing':         { lat: 39.9042, lng: 116.4074, label: 'Beijing' },
    'shanghai':        { lat: 31.2304, lng: 121.4737, label: 'Shanghai' },
    'hong kong':       { lat: 22.3193, lng: 114.1694, label: 'Hong Kong' },
    'singapore':       { lat: 1.3521,  lng: 103.8198, label: 'Singapore' },
    'bangkok':         { lat: 13.7563, lng: 100.5018, label: 'Bangkok' },
    'seoul':           { lat: 37.5665, lng: 126.9780, label: 'Seoul' },
    'taipei':          { lat: 25.0330, lng: 121.5654, label: 'Taipei' },
    'kuala lumpur':    { lat: 3.1390,  lng: 101.6869, label: 'Kuala Lumpur' },
    'jakarta':         { lat: -6.2088, lng: 106.8456, label: 'Jakarta' },
    'delhi':           { lat: 28.6139, lng: 77.2090,  label: 'Delhi' },
    'new delhi':       { lat: 28.6139, lng: 77.2090,  label: 'New Delhi' },
    'mumbai':          { lat: 19.0760, lng: 72.8777,  label: 'Mumbai' },
    'bangalore':       { lat: 12.9716, lng: 77.5946,  label: 'Bangalore' },
    'karachi':         { lat: 24.8607, lng: 67.0011,  label: 'Karachi' },
    'manila':          { lat: 14.5995, lng: 120.9842, label: 'Manila' },
    // Airport codes
    'nrt':             { lat: 35.7720, lng: 140.3929, label: 'Tokyo Narita' },
    'hnd':             { lat: 35.5494, lng: 139.7798, label: 'Tokyo Haneda' },
    'pvg':             { lat: 31.1443, lng: 121.8083, label: 'Shanghai Pudong' },
    'hkg':             { lat: 22.3080, lng: 113.9185, label: 'Hong Kong Intl' },
    'sin':             { lat: 1.3644,  lng: 103.9915, label: 'Singapore Changi' },
    'icn':             { lat: 37.4602, lng: 126.4407, label: 'Seoul Incheon' },
    'del':             { lat: 28.5562, lng: 77.1000,  label: 'Delhi Indira Gandhi' },
    'bom':             { lat: 19.0896, lng: 72.8656,  label: 'Mumbai Chhatrapati' },
    // ── Africa ───────────────────────────────────────────────────────────────────
    'cairo':           { lat: 30.0444, lng: 31.2357,  label: 'Cairo' },
    'lagos':           { lat: 6.5244,  lng: 3.3792,   label: 'Lagos' },
    'johannesburg':    { lat: -26.2041,lng: 28.0473,  label: 'Johannesburg' },
    'cape town':       { lat: -33.9249,lng: 18.4241,  label: 'Cape Town' },
    'nairobi':         { lat: -1.2921, lng: 36.8219,  label: 'Nairobi' },
    'casablanca':      { lat: 33.5731, lng: -7.5898,  label: 'Casablanca' },
    'accra':           { lat: 5.6037,  lng: -0.1870,  label: 'Accra' },
    'addis ababa':     { lat: 9.0320,  lng: 38.7469,  label: 'Addis Ababa' },
    'los':             { lat: 6.5774,  lng: 3.3212,   label: 'Lagos Murtala Muhammed' },
    'cai':             { lat: 30.1219, lng: 31.4056,  label: 'Cairo Intl' },
    'jnb':             { lat: -26.1367,lng: 28.2411,  label: 'OR Tambo' },
    // ── Oceania ───────────────────────────────────────────────────────────────────
    'sydney':          { lat: -33.8688,lng: 151.2093, label: 'Sydney' },
    'melbourne':       { lat: -37.8136,lng: 144.9631, label: 'Melbourne' },
    'brisbane':        { lat: -27.4698,lng: 153.0251, label: 'Brisbane' },
    'perth':           { lat: -31.9505,lng: 115.8605, label: 'Perth' },
    'auckland':        { lat: -36.8509,lng: 174.7645, label: 'Auckland' },
    'sydney':          { lat: -33.8688,lng: 151.2093, label: 'Sydney' },
    'syd':             { lat: -33.9461,lng: 151.1772, label: 'Sydney Kingsford Smith' },
    'mel':             { lat: -37.6690,lng: 144.8410, label: 'Melbourne Tullamarine' },
    'akl':             { lat: -37.0082,lng: 174.7850, label: 'Auckland Intl' },
  });

  // ── State ──────────────────────────────────────────────────────────────────────

  var _state = {
    transport:     'flight',
    to:            '',
    speedIndex:    SPEED_DEFAULT_INDEX,     // index into TRAVERSAL_SPEED_STEPS
    altitudeIndex: ALTITUDE_DEFAULT_INDEX,  // index into FLIGHT_ALTITUDE_STEPS
  };

  var _mounted = false;
  var _root    = null;

  // ── Persistence ────────────────────────────────────────────────────────────────

  function _loadState() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved.to !== undefined) _state.to = saved.to;
        if (saved.speedIndex    != null && saved.speedIndex    < TRAVERSAL_SPEED_STEPS.length)
          _state.speedIndex    = saved.speedIndex;
        if (saved.altitudeIndex != null && saved.altitudeIndex < FLIGHT_ALTITUDE_STEPS.length)
          _state.altitudeIndex = saved.altitudeIndex;
      }
    } catch (e) { /* ignore */ }
  }

  function _saveState() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          to:            _state.to,
          speedIndex:    _state.speedIndex,
          altitudeIndex: _state.altitudeIndex,
        }));
      }
    } catch (e) { /* ignore */ }
  }

  function _currentSpeedMult()  { return TRAVERSAL_SPEED_STEPS[_state.speedIndex] || 1; }
  function _currentAltStep()    { return FLIGHT_ALTITUDE_STEPS[_state.altitudeIndex] || FLIGHT_ALTITUDE_STEPS[ALTITUDE_DEFAULT_INDEX]; }

  // ── Current location — reads live from the visible Mapbox map ─────────────────

  function _getCurrentMapCenter() {
    try {
      var mvr = global.SBE && SBE.MapboxViewportRuntime;
      if (!mvr) return null;
      var map = typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      if (!map) return null;
      var c = map.getCenter();
      return { lat: c.lat, lng: c.lng, label: 'Current location' };
    } catch (e) { return null; }
  }

  // ── Destination normalization ────────────────────────────────────────────────

  function _stripDiacritics(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function _normalizeKey(s) {
    return _stripDiacritics(String(s || '')).toLowerCase()
      .replace(/[-_./]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Alias map: common misspellings / nicknames → canonical DESTINATIONS key
  var DESTINATION_ALIASES = Object.freeze({
    'sao paolo':    'sao paulo',
    'sao paulo':    'sao paulo',
    'philly':       'philadelphia',
    'chi town':     'chicago',
    'vegas':        'las vegas',
    'big apple':    'new york',
    'cdmx':         'mexico city',
    'df':           'mexico city',
    'bombay':       'mumbai',
    'peking':       'beijing',
    'frisco':       'san francisco',
    'kiev':         'kyiv',
  });

  // Pre-built normalized index: _normalizeKey(canonicalKey) → DESTINATIONS entry
  var _normalizedIndex = {};
  (function () {
    var keys = Object.keys(DESTINATIONS);
    for (var i = 0; i < keys.length; i++) {
      _normalizedIndex[_normalizeKey(keys[i])] = DESTINATIONS[keys[i]];
    }
  })();

  // ── Destination resolver ───────────────────────────────────────────────────────
  // Returns { lat, lng, label } or null.

  function _resolveDestination(input) {
    if (!input) return null;
    var norm = _normalizeKey(input);
    if (!norm) return null;

    // Alias lookup
    if (DESTINATION_ALIASES[norm]) {
      norm = _normalizeKey(DESTINATION_ALIASES[norm]);
    }

    // Exact match on normalized index
    if (_normalizedIndex[norm]) return _normalizedIndex[norm];

    // Prefix match
    var nKeys = Object.keys(_normalizedIndex);
    for (var i = 0; i < nKeys.length; i++) {
      if (nKeys[i].indexOf(norm) === 0) return _normalizedIndex[nKeys[i]];
    }

    // Substring match
    for (var j = 0; j < nKeys.length; j++) {
      if (nKeys[j].indexOf(norm) !== -1) return _normalizedIndex[nKeys[j]];
    }

    // lat,lng literal  e.g. "40.71,-74.01"
    var parts = norm.replace(/\s/g, '').split(',');
    if (parts.length === 2) {
      var lat = parseFloat(parts[0]);
      var lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat: lat, lng: lng, label: lat.toFixed(2) + ', ' + lng.toFixed(2) };
      }
    }

    return null;
  }

  // ── Error display ─────────────────────────────────────────────────────────────

  function _showError(msg) {
    var el = document.getElementById('nav-error');
    if (el) { el.textContent = msg; el.classList.add('visible'); }
  }

  function _clearError() {
    var el = document.getElementById('nav-error');
    if (el) el.classList.remove('visible');
  }

  // ── Launch ────────────────────────────────────────────────────────────────────
  // Reads current map center as FROM. Resolves TO from DESTINATIONS table.
  // Builds a direct-coordinate route and calls startGeneratedTrip.
  // Hard failure: if TO cannot be resolved, show error and stop.

  // ── Drive launch — hero vehicle prototype ─────────────────────────────────────
  // Stops any active flight, starts HeroVehicleRuntime, exposes nav state so the
  // HUD reads DRIVE telemetry. Road route comes from Mapbox Directions when
  // available; labeled fallback otherwise.

  function _launchDrive(fromLoc, toLoc, toText) {
    var hv = global.SBE && SBE.HeroVehicleRuntime;
    if (!hv || typeof hv.startRoute !== 'function') {
      _showError('Drive runtime not ready — try again in a moment.');
      return;
    }

    // Stop any active flight so the two actors don't fight over the camera.
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (rt && typeof rt.stop === 'function') rt.stop();

    var speedMult = _currentSpeedMult();
    var altStep   = _currentAltStep();
    var distKm    = _haversineKm(fromLoc.lat, fromLoc.lng, toLoc.lat, toLoc.lng);

    _state.to = toText;
    _saveState();

    // Expose nav state for HUD telemetry (transport: drive).
    global._wos     = global._wos || {};
    global._wos.nav = {
      transport:    'drive',
      to:           toLoc.label,
      from:         fromLoc.label,
      toLoc:        toLoc,
      fromLoc:      fromLoc,
      distanceKm:   distKm,
      launchRealMs: Date.now(),
      speedMult:    speedMult,
      altStep:      altStep,
      routeSource:  null,   // filled in once the route resolves
    };

    var launchBtn = document.getElementById('nav-launch');
    if (launchBtn) launchBtn.classList.add('launching');

    console.group('[WOSNav] Drive launch');
    console.log('from:', fromLoc.label, '→ to:', toLoc.label);
    console.log('speed:', _fmtSpeed(speedMult));
    console.groupEnd();

    hv.startRoute({
      from:            fromLoc,
      to:              toLoc,
      destinationText: toText,
      speedMultiplier: speedMult,
    }).then(function (ok) {
      if (launchBtn) launchBtn.classList.remove('launching');
      if (!ok) {
        _showError('Could not start drive route — check console.');
        return;
      }
      // Record actual route source for HUD honesty (directions vs fallback).
      var s = hv.getState();
      if (global._wos.nav) global._wos.nav.routeSource = s.routeSource;
    }).catch(function (e) {
      if (launchBtn) launchBtn.classList.remove('launching');
      _showError('Drive error: ' + (e && e.message ? e.message : 'unknown'));
    });
  }

  // Public: drive to a destination string (resolves origin from map center).
  // Used by _wos.debug.heroVehicle.start().
  function driveTo(toText) {
    _clearError();
    var fromLoc = _getCurrentMapCenter();
    if (!fromLoc) { _showError('Map not ready.'); return false; }
    var toLoc = _resolveDestination(toText);
    if (!toLoc) { _showError('"' + toText + '" not found.'); return false; }
    _state.transport = 'drive';
    _launchDrive(fromLoc, toLoc, String(toText));
    return true;
  }

  function launch() {
    _clearError();

    var launchBtn = document.getElementById('nav-launch');
    var toInput   = document.getElementById('nav-to');
    var toText    = (toInput ? toInput.value : _state.to || '').trim();

    // ── Resolve FROM: current map center ──────────────────────────────────────
    var fromLoc = _getCurrentMapCenter();
    if (!fromLoc) {
      _showError('Map not ready — please wait a moment.');
      return;
    }

    // ── Resolve TO: destination from table ────────────────────────────────────
    if (!toText) {
      _showError('Enter a destination — city, airport code, or coordinates.');
      return;
    }

    var toLoc = _resolveDestination(toText);
    if (!toLoc) {
      _showError('"' + toText + '" not found. Try: Boston, Tokyo, London, JFK…');
      return;
    }

    // Sanity: same location
    var distDeg = Math.sqrt(
      Math.pow(fromLoc.lat - toLoc.lat, 2) + Math.pow(fromLoc.lng - toLoc.lng, 2)
    );
    if (distDeg < 0.01) {
      _showError('Already there. Enter a different destination.');
      return;
    }

    // ── Drive prototype: hand off to HeroVehicleRuntime ───────────────────────
    if (_state.transport === 'drive') {
      _launchDrive(fromLoc, toLoc, toText);
      return;
    }

    // ── Speed + duration (distance-proportional) ──────────────────────────────
    // durationMs = time a real aircraft would take at CRUISE_SPEED_KMH.
    // real_time = durationMs / speedMult — user controls compression via stepper.
    var speedMult = _currentSpeedMult();
    var distKm    = _haversineKm(fromLoc.lat, fromLoc.lng, toLoc.lat, toLoc.lng);
    var simHours  = distKm / CRUISE_SPEED_KMH;
    var durationMs = Math.max(5 * 60 * 1000, Math.round(simHours * 3600 * 1000));
    var realMinutes = durationMs / speedMult / 60000;

    _state.to = toText;
    _saveState();

    // Expose nav state — TraversalHUD reads this for telemetry
    var launchRealMs = Date.now();
    global._wos       = global._wos       || {};
    global._wos.nav   = {
      transport:   _state.transport,
      to:          toLoc.label,
      from:        fromLoc.label,
      toLoc:       toLoc,
      fromLoc:     fromLoc,
      distanceKm:  distKm,
      launchRealMs: launchRealMs,
      speedMult:   speedMult,
      altStep:     _currentAltStep(),
    };

    if (launchBtn) launchBtn.classList.add('launching');

    console.group('[WOSNav] Launch');
    console.log('from    :', fromLoc.label, '(', fromLoc.lat.toFixed(4), fromLoc.lng.toFixed(4), ')');
    console.log('to      :', toLoc.label,   '(', toLoc.lat.toFixed(4),   toLoc.lng.toFixed(4), ')');
    console.log('distance:', Math.round(distKm) + ' km');
    console.log('speed   :', _fmtSpeed(speedMult), '— ~' + realMinutes.toFixed(1) + ' real min');
    console.log('sim dur :', Math.round(durationMs / 60000) + ' min simulated');
    console.groupEnd();

    // ── Stop any existing trip ─────────────────────────────────────────────────
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (rt && typeof rt.stop === 'function') rt.stop();

    // ── Presentation mode ──────────────────────────────────────────────────────
    if (global._wos && typeof global._wos.presentationMode === 'function') {
      global._wos.presentationMode(true);
    }

    // ── Traversal profile ──────────────────────────────────────────────────────
    if (rt && typeof rt.setTraversalProfile === 'function') {
      rt.setTraversalProfile('regional');
    }

    // ── Altitude step (must be resolved before startGeneratedTrip) ──────────
    var altStep = _currentAltStep();

    // ── Build and start generated trip ────────────────────────────────────────
    if (!rt || typeof rt.startGeneratedTrip !== 'function') {
      _showError('Trip runtime not ready — try again in a moment.');
      if (launchBtn) launchBtn.classList.remove('launching');
      return;
    }

    var tripOk = rt.startGeneratedTrip({
      id:               'nav_trip_' + Date.now(),
      label:            fromLoc.label + ' → ' + toLoc.label,
      durationMs:       durationMs,
      aircraftClass:    'regional',
      cruiseAltitudeFt: altStep.altitudeFt,
      cruiseSpeedKts:   420,
      // Nav trips move from launch — no PREPARE/TAXI pin at origin.
      movementMode:     'continuous',
      route: [
        { lat: fromLoc.lat, lng: fromLoc.lng, label: fromLoc.label },
        { lat: toLoc.lat,   lng: toLoc.lng,   label: toLoc.label   },
      ],
    });

    if (!tripOk) {
      _showError('Could not start route — check console for details.');
      if (launchBtn) launchBtn.classList.remove('launching');
      return;
    }

    // ── Speed multiplier ──────────────────────────────────────────────────────
    if (rt && typeof rt.setSpeed === 'function') {
      rt.setSpeed(speedMult);
    }

    // ── Camera authority ─────────────────────────────────────────────────────
    // Deck owns presentation intent. Both the runtime's slow flyTo and the
    // rig's per-frame jumpTo must obey the selected altitude step's zoom/pitch.
    if (typeof rt.setCameraProfile === 'function') {
      rt.setCameraProfile({ zoom: altStep.zoom, pitch: altStep.pitch });
    }
    var rig = global.SBE && SBE.RegionalFlightCameraRig;
    if (rig) {
      if (typeof rig.setGlideCamera === 'function') {
        rig.setGlideCamera({ zoom: altStep.zoom, pitch: altStep.pitch });
      }
      // External profile override: applied AFTER profile-specific resolution,
      // so it wins over the regional/surface_glide curves.
      if (typeof rig.setCameraProfile === 'function') {
        rig.setCameraProfile({ zoom: altStep.zoom, pitch: altStep.pitch });
      }
      if (typeof rig.setEnabled  === 'function') rig.setEnabled(true);
      if (typeof rig.setSmoothing === 'function') rig.setSmoothing(0.75);
    }

    // ── Support systems (silent) ──────────────────────────────────────────────
    var ptpr = global.SBE && SBE.PredictiveTilePreloadRuntime;
    if (ptpr) {
      if (typeof ptpr.start === 'function') ptpr.start();
    }

    var tca = global.SBE && SBE.TraversalContinuityAuthority;
    if (tca && typeof tca.setEnabled === 'function') {
      tca.setEnabled(true);
      tca.setExposureBias('cinematic');
      tca.setAutoGate(false);
    }

    var tes = global.SBE && SBE.TileEmergenceStyling;
    if (tes && typeof tes.start === 'function') tes.start();

    // ── Update FROM label to show where we launched from ──────────────────────
    var fromEl = document.getElementById('nav-from-display');
    if (fromEl) fromEl.textContent = fromLoc.label;

    global.setTimeout(function () {
      if (launchBtn) launchBtn.classList.remove('launching');
    }, 800);
  }

  // ── CSS ───────────────────────────────────────────────────────────────────────

  function _injectCSS() {
    if (document.getElementById('wos-nav-css')) return;
    var s = document.createElement('style');
    s.id  = 'wos-nav-css';
    s.textContent = [
      '#wos-nav {',
      '  position: fixed; bottom: 0; left: 0; right: 0; z-index: 900;',
      '  background: rgba(6,7,10,0.97);',
      '  border-top: 1px solid rgba(255,255,255,0.07);',
      '  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);',
      '  font-family: -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;',
      '  font-size: 13px; color: rgba(255,255,255,0.80);',
      '  user-select: none; padding: 8px 16px 10px;',
      '  display: flex; flex-direction: column; gap: 7px; box-sizing: border-box;',
      '}',
      '.nav-row { display: flex; align-items: center; gap: 8px; min-height: 28px; }',
      /* transport */
      '.nav-transport { display: flex; gap: 3px; }',
      '.nav-mode {',
      '  border: none; outline: none; cursor: pointer;',
      '  background: rgba(255,255,255,0.04); border-radius: 6px;',
      '  padding: 4px 10px; font-family: inherit; font-size: 13px;',
      '  color: rgba(255,255,255,0.32); transition: background 120ms, color 120ms;',
      '}',
      '.nav-mode:hover:not([disabled]) { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.60); }',
      '.nav-mode.active { background: rgba(50,185,140,0.15); color: rgba(60,220,165,0.95); }',
      '.nav-mode[disabled] { cursor: default; opacity: 0.18; }',
      /* experimental: visible and clickable, but clearly not production */
      '.nav-mode-exp { opacity: 0.42; cursor: pointer; }',
      '.nav-mode-exp:hover { opacity: 0.60; }',
      /* inputs */
      '.nav-fields { display: flex; gap: 8px; flex: 1; align-items: stretch; }',
      '.nav-field { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }',
      '.nav-field-lbl {',
      '  font-size: 11px; font-weight: 600; letter-spacing: 0.05em;',
      '  color: rgba(255,255,255,0.28); text-transform: uppercase; min-width: 34px; flex-shrink: 0;',
      '}',
      '.nav-input {',
      '  flex: 1; background: rgba(255,255,255,0.06);',
      '  border: 1px solid rgba(255,255,255,0.10); border-radius: 6px;',
      '  color: rgba(255,255,255,0.90); font-family: inherit; font-size: 13px;',
      '  padding: 5px 10px; outline: none; min-width: 0;',
      '  transition: border-color 120ms, background 120ms; box-sizing: border-box;',
      '}',
      '.nav-input:focus { border-color: rgba(50,185,140,0.50); background: rgba(255,255,255,0.09); }',
      '.nav-input::placeholder { color: rgba(255,255,255,0.18); }',
      '.nav-from-static {',
      '  flex: 1; padding: 5px 10px; font-size: 12px;',
      '  color: rgba(255,255,255,0.40); font-style: italic;',
      '  background: rgba(255,255,255,0.02); border-radius: 6px;',
      '  border: 1px solid rgba(255,255,255,0.06);',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      /* steppers: Speed and Altitude */
      '.nav-stepper { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }',
      '.nav-step-lbl {',
      '  font-size: 9px; letter-spacing: 0.10em; text-transform: uppercase;',
      '  color: rgba(255,255,255,0.28); min-width: 36px; flex-shrink: 0;',
      '}',
      '.nav-step-btn {',
      '  width: 22px; height: 22px; border-radius: 4px; flex-shrink: 0;',
      '  border: 1px solid rgba(255,255,255,0.10);',
      '  background: rgba(255,255,255,0.04);',
      '  color: rgba(255,255,255,0.60); font-size: 15px; line-height: 1;',
      '  cursor: pointer; display: flex; align-items: center; justify-content: center;',
      '  transition: background 100ms, color 100ms;',
      '}',
      '.nav-step-btn:hover { background: rgba(255,255,255,0.10); color: rgba(255,255,255,0.90); }',
      '.nav-step-btn:disabled { opacity: 0.20; cursor: default; }',
      '.nav-step-val {',
      '  font-family: "SF Mono","Fira Mono",ui-monospace,monospace;',
      '  font-size: 11px; color: rgba(255,255,255,0.85);',
      '  min-width: 60px; text-align: center; white-space: nowrap;',
      '}',
      '.nav-cam-sel {',
      '  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);',
      '  border-radius: 5px; color: rgba(255,255,255,0.82);',
      '  font-family: inherit; font-size: 11px; padding: 3px 6px;',
      '  cursor: pointer; outline: none; appearance: none; -webkit-appearance: none;',
      '}',
      '.nav-cam-sel:focus { border-color: rgba(50,185,140,0.50); }',
      /* launch */
      '.nav-launch {',
      '  flex-shrink: 0;',
      '  background: rgba(50,170,130,0.12); border: 1px solid rgba(50,170,130,0.32);',
      '  border-radius: 6px; color: rgba(80,215,170,0.95);',
      '  font-family: inherit; font-size: 13px; font-weight: 500;',
      '  padding: 5px 22px; cursor: pointer; white-space: nowrap;',
      '  transition: background 130ms, border-color 130ms;',
      '}',
      '.nav-launch:hover { background: rgba(50,170,130,0.22); border-color: rgba(50,170,130,0.50); }',
      '.nav-launch.launching { opacity: 0.50; pointer-events: none; }',
      /* spacer */
      '.nav-spacer { flex: 1; }',
      /* error */
      '.nav-error {',
      '  font-size: 11px; color: rgba(255,110,90,0.90); padding: 0; display: none;',
      '}',
      '.nav-error.visible { display: block; }',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── DOM helper ────────────────────────────────────────────────────────────────

  function _make(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if      (k === 'cls')  el.className = attrs[k];
        else if (k === 'text') el.textContent = attrs[k];
        else                   el.setAttribute(k, attrs[k]);
      });
    }
    return el;
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────────

  function _build() {
    var nav = _make('div', { id: 'wos-nav' });
    nav.setAttribute('data-watch-hide', '');

    // ── Row 1: Transport tabs · Speed · Launch ─────────────────────────────────
    var row1 = _make('div', { cls: 'nav-row' });

    var transportDiv = _make('div', { cls: 'nav-transport' });
    TRANSPORT_MODES.forEach(function (tm) {
      var extraCls = tm.status === 'experimental' ? ' nav-mode-exp'
                   : tm.status === 'disabled'     ? ' nav-mode-dis'
                   : '';
      var btn = _make('button', {
        cls:   'nav-mode' + (tm.id === _state.transport ? ' active' : '') + extraCls,
        text:  tm.icon + ' ' + tm.label,
        title: tm.status === 'experimental' ? tm.label + ' — experimental'
             : tm.status === 'disabled'     ? tm.label + ' — not yet available'
             : tm.label,
      });
      if (tm.status === 'disabled') btn.setAttribute('disabled', 'disabled');
      btn.addEventListener('click', function () {
        if (tm.status === 'disabled') return;
        if (tm.status === 'experimental') {
          _showError(tm.label + ' routing is experimental — coming soon. Use Flight for now.');
          return;
        }
        nav.querySelectorAll('.nav-mode').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _state.transport = tm.id;
        _clearError();
      });
      transportDiv.appendChild(btn);
    });
    row1.appendChild(transportDiv);
    row1.appendChild(_make('div', { cls: 'nav-spacer' }));

    // ── Speed stepper ──────────────────────────────────────────────────────────
    var spdDiv = _make('div', { cls: 'nav-stepper' });
    spdDiv.appendChild(_make('span', { cls: 'nav-step-lbl', text: 'Speed' }));
    var spdDn = _make('button', { cls: 'nav-step-btn', id: 'nav-speed-dn', text: '−' });
    var spdUp = _make('button', { cls: 'nav-step-btn', id: 'nav-speed-up', text: '+' });
    var spdVal = _make('span',  { cls: 'nav-step-val', id: 'nav-speed-val',
      text: _fmtSpeed(_currentSpeedMult()) });
    if (_state.speedIndex <= 0) spdDn.setAttribute('disabled', 'disabled');
    if (_state.speedIndex >= TRAVERSAL_SPEED_STEPS.length - 1) spdUp.setAttribute('disabled', 'disabled');
    spdDn.addEventListener('click', function () { _stepSpeed(-1); });
    spdUp.addEventListener('click', function () { _stepSpeed(1); });
    spdDiv.appendChild(spdDn);
    spdDiv.appendChild(spdVal);
    spdDiv.appendChild(spdUp);
    row1.appendChild(spdDiv);

    // ── Altitude stepper ───────────────────────────────────────────────────────
    var altDiv = _make('div', { cls: 'nav-stepper' });
    altDiv.appendChild(_make('span', { cls: 'nav-step-lbl', text: 'Alt' }));
    var altDn = _make('button', { cls: 'nav-step-btn', id: 'nav-alt-dn', text: '−' });
    var altUp = _make('button', { cls: 'nav-step-btn', id: 'nav-alt-up', text: '+' });
    var altVal = _make('span',  { cls: 'nav-step-val', id: 'nav-alt-val',
      text: _fmtAltStep(_currentAltStep()) });
    if (_state.altitudeIndex <= 0) altDn.setAttribute('disabled', 'disabled');
    if (_state.altitudeIndex >= FLIGHT_ALTITUDE_STEPS.length - 1) altUp.setAttribute('disabled', 'disabled');
    altDn.addEventListener('click', function () { _stepAltitude(-1); });
    altUp.addEventListener('click', function () { _stepAltitude(1); });
    altDiv.appendChild(altDn);
    altDiv.appendChild(altVal);
    altDiv.appendChild(altUp);
    row1.appendChild(altDiv);

    // ── CAM selector (Drive mode only) ────────────────────────────────────────
    // A compact dropdown. Shown/hidden via CSS depending on _state.transport.
    var CAM_OPTS = ['follow','lead','side','high','hide_actor'];
    var camDiv = _make('div', { cls: 'nav-stepper', id: 'nav-cam-wrap' });
    camDiv.appendChild(_make('span', { cls: 'nav-step-lbl', text: 'Cam' }));
    var camSel = document.createElement('select');
    camSel.id = 'nav-cam-sel';
    camSel.className = 'nav-cam-sel';
    CAM_OPTS.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o.replace('_', ' ');
      camSel.appendChild(opt);
    });
    camSel.addEventListener('change', function (e) {
      e.stopPropagation();
      var hv = global.SBE && SBE.HeroVehicleRuntime;
      if (hv && typeof hv.setCameraPreset === 'function') {
        hv.setCameraPreset(camSel.value);
      }
    });
    camSel.addEventListener('keydown',  function (e) { e.stopPropagation(); });
    camSel.addEventListener('keyup',    function (e) { e.stopPropagation(); });
    camSel.addEventListener('keypress', function (e) { e.stopPropagation(); });
    camDiv.appendChild(camSel);
    // Visibility: only shown when Drive is active transport
    camDiv.style.display = (_state.transport === 'drive') ? 'flex' : 'none';
    row1.appendChild(camDiv);

    // When transport tab switches, show/hide CAM selector
    nav.querySelectorAll && setTimeout(function () {
      var tabBtns = nav.querySelectorAll('.nav-mode');
      tabBtns.forEach(function (b) {
        b.addEventListener('click', function () {
          var wrap = document.getElementById('nav-cam-wrap');
          if (wrap) wrap.style.display = (_state.transport === 'drive') ? 'flex' : 'none';
        });
      });
    }, 50);

    var launchBtn = _make('button', { cls: 'nav-launch', id: 'nav-launch', text: 'Launch' });
    launchBtn.addEventListener('click', launch);
    row1.appendChild(launchBtn);
    nav.appendChild(row1);

    // ── Row 2: FROM (auto) + TO (text input) ───────────────────────────────────
    var row2 = _make('div', { cls: 'nav-row' });

    // FROM — shows current map location, read-only
    var fromField = _make('div', { cls: 'nav-field' });
    fromField.appendChild(_make('span', { cls: 'nav-field-lbl', text: 'FROM' }));
    var fromDisplay = _make('div', { cls: 'nav-from-static', id: 'nav-from-display' });
    var initLoc = _getCurrentMapCenter();
    fromDisplay.textContent = initLoc ? initLoc.label : 'Current location';
    fromField.appendChild(fromDisplay);
    row2.appendChild(fromField);

    // TO — free text
    var toField = _make('div', { cls: 'nav-field' });
    toField.appendChild(_make('span', { cls: 'nav-field-lbl', text: 'TO' }));
    var toInput = _make('input', {
      cls:         'nav-input',
      id:          'nav-to',
      type:        'text',
      placeholder: 'Boston, Tokyo, London, JFK…',
      'list':      'nav-dest-list',
    });
    if (_state.to) toInput.setAttribute('value', _state.to);
    toInput.addEventListener('input', _clearError);
    // stopPropagation: prevent keydown/keyup from reaching main.js global
    // keyboard handlers, which crash on event.key === undefined (IME/composition).
    toInput.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') launch();
    });
    toInput.addEventListener('keyup', function (e) {
      e.stopPropagation();
    });
    toInput.addEventListener('keypress', function (e) {
      e.stopPropagation();
    });
    toField.appendChild(toInput);
    row2.appendChild(toField);

    nav.appendChild(row2);

    // ── Row 3: Error ───────────────────────────────────────────────────────────
    nav.appendChild(_make('div', { cls: 'nav-error', id: 'nav-error' }));

    // Datalist suggestions
    var dl = document.createElement('datalist');
    dl.id = 'nav-dest-list';
    ['New York','Boston','London','Paris','Tokyo','Singapore','Dubai','Sydney',
     'Los Angeles','Chicago','Miami','Toronto','Berlin','Amsterdam','Rome',
     'Hong Kong','Seoul','Mumbai','Cairo','Lagos','São Paulo','JFK','LHR','NRT'].forEach(function (s) {
      var opt = document.createElement('option'); opt.value = s; dl.appendChild(opt);
    });
    nav.appendChild(dl);

    return nav;
  }

  // ── Public controls ───────────────────────────────────────────────────────────

  function mount() {
    if (_mounted) return;
    _loadState();
    _injectCSS();
    _root = _build();
    document.body.appendChild(_root);
    _mounted = true;
    var lower = document.getElementById('ws-lower-panel');
    if (lower) lower.style.display = 'none';
    console.log('[WOSNav] v' + VERSION + ' ready — type a destination and Launch');
  }

  function unmount() {
    if (!_mounted || !_root) return;
    if (_root.parentNode) _root.parentNode.removeChild(_root);
    _root = null;
    _mounted = false;
  }

  function show() { if (_root) _root.style.removeProperty('display'); }
  function hide() { if (_root) _root.style.display = 'none'; }

  // ── Step functions — shared by UI buttons and debug commands ─────────────────

  function _stepSpeed(dir) {
    var next = Math.max(0, Math.min(TRAVERSAL_SPEED_STEPS.length - 1, _state.speedIndex + dir));
    _state.speedIndex = next;
    var mult = _currentSpeedMult();

    // Update UI
    var valEl = document.getElementById('nav-speed-val');
    if (valEl) valEl.textContent = _fmtSpeed(mult);
    var dnEl = document.getElementById('nav-speed-dn');
    var upEl = document.getElementById('nav-speed-up');
    if (dnEl) dnEl.disabled = (next <= 0);
    if (upEl) upEl.disabled = (next >= TRAVERSAL_SPEED_STEPS.length - 1);

    // Apply live to running flight trip (no restart)
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (rt && typeof rt.setSpeed === 'function') rt.setSpeed(mult);

    // Apply live to running hero vehicle (no restart)
    var hv = global.SBE && SBE.HeroVehicleRuntime;
    if (hv && typeof hv.setSpeed === 'function') hv.setSpeed(mult);

    // Update nav state
    if (global._wos && global._wos.nav) global._wos.nav.speedMult = mult;
    _saveState();

    return { speedMultiplier: mult, label: _fmtSpeed(mult), index: next };
  }

  function _stepAltitude(dir) {
    var next = Math.max(0, Math.min(FLIGHT_ALTITUDE_STEPS.length - 1, _state.altitudeIndex + dir));
    _state.altitudeIndex = next;
    var step = _currentAltStep();

    // Update UI
    var valEl = document.getElementById('nav-alt-val');
    if (valEl) valEl.textContent = _fmtAltStep(step);
    var dnEl = document.getElementById('nav-alt-dn');
    var upEl = document.getElementById('nav-alt-up');
    if (dnEl) dnEl.disabled = (next <= 0);
    if (upEl) upEl.disabled = (next >= FLIGHT_ALTITUDE_STEPS.length - 1);

    // Apply live to camera rig (presentation interpretation)
    var rig = global.SBE && SBE.RegionalFlightCameraRig;
    if (rig) {
      if (typeof rig.setGlideCamera === 'function') {
        rig.setGlideCamera({ zoom: step.zoom, pitch: step.pitch });
      }
      if (typeof rig.setCameraProfile === 'function') {
        rig.setCameraProfile({ zoom: step.zoom, pitch: step.pitch });
      }
    }

    // Apply live to runtime (actor movement truth + camera profile)
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (rt) {
      if (typeof rt.setCruiseAltitude === 'function') {
        rt.setCruiseAltitude(step.altitudeFt);
      }
      if (typeof rt.setCameraProfile === 'function') {
        rt.setCameraProfile({ zoom: step.zoom, pitch: step.pitch });
      }
    }

    // Update nav state
    if (global._wos && global._wos.nav) global._wos.nav.altStep = step;
    _saveState();

    return { altitudeFt: step.altitudeFt, zoom: step.zoom, pitch: step.pitch,
             label: step.label, index: next };
  }

  // ── Debug: actor state snapshot ───────────────────────────────────────────────

  function _actorState() {
    var rt  = global.SBE && SBE.RegionalFlightTripRuntime;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    var nav = global._wos && global._wos.nav;
    var rts = rt && typeof rt.getState === 'function' ? rt.getState() : null;
    var altStep   = _currentAltStep();
    var speedMult = _currentSpeedMult();

    // actorAltitudeFt = movement truth. Prefer the live actor entity altitude
    // from the runtime (which climbs/cruises/descends during the trip). Fall
    // back to the altitude-step intent when no actor entity exists yet.
    var actorAltFt = (rts && rts.current && rts.current.altitudeFt != null)
      ? rts.current.altitudeFt
      : (altStep ? altStep.altitudeFt : null);

    // Actor type is inferred from altitude envelope — not hardcoded to 'aircraft'.
    // Altitude represents camera operating envelope; the actor type is display context.
    var actorType = altStep
      ? (altStep.altitudeFt <=  100 ? 'drone'
       : altStep.altitudeFt <=  500 ? 'low-flight'
       : altStep.altitudeFt <= 5000 ? 'aircraft'
       : 'aircraft')
      : 'unknown';

    return {
      // Actor — movement truth
      actorType:           actorType,
      transportState:      _state.transport,
      actorAltitudeFt:     actorAltFt,
      altitudeStepFt:      altStep ? altStep.altitudeFt : null,  // UI intent (POV preset)
      altitudeStepLabel:   altStep ? altStep.label : null,
      // POV — camera interpretation
      povType:             'forward',
      povAltitudeOffsetFt: 0,
      // Presentation scale
      zoom:      map ? Math.round(map.getZoom()    * 100) / 100 : null,
      pitch:     map ? Math.round(map.getPitch()   * 10)  / 10  : null,
      bearing:   map ? Math.round(((map.getBearing() % 360) + 360) % 360) : null,
      // Speed
      speedMultiplier: speedMult,
      speedLabel:      _fmtSpeed(speedMult),
      // Trip
      routeDistanceKm: nav && nav.distanceKm ? Math.round(nav.distanceKm) : null,
      progressPct:     rts ? rts.progressPct : null,
      phase:           rts ? rts.tripPhase   : null,
    };
  }

  function actor() {
    var s = _actorState();
    console.group('[TraversalDeck] actor()');
    Object.keys(s).forEach(function (k) {
      console.log((k + '             ').slice(0, 22) + ':', s[k] != null ? s[k] : '—');
    });
    console.groupEnd();
    return s;
  }

  // ── Debug: feasibility reports (read-only) ────────────────────────────────────

  function cloudFeasibility() {
    var report = {
      doctrine: 'Real weather determines cloud truth. WOS determines visual interpretation. No fake clouds.',
      requiredFields: [
        'cloudCoverPct',
        'cloudCeilingFt',
        'cloudLayerAltitudeFt',
        'visibilityMeters',
        'weatherConditionRaw',
      ],
      availableNow: {},
      missing: ['cloudCoverPct','cloudCeilingFt','cloudLayerAltitudeFt','visibilityMeters','weatherConditionRaw'],
      status: 'investigation-only',
      rule: 'If real weather says clear sky, WOS may render clear sky. No synthetic clouds.',
    };
    console.group('[TraversalDeck] cloudFeasibility()');
    console.log('status  :', report.status);
    console.log('doctrine:', report.doctrine);
    console.log('missing :', report.missing.join(', '));
    console.groupEnd();
    return report;
  }

  function heroVehicleFeasibility() {
    var report = {
      actorType:                'car',
      requiredRouteAuthority:   'road-network-polyline',
      requiredDataSource:       'Mapbox Directions API (profile: mapbox/driving) or equivalent',
      trafficRequiredForPrototype: false,
      firstPrototype:           'single hero car following one road-aware route',
      expansionPath:            'fetch Directions API → convert polyline to waypoints → startGeneratedTrip',
      sharedExpansionPath:      'Drive / Walk / Bike all use same Mapbox Directions API pattern',
      recommendedPOV:           ['chase', 'side', 'overhead'],
      status:                   'high-feasibility — investigation-only',
      note:                     'Hero car does not require traffic simulation for first prototype.',
    };
    console.group('[TraversalDeck] heroVehicleFeasibility()');
    console.log('status    :', report.status);
    console.log('dataSource:', report.requiredDataSource);
    console.log('blocker   :', 'none technical — needs Directions API integration');
    console.log('note      :', report.note);
    console.groupEnd();
    return report;
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.TraversalControlDeck = Object.freeze({
    VERSION:      VERSION,
    mount:        mount,
    unmount:      unmount,
    show:         show,
    hide:         hide,
    launch:       launch,
    driveTo:      driveTo,
    DESTINATIONS: DESTINATIONS,
  });

  // ── Debug binding — with retry guards ─────────────────────────────────────────
  // main.js overwrites window._wos after scripts load, so we rebind on a delay.

  var _debugObj = {
    // ── Navigation ────────────────────────────────────────────────────────────
    launch: launch,
    go: function (to) {
      var toEl = document.getElementById('nav-to');
      if (toEl) toEl.value = to;
      _state.to = to;
      launch();
    },
    resolve: function (name) {
      var r = _resolveDestination(name);
      console.log('[WOSNav] resolve:', name, '→', r ? r.label + ' (' + r.lat.toFixed(4) + ',' + r.lng.toFixed(4) + ')' : 'NOT FOUND');
      return r;
    },
    where: function () {
      var c = _getCurrentMapCenter();
      console.log('[WOSNav] current location:', c);
      return c;
    },
    // ── Speed stepper (read + write) ──────────────────────────────────────────
    speedUp:   function () { return _stepSpeed(1);  },
    speedDown: function () { return _stepSpeed(-1); },
    speed: function () {
      var mult = _currentSpeedMult();
      console.log('[TraversalDeck] speed:', _fmtSpeed(mult), '(index ' + _state.speedIndex + ')');
      return { speedMultiplier: mult, label: _fmtSpeed(mult), index: _state.speedIndex };
    },
    // ── Altitude stepper (read + write) ───────────────────────────────────────
    altitudeUp:   function () { return _stepAltitude(1);  },
    altitudeDown: function () { return _stepAltitude(-1); },
    altitude: function () {
      var s = _currentAltStep();
      console.log('[TraversalDeck] altitude:', s.label, '—', _fmtAltStep(s));
      return s;
    },
    // ── Actor / telemetry (read-only) ─────────────────────────────────────────
    actor:    actor,
    // ── Feasibility reports ───────────────────────────────────────────────────
    cloudFeasibility:      cloudFeasibility,
    heroVehicleFeasibility: heroVehicleFeasibility,
  };

  function _bindDebug() {
    global._wos             = global._wos             || {};
    global._wos.debug       = global._wos.debug       || {};
    global._wos.debug.traversalDeck = _debugObj;
  }

  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
  global.setTimeout(_bindDebug, 2500);

  // ── Auto-mount ─────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(mount, 0); });
  } else {
    setTimeout(mount, 0);
  }

  console.log('[WOSNav] v' + VERSION + ' loaded');

})(window);
