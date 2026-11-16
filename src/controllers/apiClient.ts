import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { env } from "../env";

export const SESSION_EXPIRED_EVENT = "floxflix:session-expired";

const baseURL = `${env.VITE_STREAMAPI_URL}${env.VITE_STREAMAPI_PREFIX}`;

/** Endpoints where a 401 means "bad credentials", not "expired session". */
const NO_REFRESH_PATHS = ["/auth/login", "/auth/register", "/auth/token/refresh"];

type RetriableRequest = InternalAxiosRequestConfig & { _retried?: boolean };

let refreshPromise: Promise<unknown> | null = null;

const refreshSession = (): Promise<unknown> => {
    refreshPromise ??= axios
        .post(`${baseURL}/auth/token/refresh`, null, { withCredentials: true })
        .finally(() => {
            refreshPromise = null;
        });
    return refreshPromise;
};

export const createApiClient = (): AxiosInstance => {
    const api = axios.create({ baseURL, withCredentials: true });

    api.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            const request = error.config as RetriableRequest | undefined;
            const isUnauthorized = error.response?.status === 401;
            const skipsRefresh = NO_REFRESH_PATHS.some((path) => request?.url?.includes(path));

            if (!request || !isUnauthorized || skipsRefresh) {
                return Promise.reject(error);
            }

            // The replay after a successful refresh failed too: the session is
            // no longer usable, refresh again would only loop.
            if (request._retried) {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
                }
                return Promise.reject(error);
            }

            request._retried = true;
            try {
                await refreshSession();
            } catch {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
                }
                return Promise.reject(error);
            }

            return api.request(request);
        }
    );

    return api;
};
