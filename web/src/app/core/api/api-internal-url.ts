/** Where the server reaches the API directly (compose service), instead of the public `/api` proxy. */
export const apiInternalUrl = (process.env['API_INTERNAL_URL'] || 'http://localhost:8080').replace(
  /\/$/,
  '',
);
