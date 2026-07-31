// Tema inicial y rol — se ejecuta antes de la hidratación para evitar FOUC
(function () {
  try {
    var theme = localStorage.getItem("apex_theme") || "system";
    var isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.dataset.theme = theme;
    var roleName = localStorage.getItem("role_name") || "";
    document.documentElement.dataset.role = roleName.toLowerCase();
  } catch {
    // localStorage no disponible (entorno restringido)
  }
})();
