import { getNames, registerLocale } from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

/** Required: without this, `getNames("en")` returns `{}` in the browser bundle. */
registerLocale(enLocale);

/**
 * All ISO 3166 countries (English official names), sorted A–Z, for KYC nationality and residence.
 */
export const KYC_COUNTRY_NAMES: readonly string[] = Object.freeze(
  Array.from(new Set(Object.values(getNames("en")))).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  ),
);
