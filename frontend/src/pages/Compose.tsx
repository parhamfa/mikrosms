import React from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { sendSms } from "../api";

function isRTL(text: string): boolean {
    const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;
    return rtlRegex.test(text);
}

export default function Compose() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [phone, setPhone] = React.useState(searchParams.get("phone") || "");
    const [message, setMessage] = React.useState("");
    const [sending, setSending] = React.useState(false);
    const [error, setError] = React.useState("");
    const [success, setSuccess] = React.useState(false);

    const charCount = message.length;
    const isUnicode = /[^\x00-\x7F]/.test(message);
    const maxChars = isUnicode ? 70 : 160;
    const parts = Math.ceil(charCount / maxChars) || 1;

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!phone.trim() || !message.trim()) return;

        setSending(true);
        setError("");
        try {
            await sendSms(phone.trim(), message);
            setSuccess(true);
            setTimeout(() => navigate("/"), 1500);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to send");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Compose</h1>
                    <Link
                        to="/"
                        className="rounded-full bg-gray-100 text-gray-800 px-3 py-1.5 text-sm shadow hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                        ← Inbox
                    </Link>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                {success ? (
                    <div className="rounded-2xl bg-green-50 text-green-800 px-6 py-8 text-center dark:bg-green-900/20 dark:text-green-300">
                        <svg className="mx-auto mb-3" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 6L9 17l-5-5" />
                        </svg>
                        <p className="text-lg font-medium">Message Sent!</p>
                        <p className="text-sm mt-1">Redirecting to inbox...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSend} className="grid gap-4">
                        <div className="rounded-2xl ring-1 ring-gray-200 bg-white dark:bg-gray-900 dark:ring-gray-800 p-5">
                            <div className="mb-4">
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">To</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+98..."
                                    required
                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 text-lg focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Message</label>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Type your message..."
                                    required
                                    rows={6}
                                    className={`w-full rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 text-base focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700 resize-none ${isRTL(message) ? "rtl-text" : ""}`}
                                />
                                <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span>
                                        {charCount} characters
                                        {isUnicode && " (Unicode)"}
                                    </span>
                                    <span>
                                        {parts} SMS part{parts !== 1 ? "s" : ""}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-sm dark:bg-rose-900/20 dark:text-rose-300">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={sending || !phone.trim() || !message.trim()}
                            className="rounded-full bg-gray-900 text-white px-6 py-3 text-base shadow-lg hover:bg-black disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                        >
                            {sending ? "Sending..." : "Send SMS"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
