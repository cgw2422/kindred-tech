/** Visitor display preferences, saved in this browser only (localStorage). */
export const TEXT_SIZE_KEY = "kts-text-size";
export const CONTRAST_KEY = "kts-contrast";
export const TEXT_SIZE_MIN = -1;
export const TEXT_SIZE_MAX = 3;
export const TEXT_SIZE_LABELS: Record<string, string> = { "-1": "Smaller", "0": "Standard", "1": "Large", "2": "Larger", "3": "Largest" };

/**
 * Runs in <head> before the page paints so there is no flash of the wrong size
 * or colors. High contrast follows the operating system's "increase contrast"
 * setting until the visitor chooses otherwise.
 */
export const PREFERENCES_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var s=localStorage.getItem("${TEXT_SIZE_KEY}");if(s&&/^-?[0-3]$/.test(s)&&s!=="0")d.setAttribute("data-text-size",s);var c=localStorage.getItem("${CONTRAST_KEY}");if(c==="high"||(!c&&window.matchMedia&&window.matchMedia("(prefers-contrast: more)").matches))d.setAttribute("data-contrast","high");}catch(e){}})();`;
