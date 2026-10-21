import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listStations, loadLastStation, saveLastStation, sendHoldsToStation } from "../../storage/watch.js";
import { theme } from "../../styles/theme.js";

/**
 * "Send to watch": pick the station (saw / operator) whose watches get this
 * job. Each station keeps its own list, so operators never overwrite each other.
 */
export function SendToWatchDialog({ holdNames, onClose }) {
    const [stations, setStations] = useState(null);
    const [sending, setSending] = useState(null);
    const last = loadLastStation();

    useEffect(() => {
        listStations()
            .then(setStations)
            .catch(() => {
                toast.error("Could not load the stations. Check the connection.");
                onClose();
            });
    }, [onClose]);

    const send = async (station) => {
        setSending(station.id);
        try {
            const r = await sendHoldsToStation(station.id, holdNames);
            saveLastStation(station.id);
            toast.success(`Sent ${r.count} hold(s) to ${station.name}`);
            onClose();
        } catch {
            toast.error("Could not send to the watch. Check the connection.");
            setSending(null);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-watch-title"
            onClick={onClose}
            style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: "100%", maxWidth: 320, background: theme.colors.cardBg, borderRadius: 8, border: `1px solid ${theme.colors.border}`, padding: 20, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10 }}
            >
                <div id="send-watch-title" style={{ fontSize: 15, fontWeight: 700 }}>Send {holdNames.length} hold(s) to</div>
                {stations === null && <div style={{ fontSize: 13, color: theme.colors.textMuted }}>Loading…</div>}
                {stations?.length === 0 && (
                    <div style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                        No stations yet. An admin adds them in ADMIN → SETTINGS → Stations and watches.
                    </div>
                )}
                {stations?.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        disabled={sending !== null}
                        onClick={() => send(s)}
                        style={{
                            height: 44, borderRadius: 6, cursor: "pointer", fontSize: 14, textAlign: "left", padding: "0 14px",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            border: `1px solid ${s.id === last ? theme.colors.buttonPrimaryBorder : theme.colors.buttonGhostBorder}`,
                            background: theme.colors.buttonGhostBg, color: theme.colors.buttonGhostText,
                            fontWeight: s.id === last ? 700 : 400,
                        }}
                    >
                        <span>{s.name}</span>
                        <span style={{ fontSize: 11, color: theme.colors.textMuted }}>{sending === s.id ? "sending…" : `${s.count} now`}</span>
                    </button>
                ))}
                <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: theme.colors.textMuted, fontSize: 12, cursor: "pointer", padding: 6 }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
