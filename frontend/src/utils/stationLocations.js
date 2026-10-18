/**
 * Station Locations & Landmark Directory for Move It (Doon Valley Transit)
 * Converts abstract GPS latitude/longitude into exact physical addresses, landmarks, and zones.
 */

export const DEHRADUN_LANDMARKS = {
  'Graphic Era University (Campus)': {
    landmark: 'Bell Road, Clement Town, Dehradun',
    zone: 'Campus Hub',
    description: 'Main Campus Gate 1 & Inter-campus Shuttle Bay',
    area: 'Clement Town',
    lat: 30.2675,
    lon: 77.9959,
  },
  'Clock Tower': {
    landmark: 'Rajpur Road & Paltan Bazaar Chowk, Dehradun',
    zone: 'Central City',
    description: 'Opposite Ashley Hall & Gandhi Park Crossing',
    area: 'Paltan Bazaar / Rajpur Road',
    lat: 30.3256,
    lon: 78.0437,
  },
  'Prem Nagar': {
    landmark: 'Chakrata Road, Near IMA Main Gate, Dehradun',
    zone: 'Western Corridor',
    description: 'Prem Nagar Main Market & UPES Transit Junction',
    area: 'Prem Nagar / IMA',
    lat: 30.3326,
    lon: 77.9583,
  },
  'Mothrowala': {
    landmark: 'Mothrowala Chowk, Haridwar Bypass, Dehradun',
    zone: 'South Dehradun',
    description: 'Near ISBT Dehradun & Rispana Valley Bypass',
    area: 'Mothrowala / ISBT',
    lat: 30.263,
    lon: 78.0323,
  },
  'ONGC Chowk': {
    landmark: 'Kaulagarh Road & Chakrata Road Junction, Dehradun',
    zone: 'North-Central',
    description: 'Opposite Forest Research Institute (FRI) Main Arch',
    area: 'Kaulagarh / FRI',
    lat: 30.3409,
    lon: 78.019,
  },
  'Doiwala': {
    landmark: 'Dehradun-Haridwar Highway (NH-7), Doiwala',
    zone: 'Eastern Valley',
    description: 'Near Doiwala Sugar Mill & Railway Station Chowk',
    area: 'Doiwala Town',
    lat: 30.1798,
    lon: 78.1232,
  },
  'Jolly Grant Airport': {
    landmark: 'Rishikesh Road (NH-7), Jolly Grant, Dehradun',
    zone: 'Airport Terminal',
    description: 'Dehradun Domestic Terminal Gate & Himalayan Hospital',
    area: 'Jolly Grant',
    lat: 30.1967,
    lon: 78.0877,
  },
  'Vikasnagar': {
    landmark: 'Herbertpur-Vikasnagar Road (NH-721), Western Doon',
    zone: 'Yamuna Valley',
    description: 'Near Dakpathar Barrage Junction & Bus Stand',
    area: 'Vikasnagar',
    lat: 30.468,
    lon: 77.774,
  },
  'Rishikesh': {
    landmark: 'Haridwar-Rishikesh Highway, Natraj Chowk, Rishikesh',
    zone: 'Foothills Terminal',
    description: 'Near ISBT Rishikesh & Triveni Ghat Link',
    area: 'Rishikesh Gateway',
    lat: 30.1078,
    lon: 78.2925,
  },
};

// Popular presets for Admin adding new stations so they don't need to remember coordinates
export const POPULAR_DEHRADUN_HUBS = [
  {
    name: 'ISBT Dehradun',
    landmark: 'Haridwar Bypass Road, Transport Nagar',
    zone: 'Interstate Hub',
    lat: 30.2878,
    lon: 78.0062,
  },
  {
    name: 'Ballupur Chowk',
    landmark: 'GMS Road & Chakrata Road Crossing',
    zone: 'West City',
    lat: 30.3392,
    lon: 78.0084,
  },
  {
    name: 'Jakhan / Pacific Mall',
    landmark: 'Rajpur Road, Near Pacific Mall Entrance',
    zone: 'North Corridor',
    lat: 30.3683,
    lon: 78.0689,
  },
  {
    name: 'Rispana Pull',
    landmark: 'Haridwar Road & Vidhan Sabha Chowk',
    zone: 'East City',
    lat: 30.2941,
    lon: 78.0531,
  },
  {
    name: 'Sahastradhara Crossing',
    landmark: 'Sahastradhara Road & IT Park Link',
    zone: 'Northeast Corridor',
    lat: 30.3542,
    lon: 78.0833,
  },
  {
    name: 'Selaqui Industrial Hub',
    landmark: 'Chakrata Road, Selaqui Pharma City',
    zone: 'Western Industrial',
    lat: 30.3667,
    lon: 77.8542,
  },
  {
    name: 'Dehradun Railway Station',
    landmark: 'Gandhi Road, Lakkhi Bagh',
    zone: 'Rail Terminal',
    lat: 30.3165,
    lon: 78.0322,
  },
];

/**
 * Returns exact human-readable location details for any station.
 */
export const getStationLocation = (station) => {
  if (!station) {
    return {
      landmark: 'Location unspecified',
      zone: 'Transit Corridor',
      description: '',
      mapUrl: null,
    };
  }

  const name = station.name || '';
  const lat = station.latitude || 30.2675;
  const lon = station.longitude || 77.9959;

  // Exact match or partial match
  const matchedKey = Object.keys(DEHRADUN_LANDMARKS).find(
    (k) => k.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(k.toLowerCase())
  );

  const matchedPreset = POPULAR_DEHRADUN_HUBS.find(
    (h) => h.name.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(h.name.toLowerCase())
  );

  const info = matchedKey
    ? DEHRADUN_LANDMARKS[matchedKey]
    : matchedPreset
    ? matchedPreset
    : null;

  const landmark = info?.landmark || `${name}, Dehradun Valley Region`;
  const zone = info?.zone || 'Valley Corridor';
  const description = info?.description || `Transit stop near ${name}`;

  // Use human-readable address for the map link, not raw coordinates.
  // If we have a known landmark address, search by that; otherwise use station name + city.
  const searchAddress = info?.landmark
    ? info.landmark
    : `${name}, Dehradun, Uttarakhand`;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchAddress)}`;

  return {
    landmark,
    zone,
    description,
    mapUrl,
    lat,
    lon,
  };
};
