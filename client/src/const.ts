export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export type LoginUrlOptions = {
  /** Append VITE_LOGIN_LOGIN_ONLY_QUERY (e.g. Auth0 screen_hint=login) for IdPs that support it. */
  loginOnly?: boolean;
};

/** Where the browser goes to establish a session (same-origin cookie). */
export const getLoginUrl = (options?: LoginUrlOptions) => {
  const explicit = import.meta.env.VITE_LOGIN_URL;
  let base =
    typeof explicit === "string" && explicit.length > 0 ? explicit : "/api/auth/dev-login";

  const loginOnlyQuery = import.meta.env.VITE_LOGIN_LOGIN_ONLY_QUERY;
  if (
    options?.loginOnly &&
    typeof loginOnlyQuery === "string" &&
    loginOnlyQuery.trim().length > 0
  ) {
    const sep = base.includes("?") ? "&" : "?";
    base = `${base}${sep}${loginOnlyQuery.trim()}`;
  }

  return base;
};
