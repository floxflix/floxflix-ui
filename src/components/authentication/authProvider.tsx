import { createContext, ReactNode, useContext, useState, useEffect, useCallback } from "react";
import { LoginController } from "../../controllers";
import { SESSION_EXPIRED_EVENT } from "../../controllers/apiClient";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    username: string;
    userRole: string;
    error: string | null;
    login: (username: string, password: string, role?: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
    children: ReactNode;
}

const loginCtrl = new LoginController();

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [username, setUsername] = useState('None');
    const [userRole, setUserRole] = useState('viewer');
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const applySession = useCallback((data: { username?: string; role?: string }) => {
        setIsAuthenticated(true);
        setUsername(data?.username || 'None');
        setUserRole(data?.role || 'viewer');
        setError(null);
    }, []);

    const clearSession = useCallback((message: string | null = null) => {
        setIsAuthenticated(false);
        setUsername('None');
        setUserRole('viewer');
        setError(message);
    }, []);

    const checkAuthentication = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await loginCtrl.checkAuth();

            if (res?.status === 200) {
                applySession(res.data.user);
            } else {
                clearSession('Authentication check failed');
            }
        } catch (err) {
            console.error('Auth check failed:', err);
            clearSession('Authentication check failed');
        } finally {
            setIsLoading(false);
        }
    }, [applySession, clearSession]);

    useEffect(() => {
        checkAuthentication();
    }, [checkAuthentication]);

    useEffect(() => {
        const onSessionExpired = () => {
            clearSession('Your session has expired. Please sign in again.');
        };
        window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    }, [clearSession]);

    const login = async (username: string, password: string, role: string = 'viewer'): Promise<void> => {
        try {
            setIsLoading(true);
            setError(null);
            const res = await loginCtrl.login(username, password, role);
            if (res.status === 200) {
                const actualRole = res.data.role || role;
                applySession({ username: res.data.username, role: actualRole });
                // Navigate based on role
                if (actualRole === 'admin') {
                    navigate("/dashboard/home");
                } else {
                    navigate("/");
                }
            }
        } catch (err) {
            console.error('Login failed:', err);
            setError('Login failed. Please check your credentials.');
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async (): Promise<void> => {
        setIsLoading(true);
        setError(null);
        try {
            await loginCtrl.logout();
        } catch (err) {
            console.error('Logout failed:', err);
        } finally {
            clearSession();
            setIsLoading(false);
            navigate("/login");
        }
    };

    const value: AuthContextType = {
        isAuthenticated,
        isLoading,
        username,
        userRole,
        error,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}; 