/*
  Pemeliharaan fitur Live dari `GET /v1/catalog` → `settings` (padanan `activeMaintenance` web dan
  `LiveMaintenanceGate` Android). GET siaran tidak diblokir pemeliharaan, jadi studio memeriksanya sendiri.
*/
export function liveMaintenance(settings) {
  if (!settings || typeof settings !== "object") return false;
  if (settings.maintenanceMode === true) return true;
  return settings.featureMaintenance?.live?.enabled === true;
}
