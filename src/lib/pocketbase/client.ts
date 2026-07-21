import PocketBase from 'pocketbase';

const configuredUrl = import.meta.env.VITE_PB_URL?.trim().replace(/\/$/, '') ?? '';

export const isPocketBaseConfigured = configuredUrl.length > 0;
export const pocketBaseUrl = configuredUrl;

// The provider refuses authentication when no URL is configured. The fallback
// only gives the SDK a valid constructor URL and is never used for requests.
export const pb = new PocketBase(configuredUrl || 'http://127.0.0.1:8090');
pb.autoCancellation(false);
