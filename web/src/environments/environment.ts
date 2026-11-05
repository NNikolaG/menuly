/** Production. Swapped for `environment.development.ts` in development builds (`angular.json` fileReplacements). */
export const environment = {
  production: true,
  /** Prefix for every API call; nginx proxies `/api/*` to the API (`API_UPSTREAM`). */
  apiBaseUrl: '/api',
};
