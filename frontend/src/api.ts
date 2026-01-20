const base = import.meta.env.VITE_API_BASE || "";

function getToken(): string | null {
    return localStorage.getItem("mikrosms.token");
}

export function setToken(token: string) {
    localStorage.setItem("mikrosms.token", token);
}

export function clearToken() {
    localStorage.removeItem("mikrosms.token");
}

async function fetchJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${base}${path}`, {
        ...options,
        headers,
    });

    if (!res.ok) {
        const text = await res.text();
        let detail = text;
        try {
            const json = JSON.parse(text);
            detail = json.detail || text;
        } catch { }
        throw new Error(detail);
    }

    return res.json();
}

// Auth
export async function authStatus(): Promise<{ has_users: boolean }> {
    return fetchJson("/api/auth/status");
}

export async function login(username: string, password: string): Promise<{ access_token: string }> {
    return fetchJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
}

export async function setup(username: string, password: string): Promise<{ access_token: string }> {
    return fetchJson("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
}

export async function getMe(): Promise<{ id: number; username: string; is_admin: boolean }> {
    return fetchJson("/api/auth/me");
}

// Routers
export interface Router {
    id: number;
    name: string;
    host: string;
    proto: string;
    port: number;
    username: string;
    tls_verify: boolean;
    lte_interface: string;
}

export async function listRouters(): Promise<Router[]> {
    return fetchJson("/api/routers");
}

export async function createRouter(data: Partial<Router> & { password: string }): Promise<Router> {
    return fetchJson("/api/routers", {
        method: "POST",
        body: JSON.stringify(data),
    });
}

export async function updateRouter(id: number, data: Partial<Router> & { password?: string }): Promise<Router> {
    return fetchJson(`/api/routers/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
    });
}

export async function deleteRouter(id: number): Promise<void> {
    return fetchJson(`/api/routers/${id}`, { method: "DELETE" });
}

export async function testRouter(id: number): Promise<{ ok: boolean; message?: string }> {
    return fetchJson(`/api/routers/${id}/test`, { method: "POST" });
}

// Active router
export async function getActiveRouter(): Promise<{ router_id: number | null }> {
    return fetchJson("/api/active_router");
}

export async function setActiveRouter(routerId: number): Promise<void> {
    return fetchJson("/api/active_router", {
        method: "POST",
        body: JSON.stringify({ router_id: routerId }),
    });
}

// Settings
export async function getSettings(): Promise<Record<string, string>> {
    return fetchJson("/api/settings");
}

export async function putSettings(data: Record<string, unknown>): Promise<Record<string, string>> {
    return fetchJson("/api/settings", {
        method: "PUT",
        body: JSON.stringify(data),
    });
}

// Messages
export interface Message {
    id: number;
    router_id: number;
    direction: string;
    phone: string;
    body: string;
    timestamp: string;
    read: boolean;
}

export async function listInbox(limit = 50, offset = 0): Promise<Message[]> {
    return fetchJson(`/api/inbox?limit=${limit}&offset=${offset}`);
}

export async function getMessage(id: number): Promise<Message> {
    return fetchJson(`/api/inbox/${id}`);
}

export async function markRead(id: number): Promise<void> {
    return fetchJson(`/api/inbox/${id}/read`, { method: "POST" });
}

export async function deleteMessage(id: number, deleteRouter: boolean = false): Promise<void> {
    return fetchJson(`/api/inbox/${id}?delete_router=${deleteRouter}`, { method: "DELETE" });
}

export async function syncInbox(): Promise<{ ok: boolean; new_messages: number }> {
    return fetchJson("/api/sync", { method: "POST" });
}

export async function emptyInbox(deleteRouter: boolean = false): Promise<{ ok: boolean; cleared: boolean }> {
    return fetchJson("/api/inbox/empty", {
        method: "POST",
        body: JSON.stringify({ delete_router: deleteRouter }),
    });
}

export async function sendSms(phone: string, message: string): Promise<{ ok: boolean; message_id: number }> {
    return fetchJson("/api/send", {
        method: "POST",
        body: JSON.stringify({ phone, message }),
    });
}

// LTE info
export interface LTEInfo {
    interface: string;
    status: string | boolean;
    operator: string;
    signal_strength: number;
    registration_status: string;
}

export async function getLteInfo(): Promise<LTEInfo> {
    return fetchJson("/api/lte/info");
}

export async function listLteInterfaces(): Promise<{ interfaces: string[] }> {
    return fetchJson("/api/lte/interfaces");
}

// Users
export interface User {
    id: number;
    username: string;
    is_admin: boolean;
    created_at: string;
}

export async function listUsers(): Promise<User[]> {
    return fetchJson("/api/users");
}

export async function createUser(username: string, password: string): Promise<User> {
    return fetchJson("/api/users", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
}

export async function deleteUser(id: number): Promise<void> {
    return fetchJson(`/api/users/${id}`, { method: "DELETE" });
}
