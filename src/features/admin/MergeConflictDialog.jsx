import React from "react";
import { theme } from "../../styles/theme.js";

/**
 * Someone saved the catalog while you were editing and some of the same
 * records were changed on both sides. Everything else is already merged;
 * this only decides who wins on the listed records.
 */
export function MergeConflictDialog({ conflicts, styles, onKeepMine, onKeepTheirs, onCancel }) {
    const shown = conflicts.slice(0, 8);
    return (
        <div role="dialog" aria-modal="true" aria-labelledby="merge-title"
            style={{ position: "fixed", inset: 0, fontFamily: theme.fonts.sans, color: theme.colors.textPrimary, zIndex: 300, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: theme.colors.cardBg, borderRadius: 10, padding: 24, maxWidth: 360, width: "100%", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
                <div id="merge-title" style={{ fontSize: 15, fontWeight: 700 }}>Changed by someone else too</div>
                <div style={{ fontSize: 13, color: theme.colors.textSecondary, lineHeight: 1.5 }}>
                    Another admin saved the catalog while you were editing. All other changes are combined. These were changed on both sides:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                    {shown.map((c) => <li key={`${c.kind}:${c.id}`}>{c.kind === "hold" ? "Hold " : ""}{c.label}</li>)}
                    {conflicts.length > shown.length && <li>…and {conflicts.length - shown.length} more</li>}
                </ul>
                <button type="button" style={{ ...styles.btnPrimary, height: 44 }} onClick={onKeepMine}>KEEP MY VERSION</button>
                <button type="button" style={{ ...styles.btnGhost, height: 44 }} onClick={onKeepTheirs}>KEEP THEIR VERSION</button>
                <button type="button" style={{ background: "none", border: "none", color: theme.colors.textMuted, fontSize: 12, cursor: "pointer", padding: 6 }} onClick={onCancel}>
                    Cancel (nothing is saved)
                </button>
            </div>
        </div>
    );
}
