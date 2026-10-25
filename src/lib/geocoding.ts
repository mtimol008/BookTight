// Converts an address into coordinates using the Mapbox Geocoding API.
// Server-side only — MAPBOX_ACCESS_TOKEN is not a NEXT_PUBLIC_ variable, so
// it never reaches the browser bundle.

import { createClient } from "./supabase/server";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

const GEOCODE_CACHE_TTL_HOURS = 24;
const GEOCODE_DAILY_LIMIT_PER_USER = 100;

function addressCacheKey(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * The result this exact address text already produced, if it's still
 * fresh — so re-submitting a form without changing the address (a retried
 * save, a tweak to some other field) reuses the previous answer instead of
 * re-billing Mapbox. Shared across every user: the same address geocodes
 * to the same place for anyone, so there's no reason to key this per-user.
 * Any Supabase error is treated as a cache miss rather than surfaced —
 * this is a cost optimization, not something that should ever block a
 * geocode the user is actually waiting on.
 */
async function getCachedGeocode(address: string): Promise<GeocodeResult | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .rpc("get_cached_geocode", {
        p_address_key: addressCacheKey(address),
        p_ttl_hours: GEOCODE_CACHE_TTL_HOURS,
      })
      .maybeSingle();

    const row = data as { latitude: number; longitude: number; formatted_address: string } | null;
    if (!row) return null;
    return {
      latitude: row.latitude,
      longitude: row.longitude,
      formattedAddress: row.formatted_address,
    };
  } catch {
    return null;
  }
}

async function setCachedGeocode(address: string, result: GeocodeResult): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("set_cached_geocode", {
      p_address_key: addressCacheKey(address),
      p_latitude: result.latitude,
      p_longitude: result.longitude,
      p_formatted_address: result.formattedAddress,
    });
  } catch {
    // Caching is an optimization — losing a cache write just means the
    // next identical request pays for a fresh Mapbox call.
  }
}

/**
 * True if this user is still under today's cap, atomically incrementing
 * their count as part of the check (see the migration's
 * check_and_increment_geocode_usage for why this has to be atomic). Only
 * ever called for a REAL Mapbox request — a cache hit never reaches here,
 * so a user replaying the same address all day only uses one call's worth
 * of quota.
 */
async function checkGeocodeRateLimit(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_and_increment_geocode_usage", {
      p_user_id: userId,
      p_daily_limit: GEOCODE_DAILY_LIMIT_PER_USER,
    });
    if (error) return true;
    return data !== false;
  } catch {
    // Fail open — a transient DB error shouldn't block a legitimate job
    // from being scheduled. This is a cost safety net, not a hard limit.
    return true;
  }
}

export interface GeocodeAddressOptions {
  /** The acting user, for the per-user daily cap. Omitted at signup, where
   *  there's no account yet — Turnstile is that path's abuse defense
   *  instead of a per-user count. */
  userId?: string;
}

export async function geocodeAddress(
  address: string,
  options: GeocodeAddressOptions = {}
): Promise<GeocodeResult | null> {
  const cached = await getCachedGeocode(address);
  if (cached) {
    return cached;
  }

  if (options.userId) {
    const allowed = await checkGeocodeRateLimit(options.userId);
    if (!allowed) {
      throw new Error(
        "You've hit today's address-lookup limit. Try again tomorrow."
      );
    }
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Missing MAPBOX_ACCESS_TOKEN. Add it to .env.local (see .env.local.example)."
    );
  }

  // permanent=true: this result gets stored (job/profile row, plus our own
  // cache above) rather than used once and discarded, which Mapbox's terms
  // require declaring explicitly — the default (temporary) mode forbids
  // storage. searchAddresses below stays on the default: autocomplete
  // suggestions are shown and discarded, never stored, so they're exactly
  // the "temporary" use case and get the free/cheaper rate.
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    address
  )}.json?access_token=${token}&limit=1&permanent=true`;

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
  const result: GeocodeResult = {
    latitude,
    longitude,
    formattedAddress: feature.place_name as string,
  };

  await setCachedGeocode(address, result);
  return result;
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
