import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import {
    listRouters,
    createRouter,
    updateRouter,
    deleteRouter,
    testRouter,
    getActiveRouter,
    setActiveRouter,
    getSettings,
    putSettings,
    listUsers,
    createUser,
    deleteUser,
    type Router,
    type User,
} from "../api";

export default function Settings() {
    const { logout } = useAuth();

    const [routers, setRouters] = React.useState<Router[]>([]);
    const [activeRouterId, setActiveRouterId] = React.useState<number | null>(null);
    const [settings, setSettings] = React.useState<Record<string, string>>({});
    const [users, setUsers] = React.useState<User[]>([]);

    const [routerModal, setRouterModal] = React.useState(false);
    const [editingRouter, setEditingRouter] = React.useState<Router | null>(null);
    const [routerForm, setRouterForm] = React.useState({
        name: "",
        host: "",
        proto: "rest",
        port: 443,
        username: "admin",
        password: "",
        tls_verify: false,
        lte_interface: "lte1",
    });
    const [routerBusy, setRouterBusy] = React.useState(false);
    const [routerError, setRouterError] = React.useState("");
    const [testStatus, setTestStatus] = React.useState<Record<number, string>>({});

    const [newUsername, setNewUsername] = React.useState("");
    const [newPassword, setNewPassword] = React.useState("");
    const [userBusy, setUserBusy] = React.useState(false);
    const [userError, setUserError] = React.useState("");

    const loadData = React.useCallback(async () => {
        try {
            const [rs, ar, s, us] = await Promise.all([
                listRouters(),
                getActiveRouter(),
                getSettings(),
                listUsers(),
            ]);
            setRouters(rs);
            setActiveRouterId(ar.router_id);
            setSettings(s);
            setUsers(us);
        } catch { }
    }, []);

    React.useEffect(() => {
        loadData();
    }, [loadData]);

    const openRouterModal = (router?: Router) => {
        if (router) {
            setEditingRouter(router);
            setRouterForm({
                name: router.name,
                host: router.host,
                proto: router.proto,
                port: router.port,
                username: router.username,
                password: "",
                tls_verify: router.tls_verify,
                lte_interface: router.lte_interface,
            });
        } else {
            setEditingRouter(null);
            setRouterForm({
                name: "",
                host: "",
                proto: "rest",
                port: 443,
                username: "admin",
                password: "",
                tls_verify: false,
                lte_interface: "lte1",
            });
        }
        setRouterError("");
        setRouterModal(true);
    };

    const handleSaveRouter = async () => {
        setRouterBusy(true);
        setRouterError("");
        try {
            const data = {
                name: routerForm.name || "Router",
                host: routerForm.host,
                proto: routerForm.proto,
                port: routerForm.port,
                username: routerForm.username,
                password: routerForm.password,
                tls_verify: routerForm.tls_verify,
                lte_interface: routerForm.lte_interface,
            };
            if (editingRouter) {
                await updateRouter(editingRouter.id, data);
            } else {
                await createRouter(data);
            }
            setRouterModal(false);
            loadData();
        } catch (err: unknown) {
            setRouterError(err instanceof Error ? err.message : "Failed to save");
        } finally {
            setRouterBusy(false);
        }
    };

    const handleDeleteRouter = async (id: number) => {
        if (!confirm("Delete this router profile?")) return;
        try {
            await deleteRouter(id);
            loadData();
        } catch { }
    };

    const handleTest = async (id: number) => {
        setTestStatus((prev) => ({ ...prev, [id]: "Testing..." }));
        try {
            await testRouter(id);
            setTestStatus((prev) => ({ ...prev, [id]: "OK" }));
        } catch (err: unknown) {
            setTestStatus((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Failed" }));
        }
    };

    const handleSetActive = async (id: number) => {
        try {
            await setActiveRouter(id);
            setActiveRouterId(id);
        } catch { }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setUserBusy(true);
        setUserError("");
        try {
            await createUser(newUsername, newPassword);
            setNewUsername("");
            setNewPassword("");
            loadData();
        } catch (err: unknown) {
            setUserError(err instanceof Error ? err.message : "Failed to create user");
        } finally {
            setUserBusy(false);
        }
    };

    const handleDeleteUser = async (id: number) => {
        if (!confirm("Delete this user?")) return;
        try {
            await deleteUser(id);
            loadData();
        } catch { }
    };

    return (
        <div className="min-h-screen">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={logout}
                            className="rounded-full bg-rose-50 text-rose-700 px-3 py-1.5 text-sm shadow hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300"
                        >
                            Logout
                        </button>
                        <Link
                            to="/"
                            className="rounded-full bg-gray-100 text-gray-800 px-3 py-1.5 text-sm shadow hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                            ← Inbox
                        </Link>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-4 py-6 grid gap-6">
                {/* Router Profiles */}
                <div className="rounded-2xl ring-1 ring-gray-200 bg-white dark:bg-gray-900 dark:ring-gray-800 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Connection Profiles</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">MikroTik routers with LTE modems</p>
                        </div>
                        <button
                            onClick={() => openRouterModal()}
                            className="rounded-full bg-gray-900 text-white px-3 py-1.5 text-sm shadow hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                        >
                            Add Profile
                        </button>
                    </div>

                    <div className="grid gap-3">
                        {routers.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500 dark:text-gray-400">
                                No routers configured
                            </div>
                        ) : (
                            routers.map((r) => (
                                <div
                                    key={r.id}
                                    className="rounded-xl ring-1 ring-gray-200 dark:ring-gray-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-900 dark:text-gray-100">{r.name}</span>
                                            {activeRouterId === r.id && (
                                                <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full dark:bg-green-900/30 dark:text-green-300">
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {r.proto.toUpperCase()} · {r.host}:{r.port} · {r.lte_interface}
                                        </p>
                                        {testStatus[r.id] && (
                                            <p className={`text-xs mt-1 ${testStatus[r.id] === "OK" ? "text-green-600" : "text-rose-600"}`}>
                                                {testStatus[r.id]}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => handleTest(r.id)}
                                            className="rounded-full bg-gray-100 text-gray-800 px-2.5 py-1 text-xs shadow hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100"
                                        >
                                            Test
                                        </button>
                                        <button
                                            onClick={() => handleSetActive(r.id)}
                                            className="rounded-full bg-gray-100 text-gray-800 px-2.5 py-1 text-xs shadow hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100"
                                        >
                                            Set Active
                                        </button>
                                        <button
                                            onClick={() => openRouterModal(r)}
                                            className="rounded-full bg-gray-100 text-gray-800 px-2.5 py-1 text-xs shadow hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteRouter(r.id)}
                                            className="rounded-full bg-rose-50 text-rose-700 px-2.5 py-1 text-xs shadow hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Users */}
                <div className="rounded-2xl ring-1 ring-gray-200 bg-white dark:bg-gray-900 dark:ring-gray-800 p-5">
                    <div className="mb-4">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Users</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Admin accounts</p>
                    </div>

                    <form onSubmit={handleAddUser} className="flex flex-wrap gap-3 mb-4">
                        <input
                            type="text"
                            placeholder="Username"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            required
                            className="flex-1 min-w-[120px] rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            className="flex-1 min-w-[120px] rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                        />
                        <button
                            type="submit"
                            disabled={userBusy}
                            className="rounded-full bg-gray-900 text-white px-4 py-2 text-sm shadow hover:bg-black disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                        >
                            Add
                        </button>
                    </form>

                    {userError && <div className="text-sm text-rose-600 mb-3">{userError}</div>}

                    <div className="grid gap-2">
                        {users.map((u) => (
                            <div
                                key={u.id}
                                className="rounded-xl ring-1 ring-gray-200 dark:ring-gray-800 p-3 flex items-center justify-between"
                            >
                                <div>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">{u.username}</span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                        {new Date(u.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="rounded-full bg-rose-50 text-rose-700 px-2.5 py-1 text-xs shadow hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300"
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Router Modal */}
            {routerModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 shadow-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {editingRouter ? "Edit Profile" : "Add Profile"}
                            </h2>
                            <button
                                onClick={() => setRouterModal(false)}
                                className="rounded-full bg-gray-100 text-gray-800 h-8 w-8 flex items-center justify-center hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="grid gap-3">
                            <input
                                type="text"
                                placeholder="Name"
                                value={routerForm.name}
                                onChange={(e) => setRouterForm({ ...routerForm, name: e.target.value })}
                                className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                            <input
                                type="text"
                                placeholder="Host / IP"
                                value={routerForm.host}
                                onChange={(e) => setRouterForm({ ...routerForm, host: e.target.value })}
                                required
                                className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <select
                                    value={routerForm.proto}
                                    onChange={(e) => setRouterForm({ ...routerForm, proto: e.target.value, port: e.target.value === "rest" ? 443 : 80 })}
                                    className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700 bg-white dark:bg-gray-950"
                                >
                                    <option value="rest">REST HTTPS</option>
                                    <option value="rest-http">REST HTTP</option>
                                </select>
                                <input
                                    type="number"
                                    placeholder="Port"
                                    value={routerForm.port}
                                    onChange={(e) => setRouterForm({ ...routerForm, port: Number(e.target.value) })}
                                    className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="Username"
                                value={routerForm.username}
                                onChange={(e) => setRouterForm({ ...routerForm, username: e.target.value })}
                                required
                                className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                            <input
                                type="password"
                                placeholder={editingRouter ? "Password (leave blank to keep)" : "Password"}
                                value={routerForm.password}
                                onChange={(e) => setRouterForm({ ...routerForm, password: e.target.value })}
                                className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                            <input
                                type="text"
                                placeholder="LTE Interface (e.g. lte1)"
                                value={routerForm.lte_interface}
                                onChange={(e) => setRouterForm({ ...routerForm, lte_interface: e.target.value })}
                                className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                            />
                            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={routerForm.tls_verify}
                                    onChange={(e) => setRouterForm({ ...routerForm, tls_verify: e.target.checked })}
                                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-300 dark:border-gray-700"
                                />
                                Verify TLS
                            </label>
                        </div>

                        {routerError && <div className="text-sm text-rose-600 mt-3">{routerError}</div>}

                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setRouterModal(false)}
                                className="rounded-full bg-gray-100 text-gray-800 px-4 py-2 text-sm shadow hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveRouter}
                                disabled={routerBusy}
                                className="rounded-full bg-gray-900 text-white px-4 py-2 text-sm shadow hover:bg-black disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                            >
                                {routerBusy ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
