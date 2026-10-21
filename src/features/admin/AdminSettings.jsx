import React, { useState } from "react";
import toast from "react-hot-toast";
import { changePassword, setWorkshopCode } from "../../storage/account.js";
import { theme } from "../../styles/theme.js";

const MIN_PASSWORD = 10;
const MIN_CODE = 6;

const inputStyle = {
    height: 38, padding: "0 10px", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box",
    border: `1px solid ${theme.colors.borderMedium}`, background: theme.colors.inputBg, color: theme.colors.textPrimary,
};

function Section({ title, text, children }) {
    return (
        <section style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 20, borderBottom: `1px solid ${theme.colors.borderLight}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>{title}</div>
            {text && <div style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>{text}</div>}
            {children}
        </section>
    );
}

/** Admin SETTINGS view: own password and the workshop code. */
export function AdminSettings({ styles, children }) {
    const [pw, setPw] = useState({ current: "", next: "", repeat: "" });
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState("");

    const savePassword = async () => {
        if (pw.next.length < MIN_PASSWORD) return toast.error(`New password: at least ${MIN_PASSWORD} characters.`);
        if (pw.next !== pw.repeat) return toast.error("New passwords do not match.");
        setBusy("pw");
        try {
            await changePassword(pw.current, pw.next);
            setPw({ current: "", next: "", repeat: "" });
            toast.success("Password changed");
        } catch (err) {
            toast.error(err.message || "Could not change the password.");
        } finally {
            setBusy("");
        }
    };

    const saveCode = async () => {
        if (code.trim().length < MIN_CODE) return toast.error(`Workshop code: at least ${MIN_CODE} characters.`);
        setBusy("code");
        try {
            await setWorkshopCode(code);
            setCode("");
            toast.success("Workshop code changed. Operators enter the new code on their next visit.");
        } catch (err) {
            toast.error(err.message || "Could not change the workshop code.");
        } finally {
            setBusy("");
        }
    };

    return (
        <div style={{ ...styles.tableBody, display: "flex", flexDirection: "column", gap: 20, maxWidth: 520 }}>
            <div style={{ ...styles.tableTitleCenter, textAlign: "left" }}>SETTINGS</div>

            <Section
                title="WORKSHOP CODE"
                text="Operators open the catalog with this code; a device stays unlocked for 30 days. Setting a new code signs every operator device out at once (use it when someone leaves)."
            >
                <input style={inputStyle} type="password" autoComplete="off" placeholder={`New code, at least ${MIN_CODE} characters`} value={code} onChange={(e) => setCode(e.target.value)} />
                <button type="button" style={styles.btnPrimary} disabled={busy === "code"} onClick={saveCode}>
                    {busy === "code" ? "SAVING…" : "SET WORKSHOP CODE"}
                </button>
            </Section>

            <Section title="YOUR PASSWORD">
                <input style={inputStyle} type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
                <input style={inputStyle} type="password" autoComplete="new-password" placeholder={`New password, at least ${MIN_PASSWORD} characters`} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
                <input style={inputStyle} type="password" autoComplete="new-password" placeholder="Repeat new password" value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} />
                <button type="button" style={styles.btnPrimary} disabled={busy === "pw"} onClick={savePassword}>
                    {busy === "pw" ? "SAVING…" : "CHANGE PASSWORD"}
                </button>
            </Section>

            {children}
        </div>
    );
}
