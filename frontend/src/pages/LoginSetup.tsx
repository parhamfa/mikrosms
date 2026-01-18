import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authStatus, login, setup, setToken, createRouter, testRouter, listRouters, setActiveRouter } from "../api";
import { useAuth } from "../auth";

export default function LoginSetup() {
    const navigate = useNavigate();
    const location = useLocation();
    const { refresh } = useAuth();

    const [mode, setMode] = React.useState<"checking" | "login" | "setup" | "router">("checking");
    const [username, setUsername] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [error, setError] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    // Router setup form
    const [routerName, setRouterName] = React.useState("");
    const [routerHost, setRouterHost] = React.useState("");
    const [routerPort, setRouterPort] = React.useState(443);
    const [routerProto, setRouterProto] = React.useState("rest");
    const [routerUsername, setRouterUsername] = React.useState("admin");
    const [routerPassword, setRouterPassword] = React.useState("");
    const [routerTlsVerify, setRouterTlsVerify] = React.useState(false);
    const [lteInterface, setLteInterface] = React.useState("lte1");
    const [testStatus, setTestStatus] = React.useState("");

    React.useEffect(() => {
        (async () => {
            try {
                const status = await authStatus();
                if (!status.has_users) {
                    setMode("setup");
                } else {
                    setMode("login");
                }
            } catch {
                setMode("login");
            }
        })();
    }, []);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            let res;
            if (mode === "setup") {
                res = await setup(username, password);
            } else {
                res = await login(username, password);
            }
            setToken(res.access_token);
            await refresh();

            // Check if we need router setup
            const routers = await listRouters();
            if (routers.length === 0) {
                setMode("router");
            } else {
                const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/";
                navigate(from, { replace: true });
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Authentication failed");
        } finally {
            setBusy(false);
        }
    };

    const handleRouterSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            const router = await createRouter({
                name: routerName || "Default Router",
                host: routerHost,
                port: routerPort,
                proto: routerProto,
                username: routerUsername,
                password: routerPassword,
                tls_verify: routerTlsVerify,
                lte_interface: lteInterface,
            });
            await setActiveRouter(router.id);
            navigate("/", { replace: true });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to create router");
        } finally {
            setBusy(false);
        }
    };

    const handleTestRouter = async () => {
        setTestStatus("Testing...");
        try {
            // Create temp router to test
            const router = await createRouter({
                name: routerName || "Test",
                host: routerHost,
                port: routerPort,
                proto: routerProto,
                username: routerUsername,
                password: routerPassword,
                tls_verify: routerTlsVerify,
                lte_interface: lteInterface,
            });
            try {
                await testRouter(router.id);
                setTestStatus("OK - Connection successful");
                // Keep the router since it works
                await setActiveRouter(router.id);
            } catch (err: unknown) {
                setTestStatus(err instanceof Error ? err.message : "Connection failed");
            }
        } catch (err: unknown) {
            setTestStatus(err instanceof Error ? err.message : "Failed to create router");
        }
    };

    if (mode === "checking") {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-gray-500 dark:text-gray-400">Loading...</div>
            </div>
        );
    }

    if (mode === "router") {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-3xl ring-1 ring-gray-200 bg-white dark:bg-gray-900 dark:ring-gray-800 shadow-lg p-6">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Router Setup</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        Connect to your MikroTik router with LTE modem
                    </p>

                    <form onSubmit={handleRouterSetup} className="grid gap-4">
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
                            <input
                                type="text"
                                value={routerName}
                                onChange={(e) => setRouterName(e.target.value)}
                                placeholder="My Router"
                                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Host / IP</label>
                            <input
                                type="text"
                                value={routerHost}
                                onChange={(e) => setRouterHost(e.target.value)}
                                placeholder="192.168.1.1"
                                required
                                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Protocol</label>
                                <select
                                    value={routerProto}
                                    onChange={(e) => {
                                        setRouterProto(e.target.value);
                                        setRouterPort(e.target.value === "rest" ? 443 : 80);
                                    }}
                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700 bg-white dark:bg-gray-950"
                                >
                                    <option value="rest">REST HTTPS</option>
                                    <option value="rest-http">REST HTTP</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Port</label>
                                <input
                                    type="number"
                                    value={routerPort}
                                    onChange={(e) => setRouterPort(Number(e.target.value))}
                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Username</label>
                            <input
                                type="text"
                                value={routerUsername}
                                onChange={(e) => setRouterUsername(e.target.value)}
                                required
                                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Password</label>
                            <input
                                type="password"
                                value={routerPassword}
                                onChange={(e) => setRouterPassword(e.target.value)}
                                required
                                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">LTE Interface</label>
                            <input
                                type="text"
                                value={lteInterface}
                                onChange={(e) => setLteInterface(e.target.value)}
                                placeholder="lte1"
                                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                        </div>

                        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                            <input
                                type="checkbox"
                                checked={routerTlsVerify}
                                onChange={(e) => setRouterTlsVerify(e.target.checked)}
                                className="rounded border-gray-300 text-gray-900 focus:ring-gray-300 dark:border-gray-700"
                            />
                            Verify TLS certificates
                        </label>

                        {testStatus && (
                            <div className={`text-sm ${testStatus.startsWith("OK") ? "text-green-700 dark:text-green-400" : "text-rose-600 dark:text-rose-400"}`}>
                                {testStatus}
                            </div>
                        )}

                        {error && <div className="text-sm text-red-600">{error}</div>}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={handleTestRouter}
                                className="flex-1 rounded-full bg-gray-100 text-gray-800 px-4 py-2 text-sm shadow hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                            >
                                Test Connection
                            </button>
                            <button
                                type="submit"
                                disabled={busy}
                                className="flex-1 rounded-full bg-gray-900 text-white px-4 py-2 text-sm shadow hover:bg-black disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                            >
                                {busy ? "Saving..." : "Continue"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-3xl ring-1 ring-gray-200 bg-white dark:bg-gray-900 dark:ring-gray-800 shadow-lg p-6">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {mode === "setup" ? "Setup" : "Login"}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    {mode === "setup" ? "Create your admin account" : "Sign in to continue"}
                </p>

                <form onSubmit={handleAuth} className="grid gap-4">
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                        />
                    </div>

                    {error && <div className="text-sm text-red-600">{error}</div>}

                    <button
                        type="submit"
                        disabled={busy}
                        className="rounded-full bg-gray-900 text-white px-4 py-2 text-sm shadow hover:bg-black disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                    >
                        {busy ? "..." : mode === "setup" ? "Create Account" : "Sign In"}
                    </button>
                </form>
            </div>
        </div>
    );
}
