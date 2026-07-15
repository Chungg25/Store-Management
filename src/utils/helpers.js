import * as XLSX from 'xlsx-js-style';

export const getGroupColor = (groupName) => {
  const colors = {
    'Khớp, Háng': '#3b82f6',
    'Gối': '#10b981',
    'Chấn thương': '#f59e0b',
    'Cột sống': '#ef4444',
    'Y Cụ': '#8b5cf6',
    'Khác': '#6b7280'
  };
  return colors[groupName] || colors['Khác'];
};

export const applyExcelStyle = (worksheet, data) => {
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  const cols = [];
  
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let max_width = 10;
    
    // Determine column type from header
    const header_cell = worksheet[XLSX.utils.encode_cell({c: C, r: 0})];
    const header_val = header_cell ? (header_cell.v || '').toString().toLowerCase() : '';
    const isImportCol = header_val.includes('nhập');
    const isExportCol = header_val.includes('xuất');
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell_address = {c: C, r: R};
      const cell_ref = XLSX.utils.encode_cell(cell_address);
      const cell = worksheet[cell_ref];
      
      if (!cell) continue;

      if (R === 0) {
        cell.s = {
          fill: { fgColor: { rgb: '4F46E5' } },
          font: { color: { rgb: 'FFFFFF' }, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        };
      } else {
        let fgColor = null;
        let fontColor = '000000';
        
        if (isImportCol) {
          fgColor = 'D1FAE5'; // bg-green-100
          fontColor = '065F46'; // text-green-900
        } else if (isExportCol) {
          fgColor = 'FEE2E2'; // bg-red-100
          fontColor = '991B1B'; // text-red-900
        }
        
        cell.s = {
          border: {
            top: { style: 'thin', color: { rgb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
            left: { style: 'thin', color: { rgb: 'E5E7EB' } },
            right: { style: 'thin', color: { rgb: 'E5E7EB' } }
          },
          alignment: { vertical: 'center' }
        };
        
        if (fgColor) {
           cell.s.fill = { fgColor: { rgb: fgColor } };
           cell.s.font = { color: { rgb: fontColor }, bold: true };
        }
      }

      if (cell.v) {
        const len = cell.v.toString().length;
        if (len > max_width) max_width = len;
      }
    }
    cols[C] = { wch: max_width + 2 };
  }
  worksheet['!cols'] = cols;
};
