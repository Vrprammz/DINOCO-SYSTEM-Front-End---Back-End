/**
 * ES module bridge for `window.dinocoModal` global defined in
 * [Admin System] DINOCO Modal Helpers snippet.
 *
 * Usage:
 *   import { modal } from "../../shared/modal.js";
 *
 *   modal?.confirm({
 *     title: "ยืนยันลบ?",
 *     message: "การลบไม่สามารถกู้คืนได้",
 *     onConfirm: () => doDelete(),
 *   });
 *
 * Falls back to native `confirm()` if modal global unavailable (e.g. dev
 * server without WP context).
 */

export const modal =
    typeof window !== "undefined" && window.dinocoModal
        ? window.dinocoModal
        : {
              alert: ({ title = "Alert", message = "" } = {}) => {
                  window.alert(`${title}\n\n${message}`);
              },
              confirm: ({
                  title = "Confirm",
                  message = "",
                  onConfirm,
                  onCancel,
              } = {}) => {
                  const ok = window.confirm(`${title}\n\n${message}`);
                  if (ok && typeof onConfirm === "function") onConfirm();
                  if (!ok && typeof onCancel === "function") onCancel();
              },
              toast: ({ message = "", type = "info" } = {}) => {
                  // eslint-disable-next-line no-console
                  console.log(`[toast:${type}]`, message);
              },
          };

export default modal;
