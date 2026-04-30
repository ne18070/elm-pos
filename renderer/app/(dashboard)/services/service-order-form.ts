import { SubjectType } from '@services/supabase/service-orders';

export interface OTLine {
  _id: number;
  service_id: string | null;
  name: string;
  price: string;
  quantity: number;
}

let _lid = 0;
export function newLine(override?: Partial<OTLine>): OTLine {
  return { _id: ++_lid, service_id: null, name: '', price: '', quantity: 1, ...override };
}

export interface ServiceOrderFormData {
  subjectType: SubjectType;
  subjectRef: string;
  subjectInfo: string;
  clientName: string;
  clientPhone: string;
  notes: string;
  lines: OTLine[];
  assignedTo: string;
  assignedName?: string;
}

export function validateServiceOrder(data: ServiceOrderFormData) {
  const errors: Partial<Record<keyof ServiceOrderFormData | 'lines', string>> = {};

  if (data.lines.length === 0) {
    errors.lines = 'Au moins une prestation est requise';
  }

  const validLines = data.lines.filter(l => l.name.trim() && parseFloat(l.price) >= 0);
  if (validLines.length === 0) {
    errors.lines = 'Au moins une prestation valide est requise';
  }

  for (const line of data.lines) {
    if (line.name.trim() && (parseFloat(line.price) < 0 || isNaN(parseFloat(line.price)))) {
      errors.lines = 'Le prix doit être un nombre positif';
    }
    if (line.name.trim() && line.quantity < 1) {
      errors.lines = 'La quantité doit être au moins 1';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    validLines,
  };
}

export function normalizePhone(phone: string): string {
  // Basic normalization, can be improved
  return phone.replace(/\s+/g, '');
}
