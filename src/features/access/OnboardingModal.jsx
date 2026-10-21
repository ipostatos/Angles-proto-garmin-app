import React from "react";
import { theme } from "../../styles/theme.js";

const STEPS = [
    ["Add a hold", "Type its name in the NEW field at the bottom of the admin list and press +."],
    ["Add the angles", "Pick the hold, then add its MAIN angles (panel flat, up to 45°) and STEFAN angles (panel upright, edges above 45°)."],
    ["Add drawings", "Upload a cover picture for the hold and, if you have them, a cutting drawing for each angle."],
    ["Save", "Press SAVE. Nothing reaches the shared catalog before that."],
    ["Open it for the workshop", "Give operators the workshop code (SETTINGS). Watches are paired there too."],
];

/** Shown to an admin whose catalog is empty: what to add first and in which order. */
export function OnboardingModal({ onClose }) {
    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.32)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%", maxWidth: 420, background: theme.colors.cardBg, borderRadius: 8,
                    border: `1px solid ${theme.colors.border}`, padding: 24, boxSizing: "border-box",
                    display: "flex", flexDirection: "column", gap: 14, maxHeight: "90vh", overflowY: "auto",
                }}
            >
                <div id="onboarding-title" style={{ fontSize: 16, fontWeight: 700 }}>Your catalog is empty</div>
                <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                    {STEPS.map(([title, text]) => (
                        <li key={title} style={{ fontSize: 13, lineHeight: 1.45, color: theme.colors.textSecondary }}>
                            <b style={{ color: theme.colors.textPrimary }}>{title}.</b> {text}
                        </li>
                    ))}
                </ol>
                <div style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                    Moving from another Angles install? Use IMPORT with a JSON backup, then SAVE.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => { window.location.hash = "#/admin"; onClose(); }}
                        style={{
                            flex: 1, height: 42, borderRadius: 6, border: "none", cursor: "pointer",
                            background: theme.colors.buttonPrimaryBg, color: theme.colors.buttonPrimaryText,
                            fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
                        }}
                    >
                        ADD ANGLES
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            height: 42, padding: "0 16px", borderRadius: 6, cursor: "pointer",
                            border: `1px solid ${theme.colors.buttonGhostBorder}`, background: theme.colors.buttonGhostBg,
                            color: theme.colors.buttonGhostText, fontSize: 13,
                        }}
                    >
                        Later
                    </button>
                </div>
            </div>
        </div>
    );
}
