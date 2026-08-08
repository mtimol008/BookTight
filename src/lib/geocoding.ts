// Converts an address into coordinates using the Mapbox Geocoding API.
// Server-side only — MAPBOX_ACCESS_TOKEN is not a NEXT_PUBLIC_ variable, so
// it never reaches the browser bundle.

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export async function geocodeAddress(
  address: string
): Promise<GeocodeResult | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Missing MAPBOX_ACCESS_TOKEN. Add it to .env.local (see .env.local.example)."
    );
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    address
  )}.json?access_token=${token}&limit=1`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Mapbox geocoding request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const feature = data.features?.[0];
  if (!feature) {
    return null;
  }

  const [longitude, latitude] = feature.center as [number, number];
  return {
    latitude,
    longitude,
    formattedAddress: feature.place_name as string,
  };
}

export interface AddressSuggestion {
  id: string;
  placeName: string;
  latitude: number;
  longitude: number;
}

export interface SearchAddressesOptions {
  /** Biases ranking toward this [lon, lat] without excluding other results. */
  proximity?: [number, number];
}

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

/**
 * Mapbox can return the same place more than once in a single response, and
 * its feature ids are not guaranteed unique within one either. Both matter
 * here: identical rows are noise the user can't choose between, and `id` is
 * used as the React key in every address dropdown — a repeat there makes
 * React drop or duplicate entries.
 *
 * Deduping at the source fixes all three dropdowns at once instead of
 * patching each render site.
 */
export function toUniqueSuggestions(features: MapboxFeature[]): AddressSuggestion[] {
  const seenPlaceNames = new Set<string>();
  const seenIds = new Set<string>();
  const suggestions: AddressSuggestion[] = [];

  for (const feature of features) {
    // Two rows showing the same text are indistinguishable to the user.
    if (seenPlaceNames.has(feature.place_name)) {
      continue;
    }
    seenPlaceNames.add(feature.place_name);

    let id = feature.id;
    let attempt = 2;
    while (seenIds.has(id)) {
      id = `${feature.id}-${attempt}`;
      attempt++;
    }
    seenIds.add(id);

    const [longitude, latitude] = feature.center;
    suggestions.push({ id, placeName: feature.place_name, latitude, longitude });
  }

  return suggestions;
}

/** Address autocomplete for the new-job form, using the same Geocoding API. */
export async function searchAddresses(
  query: string,
  options: SearchAddressesOptions = {}
): Promise<AddressSuggestion[]> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Missing MAPBOX_ACCESS_TOKEN. Add it to .env.local (see .env.local.example)."
    );
  }

  if (!query.trim()) {
    return [];
  }

  let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?access_token=${token}&autocomplete=true&limit=5`;

  if (options.proximity) {
    url += `&proximity=${options.proximity[0]},${options.proximity[1]}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Mapbox search request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return toUniqueSuggestions((data.features ?? []) as MapboxFeature[]);
}
