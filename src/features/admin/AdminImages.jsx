import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { loadState, saveState } from "../../storage/db.js";
import { countInlineImages, moveImagesToStorage } from "../../utils/storedImages.js";
import { theme } from "../../styles/theme.js";

/**
 * One-time move of the base64 images inside the catalog to private storage.
 * Works on the latest saved catalog and saves with its revision, so it never
 * mixes with an unsaved draft.
 */
export function AdminImages({ styles, hasUnsavedChanges, onCatalogSaved }) {
    const [inline, setInline] = useState(null);
    const [progress, setProgress] = useState(null);

    useEffect(() => {
        loadState().then(({ data }) => setInline(countInlineImages(data))).catch(() => setInline(null));
    }, []);

    const run = async () => {
        if (hasUnsavedChanges) {
            toast.error("Save or discard your catalog changes first.");
            return;
        }
        setProgress("0");
        try {
            const { data, revision } = await loadState();
            const moved = await moveImagesToStorage(data, (n, total) => setProgress(`${n}/${total}`));
            if (moved.moved === 0) {
                toast.success("All images are already in storage.");
            } else {
                const saved = await saveState(moved.data, revision);
                onCatalogSaved?.(saved);
                toast.success(`Moved ${moved.moved} image(s) to storage.`);
            }
            setInline(0);
        } catch (err) {
            toast.error(err.code === "storage_off"
                ? "No Blob store is linked to this deployment (see docs/OPERATIONS.md)."
                : err.status === 409 ? "The catalog changed meanwhile. Try again." : "Could not move the images.");
        } finally {
            setProgress(null);
        }
    };

    return (
        <section style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 20, borderBottom: `1px solid ${theme.colors.borderLight}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>IMAGES</div>
            <div style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                New covers and drawings go to private storage automatically. Older ones still live inside the catalog
                {inline != null ? ` (${inline} now)` : ""}; moving them makes the catalog small and fast to load. EXPORT still saves a full backup with all images.
            </div>
            <button type="button" style={styles.btnPrimary} disabled={progress !== null || inline === 0} onClick={run}>
                {progress !== null ? `MOVING… ${progress}` : "MOVE IMAGES TO STORAGE"}
            </button>
        </section>
    );
}
