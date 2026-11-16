import { AxiosInstance } from "axios";
import { createApiClient } from "./apiClient";

export class LoginController {
    api: AxiosInstance;

    constructor() {
        this.api = createApiClient();
    }

    async login(username: string, password: string, role: string = 'viewer'): Promise<any> {
        return await this.api.post('/auth/login', {
            username,
            password,
            role
        });
    }

    async register(username: string, password: string, email: string, role: string = 'viewer'): Promise<any> {
        return await this.api.post('/auth/register', {
            username,
            password,
            role,
            email
        });
    }

    async checkAuth(): Promise<any> {
        return await this.api.get('/auth/check');
    }

    async refreshToken(): Promise<any> {
        return await this.api.post('/auth/token/refresh');
    }

    async logout(): Promise<any> {
        return await this.api.delete('/auth/logout');
    }
}
