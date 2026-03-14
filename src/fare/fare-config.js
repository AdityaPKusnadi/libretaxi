import { saveConfigToOracle, getConfigFromOracle } from '../support/oracle-db';

const ORACLE_KEY = 'connect:fare_config';
const RADIUS_KEY = 'connect:max_radius';

const VEHICLE_DEFAULTS = {
  car:  { baseFare: 300, perKmRate: 100 },
  tuk:  { baseFare: 200, perKmRate: 80 },
  bike: { baseFare: 150, perKmRate: 60 },
  van:  { baseFare: 400, perKmRate: 120 },
};

const DEFAULT_CONFIG = {
  currency: 'LKR',
  currencySymbol: 'LKR ',
  baseKm: 3,
  useKilometres: true,
  rates: JSON.parse(JSON.stringify(VEHICLE_DEFAULTS)),
  blockedCategories: [],
};

let cachedConfig = null;
let cachedRadius = null;

export default function loadFareConfig() {
  if (cachedConfig) return JSON.parse(JSON.stringify(cachedConfig));
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function getVehicleRate(vehicleType) {
  const config = loadFareConfig();
  const rates = config.rates || {};
  const vt = (vehicleType || 'car').toLowerCase();
  const defaults = VEHICLE_DEFAULTS[vt] || VEHICLE_DEFAULTS.car;
  const r = rates[vt] || defaults;
  return {
    baseFare: r.baseFare != null ? r.baseFare : defaults.baseFare,
    baseKm: config.baseKm != null ? config.baseKm : 3,
    perKmRate: r.perKmRate != null ? r.perKmRate : defaults.perKmRate,
    currency: config.currency || 'LKR',
    currencySymbol: config.currencySymbol || 'LKR ',
    useKilometres: config.useKilometres,
  };
}

export function isCategoryBlocked(category) {
  const config = loadFareConfig();
  const blocked = config.blockedCategories || [];
  return blocked.includes((category || '').toLowerCase());
}

export function saveFareConfig(updates) {
  const current = loadFareConfig();
  const merged = Object.assign({}, current, updates);
  if (updates.rates) {
    merged.rates = Object.assign({}, current.rates || {}, updates.rates);
  }
  cachedConfig = merged;
  try {
    saveConfigToOracle(ORACLE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.log(`Error saving fare config to Oracle: ${e}`);
  }
  return merged;
}

export async function loadFareConfigFromOracle() {
  try {
    const data = await getConfigFromOracle(ORACLE_KEY);
    if (!data) {
      cachedConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    } else {
      const parsed = JSON.parse(data);
      cachedConfig = Object.assign({}, DEFAULT_CONFIG, parsed);
      if (parsed.rates) {
        cachedConfig.rates = Object.assign({}, DEFAULT_CONFIG.rates, parsed.rates);
      }
    }
    return cachedConfig;
  } catch (e) {
    cachedConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    return cachedConfig;
  }
}

export function saveRadius(val) {
  cachedRadius = val;
  try {
    saveConfigToOracle(RADIUS_KEY, String(val));
  } catch (e) {
    console.log(`Error saving radius to Oracle: ${e}`);
  }
}

export function getRadius() {
  return cachedRadius;
}

export async function loadRadiusFromOracle(defaultRadius) {
  try {
    const data = await getConfigFromOracle(RADIUS_KEY);
    if (!data) {
      cachedRadius = defaultRadius;
    } else {
      cachedRadius = parseInt(data, 10) || defaultRadius;
    }
    return cachedRadius;
  } catch (e) {
    cachedRadius = defaultRadius;
    return cachedRadius;
  }
}
