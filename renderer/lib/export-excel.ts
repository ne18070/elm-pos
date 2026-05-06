import * as XLSX from 'xlsx';

/**
 * Exporte des données vers un fichier Excel (.xlsx)
 * @param sheets Un objet où la clé est le nom de la feuille et la valeur est un tableau d'objets (données)
 * @param fileName Le nom du fichier (sans extension)
 */
export function exportToExcel(sheets: Record<string, any[]>, fileName: string) {
  const wb = XLSX.utils.book_new();

  Object.entries(sheets).forEach(([sheetName, data]) => {
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // Limite de 31 caractères pour les noms de feuilles
  });

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
