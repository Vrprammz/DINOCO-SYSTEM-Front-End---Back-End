/**
 * Shared LIFF error-state renderer (Dead-Workflow Spec V.1.0 Sprint B common helper).
 *
 * Replaces ad-hoc error toasts that leave LIFF surfaces stuck with no next action.
 * Every error state must offer customer at least ONE concrete next step:
 *   - retry (re-call the failing operation)
 *   - back (navigate to a known-good page)
 *   - manual (alternative path like "พิมพ์เอง")
 *
 * Renders into a passed mount element. Pure DOM — no React/framework dep.
 * Returns a teardown function for caller to unmount.
 *
 * Usage:
 *   import { renderErrorState } from "../../shared/error-state.js";
 *
 *   renderErrorState(mountEl, {
 *     title: "เกิดข้อผิดพลาด",
 *     message: "ส่งคำสั่งซื้อไม่สำเร็จ",
 *     reason: "Network timeout",   // optional — surfaced inline for diagnostics
 *     code: "409_CONFLICT",        // optional — error code (visible to dev, helpful for support)
 *     actions: [
 *       { label: "🔄 ลองอีกครั้ง", primary: true, onClick: () => retry() },
 *       { label: "← กลับ", onClick: () => navigateBack() },
 *     ],
 *   });
 *
 * Design tokens reused from liff-src/b2b/catalog/tokens.css:
 *   --color-danger, --color-text, --space-md, --radius-md
 *   (falls back to inline hex if tokens.css not loaded)
 */

/**
 * @typedef {Object} ErrorStateAction
 * @property {string} label
 * @property {() => (void | Promise<void>)} onClick
 * @property {boolean} [primary]  // visually emphasized (filled vs outline)
 * @property {boolean} [danger]   // red styling (e.g. "ยกเลิก" / "ลบ")
 */

/**
 * @param {HTMLElement} mountEl container to render into (innerHTML will be replaced)
 * @param {Object} opts
 * @param {string} [opts.title] heading shown above message (default "เกิดข้อผิดพลาด")
 * @param {string} [opts.message] primary error message (Thai customer-facing)
 * @param {string} [opts.reason] secondary diagnostic line (truncated 200 chars)
 * @param {string} [opts.code] error code string for support reference
 * @param {string} [opts.icon] emoji icon (default "⚠️")
 * @param {Array<ErrorStateAction>} [opts.actions] buttons (at least 1 recommended)
 * @returns {() => void} teardown function (clears mountEl)
 */
export function renderErrorState(mountEl, opts = {}) {
    if (!mountEl || typeof mountEl !== "object") {
        console.warn("[ErrorState] mountEl missing — cannot render");
        return () => {};
    }

    const {
        title = "เกิดข้อผิดพลาด",
        message = "ระบบไม่สามารถดำเนินการตามคำขอได้ในขณะนี้",
        reason = "",
        code = "",
        icon = "⚠️",
        actions = [],
    } = opts;

    // Defensive: cap reason length to 200 chars (avoid overflowing UI on
    // verbose server errors)
    const truncatedReason =
        typeof reason === "string" && reason.length > 200
            ? reason.slice(0, 200) + "…"
            : reason || "";

    // Clear container + render
    mountEl.innerHTML = "";
    const root = document.createElement("div");
    root.className = "dnc-error-state";
    root.setAttribute("role", "alert");
    root.setAttribute("aria-live", "assertive");
    root.style.cssText = [
        "padding:24px 20px",
        "margin:16px auto",
        "max-width:480px",
        "background:#fef2f2",
        "border:1px solid #fecaca",
        "border-radius:12px",
        "text-align:center",
        "font-family:'Sarabun',sans-serif",
        "color:#1f2937",
    ].join(";");

    // Icon
    const iconEl = document.createElement("div");
    iconEl.textContent = icon;
    iconEl.style.cssText = "font-size:40px;margin-bottom:12px;line-height:1";
    iconEl.setAttribute("aria-hidden", "true");
    root.appendChild(iconEl);

    // Title
    const titleEl = document.createElement("h3");
    titleEl.textContent = title;
    titleEl.style.cssText =
        "margin:0 0 8px;font-size:18px;font-weight:700;color:#991b1b";
    root.appendChild(titleEl);

    // Message
    const msgEl = document.createElement("p");
    msgEl.textContent = message;
    msgEl.style.cssText = "margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151";
    root.appendChild(msgEl);

    // Reason (optional, smaller + muted)
    if (truncatedReason) {
        const reasonEl = document.createElement("p");
        reasonEl.textContent = truncatedReason;
        reasonEl.style.cssText =
            "margin:0 0 16px;font-size:12px;line-height:1.5;color:#6b7280;background:#fff;padding:8px 12px;border-radius:6px;border:1px solid #e5e7eb;text-align:left;word-break:break-word";
        root.appendChild(reasonEl);
    }

    // Error code (very small, monospace for support)
    if (code) {
        const codeEl = document.createElement("div");
        codeEl.textContent = `รหัส: ${code}`;
        codeEl.style.cssText =
            "margin:0 0 16px;font-size:11px;color:#9ca3af;font-family:monospace;letter-spacing:0.5px";
        root.appendChild(codeEl);
    }

    // Action buttons
    if (actions.length > 0) {
        const actionsRow = document.createElement("div");
        actionsRow.style.cssText =
            "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px";

        actions.forEach((action) => {
            if (!action || typeof action.label !== "string") return;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = action.label;
            btn.setAttribute("data-action", action.label);
            const isPrimary = !!action.primary;
            const isDanger = !!action.danger;
            const bg = isDanger ? "#dc2626" : isPrimary ? "#1A3A5C" : "#fff";
            const color = isDanger || isPrimary ? "#fff" : "#1A3A5C";
            const border = isDanger || isPrimary ? "transparent" : "#1A3A5C";
            btn.style.cssText = [
                "min-height:44px",
                "padding:10px 20px",
                `background:${bg}`,
                `color:${color}`,
                `border:1px solid ${border}`,
                "border-radius:8px",
                "font-size:14px",
                "font-weight:600",
                "cursor:pointer",
                "font-family:inherit",
            ].join(";");
            btn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                if (typeof action.onClick === "function") {
                    try {
                        // Disable button during async action to prevent double-fire
                        btn.disabled = true;
                        await action.onClick();
                    } catch (err) {
                        console.error("[ErrorState] action error:", err);
                    } finally {
                        btn.disabled = false;
                    }
                }
            });
            actionsRow.appendChild(btn);
        });

        root.appendChild(actionsRow);
    }

    mountEl.appendChild(root);

    // Teardown
    return () => {
        if (mountEl && root.parentNode === mountEl) {
            mountEl.removeChild(root);
        }
    };
}

/**
 * Convenience builder for common 3-action pattern (retry + back + manual fallback).
 * Just sugar over renderErrorState — most LIFF surfaces use this combo.
 *
 * @param {HTMLElement} mountEl
 * @param {Object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.message]
 * @param {string} [opts.reason]
 * @param {string} [opts.code]
 * @param {() => void | Promise<void>} [opts.onRetry] primary "ลองอีกครั้ง"
 * @param {() => void | Promise<void>} [opts.onBack]  outline "← กลับ"
 * @param {{ label: string, onClick: () => void | Promise<void> }} [opts.manual] optional 3rd manual fallback
 */
export function renderRetryableError(mountEl, opts = {}) {
    const actions = [];
    if (typeof opts.onRetry === "function") {
        actions.push({
            label: "🔄 ลองอีกครั้ง",
            primary: true,
            onClick: opts.onRetry,
        });
    }
    if (typeof opts.onBack === "function") {
        actions.push({ label: "← กลับ", onClick: opts.onBack });
    }
    if (opts.manual && typeof opts.manual.onClick === "function") {
        actions.push({ label: opts.manual.label, onClick: opts.manual.onClick });
    }
    return renderErrorState(mountEl, {
        title: opts.title,
        message: opts.message,
        reason: opts.reason,
        code: opts.code,
        actions,
    });
}

export default renderErrorState;
