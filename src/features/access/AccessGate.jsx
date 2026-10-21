import React, { useEffect, useState } from "react";
import { getAccessStatus, runSetup, unlockWorkshop } from "../../storage/account.js";
import { login as apiLogin } from "../../storage/auth.js";
import { theme } from "../../styles/theme.js";

const MIN_PASSWORD = 10;
const MIN_CODE = 8;

function Field({ label, hint, ...props }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: theme.colors.textSecondary }}>
            {label}
            <input
                {...props}
                style={{
                    height: 40, padding: "0 12px", borderRadius: 6, fontSize: 14,
                    border: `1px solid ${theme.colors.borderMedium}`, background: "#fff",
                    color: theme.colors.textPrimary, boxSizing: "border-box", width: "100%",
                }}
            />
            {hint && <span style={{ fontSize: 11, color: theme.colors.textTertiary }}>{hint}</span>}
        </label>
    );
}

const panel = {
    width: "100%", maxWidth: 340, background: theme.colors.cardBg,
    border: `1px solid ${theme.colors.border}`, borderRadius: 8, padding: 24,
    display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box",
};

const primary = {
    height: 42, borderRadius: 6, border: "none", background: theme.colors.buttonPrimaryBg, color: theme.colors.buttonPrimaryText,
    fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer",
};

const linkBtn = {
    background: "none", border: "none", color: theme.colors.textMuted, fontSize: 12,
    cursor: "pointer", textDecoration: "underline", padding: 4, minHeight: 0,
};

/**
 * Shown instead of the catalog when /api/state answers 401:
 * - first run (no admin yet): create the admin and the workshop code;
 * - otherwise: operators enter the workshop code, admins can sign in.
 * `onUnlocked({ username })` reloads the session and the catalog.
 */
export function AccessGate({ onUnlocked }) {
    const [status, setStatus] = useState(null);
    const [mode, setMode] = useState("code"); // code | admin
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [f, setF] = useState({ code: "", username: "", password: "", password2: "", workshopCode: "", setupToken: "" });
    const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

    useEffect(() => {
        getAccessStatus().then(setStatus).catch(() => setStatus({ needsSetup: false, hasWorkshopCode: true }));
    }, []);

    const run = async (fn) => {
        setBusy(true);
        setError("");
        try { await fn(); }
        catch (err) { setError(err.status === 429 ? "Too many attempts. Wait a few minutes." : err.message || "Something went wrong."); }
        finally { setBusy(false); }
    };

    const submitSetup = () => run(async () => {
        if (f.password.length < MIN_PASSWORD) throw new Error(`Password: at least ${MIN_PASSWORD} characters.`);
        if (f.password !== f.password2) throw new Error("Passwords do not match.");
        if (f.workshopCode.trim().length < MIN_CODE) throw new Error(`Workshop code: at least ${MIN_CODE} characters.`);
        const { username } = await runSetup({
            username: f.username.trim(), password: f.password,
            workshopCode: f.workshopCode, setupToken: f.setupToken.trim() || undefined,
        });
        onUnlocked({ username, firstRun: true });
    });

    const submitCode = () => run(async () => {
        await unlockWorkshop(f.code);
        onUnlocked({ username: null });
    });

    const submitAdmin = () => run(async () => {
        try {
            const { username } = await apiLogin(f.username.trim(), f.password);
            onUnlocked({ username });
        } catch (err) {
            throw new Error(err.status === 401 ? "Invalid username or password." : err.status === 429 ? "Too many attempts. Wait a few minutes." : "Sign-in error.");
        }
    });

    const onKey = (submit) => (e) => { if (e.key === "Enter" && !busy) submit(); };

    let body;
    if (!status) {
        body = <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>Loading…</div>;
    } else if (status.needsSetup) {
        body = (
            <div style={panel} onKeyDown={onKey(submitSetup)}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Welcome to Angles</div>
                <div style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                    First start. Create the admin account and the workshop code that operators will use to open the catalog.
                </div>
                {status.setupTokenRequired && (
                    <Field label="Setup token" hint="The SETUP_TOKEN value from the server environment." value={f.setupToken} onChange={set("setupToken")} autoComplete="off" />
                )}
                <Field label="Admin name" value={f.username} onChange={set("username")} autoComplete="username" autoFocus />
                <Field label="Admin password" hint={`At least ${MIN_PASSWORD} characters.`} type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
                <Field label="Repeat password" type="password" value={f.password2} onChange={set("password2")} autoComplete="new-password" />
                <Field label="Workshop code" hint={`At least ${MIN_CODE} characters. Share it with the operators.`} value={f.workshopCode} onChange={set("workshopCode")} autoComplete="off" />
                {error && <div role="alert" style={{ fontSize: 12, color: "#c53030" }}>{error}</div>}
                <button type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submitSetup}>CREATE ADMIN</button>
            </div>
        );
    } else if (mode === "code") {
        body = (
            <div style={panel} onKeyDown={onKey(submitCode)}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Workshop access</div>
                <div style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                    {status.hasWorkshopCode
                        ? "Enter the workshop code to open the angle catalog. This device stays unlocked for 30 days."
                        : "The workshop code is not set yet. An admin has to sign in and set it."}
                </div>
                {status.hasWorkshopCode && (
                    <Field label="Workshop code" type="password" value={f.code} onChange={set("code")} autoComplete="off" autoFocus />
                )}
                {error && <div role="alert" style={{ fontSize: 12, color: "#c53030" }}>{error}</div>}
                {status.hasWorkshopCode && (
                    <button type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submitCode}>OPEN</button>
                )}
                <button type="button" style={linkBtn} onClick={() => { setMode("admin"); setError(""); }}>Admin sign in</button>
            </div>
        );
    } else {
        body = (
            <div style={panel} onKeyDown={onKey(submitAdmin)}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Admin sign in</div>
                <Field label="Username" value={f.username} onChange={set("username")} autoComplete="username" autoFocus />
                <Field label="Password" type="password" value={f.password} onChange={set("password")} autoComplete="current-password" />
                {error && <div role="alert" style={{ fontSize: 12, color: "#c53030" }}>{error}</div>}
                <button type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submitAdmin}>SIGN IN</button>
                <button type="button" style={linkBtn} onClick={() => { setMode("code"); setError(""); }}>Back to workshop code</button>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box", background: theme.colors.background }}>
            {body}
        </div>
    );
}
