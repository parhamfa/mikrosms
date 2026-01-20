import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { listInbox, syncInbox, emptyInbox, markRead, deleteMessage, getLteInfo, type Message, type LTEInfo } from "../api";

function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
    const base = "rounded-2xl ring-1 ring-gray-200 bg-white shadow-sm hover:shadow-md transition dark:ring-gray-800 dark:bg-gray-900";
    return <div className={`${base} ${className}`} {...props} />;
}

function isRTL(text: string): boolean {
    // Check if text contains RTL characters (Persian, Arabic, Hebrew)
    const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;
    return rtlRegex.test(text);
}

export default function Inbox() {
    const navigate = useNavigate();
    const [messages, setMessages] = React.useState<Message[]>([]);
    const [lteInfo, setLteInfo] = React.useState<LTEInfo | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [syncing, setSyncing] = React.useState(false);
    const [error, setError] = React.useState("");
    const [selectedId, setSelectedId] = React.useState<number | null>(null);

    // Auto-sync settings (saved to localStorage)
    const [autoSyncInterval, setAutoSyncInterval] = React.useState<number>(() => {
        try {
            const saved = localStorage.getItem("mikrosms.autoSyncInterval");
            return saved ? parseInt(saved, 10) : 0; // 0 = disabled
        } catch { return 0; }
    });
    const [autoSyncUnit, setAutoSyncUnit] = React.useState<"sec" | "min">(() => {
        try {
            const saved = localStorage.getItem("mikrosms.autoSyncUnit");
            return saved === "min" ? "min" : "sec";
        } catch { return "sec"; }
    });

    // Save auto-sync settings to localStorage
    React.useEffect(() => {
        try {
            localStorage.setItem("mikrosms.autoSyncInterval", String(autoSyncInterval));
            localStorage.setItem("mikrosms.autoSyncUnit", autoSyncUnit);
        } catch { }
    }, [autoSyncInterval, autoSyncUnit]);

    const loadMessages = React.useCallback(async () => {
        try {
            const msgs = await listInbox(100);
            setMessages(msgs);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load messages");
        } finally {
            setLoading(false);
        }
    }, []);

    const loadLteInfo = React.useCallback(async () => {
        try {
            const info = await getLteInfo();
            setLteInfo(info);
        } catch {
            // Ignore LTE info errors
        }
    }, []);

    React.useEffect(() => {
        loadMessages();
        loadLteInfo();
    }, [loadMessages, loadLteInfo]);

    // Auto-sync timer
    React.useEffect(() => {
        if (autoSyncInterval <= 0) return;
        const ms = autoSyncInterval * (autoSyncUnit === "min" ? 60000 : 1000);
        const timer = setInterval(async () => {
            try {
                await syncInbox();
                const msgs = await listInbox(100);
                setMessages(msgs);
            } catch { }
        }, ms);
        return () => clearInterval(timer);
    }, [autoSyncInterval, autoSyncUnit]);

    const handleSync = async () => {
        setSyncing(true);
        setError("");
        try {
            await syncInbox();
            await loadMessages();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Sync failed");
        } finally {
            setSyncing(false);
        }
    };

    const [emptying, setEmptying] = React.useState(false);

    const handleEmpty = async () => {
        if (!confirm("Clear all messages and re-fetch from router?")) return;
        setEmptying(true);
        setError("");
        try {
            await emptyInbox();
            await loadMessages();
            setSelectedId(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Empty failed");
        } finally {
            setEmptying(false);
        }
    };

    const handleMark = async (id: number) => {
        try {
            await markRead(id);
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)));
        } catch { }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this message?")) return;
        try {
            await deleteMessage(id);
            setMessages((prev) => prev.filter((m) => m.id !== id));
            if (selectedId === id) setSelectedId(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Delete failed");
        }
    };

    const selectedMessage = messages.find((m) => m.id === selectedId);

    const formatTime = (ts: string) => {
        try {
            const d = new Date(ts);
            const now = new Date();
            const isToday = d.toDateString() === now.toDateString();
            if (isToday) {
                return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            }
            return d.toLocaleDateString([], { month: "short", day: "numeric" });
        } catch {
            return ts;
        }
    };

    return (
        <div className="min-h-screen">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Inbox</h1>
                    <div className="flex items-center gap-3">
                        {lteInfo && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                <span className={`inline-block w-2 h-2 rounded-full ${lteInfo.status ? "bg-green-500" : "bg-gray-400"}`} />
                                <span>{lteInfo.operator || "LTE"}</span>
                                {lteInfo.signal_strength > -999 && <span>{lteInfo.signal_strength} dBm</span>}
                            </div>
                        )}
                        {/* Auto-sync control */}
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                            <span>Auto</span>
                            <input
                                type="number"
                                min="0"
                                value={autoSyncInterval}
                                onChange={(e) => setAutoSyncInterval(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-12 rounded-full border border-gray-300 bg-white text-gray-900 px-2 py-1 text-xs focus:ring-1 focus:ring-gray-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                            />
                            <select
                                value={autoSyncUnit}
                                onChange={(e) => setAutoSyncUnit(e.target.value as "sec" | "min")}
                                className="rounded-full border border-gray-300 bg-white text-gray-900 px-2 py-1 text-xs focus:ring-1 focus:ring-gray-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                            >
                                <option value="sec">sec</option>
                                <option value="min">min</option>
                            </select>
                        </div>
                        <button
                            onClick={handleEmpty}
                            disabled={emptying || syncing}
                            className="rounded-full bg-rose-50 text-rose-700 px-3 py-1.5 text-sm shadow hover:bg-rose-100 disabled:opacity-50 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40"
                        >
                            {emptying ? "Clearing..." : "Empty"}
                        </button>
                        <button
                            onClick={handleSync}
                            disabled={syncing || emptying}
                            className="rounded-full bg-gray-100 text-gray-800 px-3 py-1.5 text-sm shadow hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                            {syncing ? "Syncing..." : "Sync"}
                        </button>
                        <Link
                            to="/settings"
                            className="rounded-full bg-gray-100 text-gray-800 px-3 py-1.5 text-sm shadow hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                            Settings
                        </Link>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-4 py-6">
                {error && (
                    <div className="mb-4 rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-sm dark:bg-rose-900/20 dark:text-rose-300">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-10">Loading...</div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-10">
                        <p>No messages yet</p>
                        <p className="text-xs mt-2">Click Sync to fetch messages from your router</p>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                        {/* Message List */}
                        <div className="grid gap-2">
                            {messages.map((msg) => (
                                <Card
                                    key={msg.id}
                                    onClick={() => {
                                        setSelectedId(msg.id);
                                        if (!msg.read) handleMark(msg.id);
                                    }}
                                    className={`p-4 cursor-pointer ${selectedId === msg.id ? "ring-2 ring-gray-900 dark:ring-gray-100" : ""} ${!msg.read ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`inline-block w-2 h-2 rounded-full ${msg.direction === "in" ? "bg-green-500" : "bg-blue-500"}`} />
                                                <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                                    {msg.phone}
                                                </span>
                                                {!msg.read && (
                                                    <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">New</span>
                                                )}
                                            </div>
                                            <p className={`text-sm text-gray-600 dark:text-gray-300 line-clamp-2 ${isRTL(msg.body) ? "rtl-text" : ""}`}>
                                                {msg.body}
                                            </p>
                                        </div>
                                        <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                                            {formatTime(msg.timestamp)}
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {/* Message Detail */}
                        <div className="hidden md:block">
                            {selectedMessage ? (
                                <Card className="p-5 sticky top-24">
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`inline-block w-2 h-2 rounded-full ${selectedMessage.direction === "in" ? "bg-green-500" : "bg-blue-500"}`} />
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${selectedMessage.direction === "in" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                                                    {selectedMessage.direction === "in" ? "Received" : "Sent"}
                                                </span>
                                            </div>
                                            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{selectedMessage.phone}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {new Date(selectedMessage.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => navigate(`/compose?phone=${encodeURIComponent(selectedMessage.phone)}`)}
                                                className="rounded-full bg-gray-900 text-white px-3 py-1.5 text-sm shadow hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                                            >
                                                Reply
                                            </button>
                                            <button
                                                onClick={() => handleDelete(selectedMessage.id)}
                                                className="rounded-full bg-rose-50 text-rose-700 px-3 py-1.5 text-sm shadow hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    <div className={`text-gray-800 dark:text-gray-200 whitespace-pre-wrap ${isRTL(selectedMessage.body) ? "rtl-text" : ""}`}>
                                        {selectedMessage.body}
                                    </div>
                                </Card>
                            ) : (
                                <Card className="p-5 text-center text-gray-500 dark:text-gray-400">
                                    Select a message to view
                                </Card>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Compose Button */}
            <Link
                to="/compose"
                className="fixed bottom-20 right-4 z-40 h-12 w-12 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                title="Compose"
            >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                </svg>
            </Link>
        </div>
    );
}
