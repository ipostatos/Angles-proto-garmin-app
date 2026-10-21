import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { approveWatch, createStation, deleteStation, listStations, moveWatch } from "../../storage/watch.js";
import { theme } from "../../styles/theme.js";

const inputStyle = {
    height: 38, padding: "0 10px", borderRadius: 6, fontSize: 14, boxSizing: "border-box", minWidth: 0,
    border: `1px solid ${theme.colors.borderMedium}`, background: theme.colors.inputBg, color: theme.colors.textPrimary,
};

function ago(seconds) {
    if (!seconds) return "never synced";
    const min = Math.round((Date.now() / 1000 - seconds) / 60);
    if (min < 2) return "synced just now";
    if (min < 120) return `synced ${min} min ago`;
    const h = Math.round(min / 60);
    return h < 48 ? `synced ${h} h ago` : `synced ${Math.round(h / 24)} days ago`;
}

/**
 * Stations (one per saw or operator) and the watches paired to each.
 * Pairing: the watch shows a 6-digit code (Holds → PAIR WATCH); enter it here.
 */
export function AdminStations({ styles }) {
    const [stations, setStations] = useState(null);
    const [name, setName] = useState("");
    const [pair, setPair] = useState({ code: "", station: "", label: "" });

    const refresh = useCallback(() => {
        listStations().then(setStations).catch(() => toast.error("Could not load the stations."));
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    const act = async (fn, ok) => {
        try {
            await fn();
            if (ok) toast.success(ok);
            refresh();
        } catch (err) {
            toast.error(err.status === 429 ? "Too many wrong codes. Wait a few minutes." : err.message || "Something went wrong.");
        }
    };

    const addStation = () => {
        if (!name.trim()) return;
        act(async () => { await createStation(name.trim()); setName(""); }, "Station added");
    };

    const approve = () => {
        const station = Number(pair.station) || stations?.[0]?.id;
        if (!/^\d{6}$/.test(pair.code.replace(/\s/g, "")) || !station) {
            toast.error("Enter the 6-digit code from the watch and pick a station.");
            return;
        }
        act(async () => { await approveWatch(pair.code, station, pair.label.trim()); setPair({ code: "", station: "", label: "" }); }, "Watch paired");
    };

    return (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>STATIONS AND WATCHES</div>
            <div style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                One station per saw or operator. "Send to watch" goes to one station, so jobs of different operators never overwrite each other. Cut marks stay on each watch.
            </div>

            {stations === null && <div style={{ fontSize: 13, color: theme.colors.textMuted }}>Loading…</div>}
            {stations?.map((s) => (
                <div key={s.id} style={{ border: `1px solid ${theme.colors.border}`, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <b style={{ fontSize: 14 }}>{s.name}</b>
                        <button
                            type="button"
                            style={styles.btnGhost}
                            onClick={() => {
                                if (window.confirm(`Delete station "${s.name}"? Its watches will need pairing again.`)) {
                                    act(() => deleteStation(s.id), "Station deleted");
                                }
                            }}
                        >
                            Delete
                        </button>
                    </div>
                    <div style={{ fontSize: 12, color: theme.colors.textMuted }}>{s.count} hold(s) in the current job</div>
                    {(s.watches ?? []).length === 0 && <div style={{ fontSize: 12, color: theme.colors.textTertiary }}>No watches paired.</div>}
                    {(s.watches ?? []).map((w) => (
                        <div key={w.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                            <span style={{ flex: 1, minWidth: 120 }}>⌚ {w.label || w.id.slice(0, 6)} · {ago(w.lastSeen)}</span>
                            <select
                                aria-label="Move watch to station"
                                value={s.id}
                                onChange={(e) => act(() => moveWatch(w.id, Number(e.target.value)), "Watch moved")}
                                style={{ ...inputStyle, height: 32, fontSize: 12 }}
                            >
                                {stations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                            <button type="button" style={styles.btnGhost} onClick={() => act(() => moveWatch(w.id, null), "Watch unpaired")}>Unpair</button>
                        </div>
                    ))}
                </div>
            ))}

            <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="New station, e.g. Saw 2 or Tomek" value={name} maxLength={40}
                    onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStation()} />
                <button type="button" style={styles.btnPrimary} onClick={addStation}>ADD</button>
            </div>

            {stations?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: `1px solid ${theme.colors.borderLight}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Pair a watch</div>
                    <div style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                        On the watch open Angles → PAIR WATCH. Enter the 6-digit code it shows (valid 15 minutes).
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input style={{ ...inputStyle, width: 110, letterSpacing: "0.2em" }} inputMode="numeric" placeholder="123456" maxLength={7}
                            value={pair.code} onChange={(e) => setPair({ ...pair, code: e.target.value })} aria-label="Code from the watch" />
                        <select style={{ ...inputStyle, flex: 1 }} value={pair.station || stations[0].id}
                            onChange={(e) => setPair({ ...pair, station: e.target.value })} aria-label="Station">
                            {stations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input style={{ ...inputStyle, flex: 1 }} placeholder="Name of the watch (optional)" maxLength={40}
                            value={pair.label} onChange={(e) => setPair({ ...pair, label: e.target.value })} />
                        <button type="button" style={styles.btnPrimary} onClick={approve}>PAIR</button>
                    </div>
                </div>
            )}
        </section>
    );
}
