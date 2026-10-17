export const THEME_KEY = "tema";

/**
 * Roda no <head> antes da página aparecer, para o tema escuro não "piscar"
 * branco ao carregar. Mantenha em sincronia com applyTheme() em components/theme.tsx.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
