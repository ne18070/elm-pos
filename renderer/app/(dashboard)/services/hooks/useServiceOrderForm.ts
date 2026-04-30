import { useState, useRef, useMemo } from 'react';
import { SubjectType, ServiceSubject, searchSubjects } from '@services/supabase/service-orders';
import { searchClients, type Client } from '@services/supabase/clients';
import { ServiceOrderFormData, OTLine, newLine, validateServiceOrder } from '../service-order-form';

export function useServiceOrderForm(initialData?: Partial<ServiceOrderFormData>, businessId?: string) {
  const [formData, setFormData] = useState<ServiceOrderFormData>({
    subjectType: initialData?.subjectType ?? 'vehicule',
    subjectRef: initialData?.subjectRef ?? '',
    subjectInfo: initialData?.subjectInfo ?? '',
    clientName: initialData?.clientName ?? '',
    clientPhone: initialData?.clientPhone ?? '',
    notes: initialData?.notes ?? '',
    lines: initialData?.lines ?? [newLine()],
    assignedTo: initialData?.assignedTo ?? '',
    assignedName: initialData?.assignedName ?? '',
  });

  const [suggestions, setSuggestions] = useState<ServiceSubject[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [clientSugg, setClientSugg] = useState<Client[]>([]);
  const [showClientSugg, setShowClientSugg] = useState(false);

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debClient = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = useMemo(() => 
    formData.lines.reduce((s, l) => s + (parseFloat(l.price) || 0) * l.quantity, 0)
  , [formData.lines]);

  const updateField = <K extends keyof ServiceOrderFormData>(field: K, value: ServiceOrderFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRefChange = async (val: string) => {
    updateField('subjectRef', val);
    if (!businessId) return;
    if (debRef.current) clearTimeout(debRef.current);
    if (val.length < 2) { setSuggestions([]); setShowSugg(false); return; }
    debRef.current = setTimeout(async () => {
      const res = await searchSubjects(businessId, val);
      setSuggestions(res);
      setShowSugg(res.length > 0);
    }, 300);
  };

  const pickSubject = (s: ServiceSubject) => {
    setFormData(prev => ({
      ...prev,
      subjectRef: s.reference,
      subjectInfo: s.designation ?? '',
      subjectType: s.type_sujet as SubjectType,
    }));
    setShowSugg(false);
  };

  const handleClientSearch = async (val: string, field: 'clientName' | 'clientPhone') => {
    updateField(field, val);
    if (!businessId) return;
    if (debClient.current) clearTimeout(debClient.current);
    if (val.length < 2) { setClientSugg([]); setShowClientSugg(false); return; }
    debClient.current = setTimeout(async () => {
      const res = await searchClients(businessId, val);
      setClientSugg(res);
      setShowClientSugg(res.length > 0);
    }, 250);
  };

  const pickClient = (c: Client) => {
    setFormData(prev => ({
      ...prev,
      clientName: c.name,
      clientPhone: c.phone ?? '',
    }));
    setClientSugg([]);
    setShowClientSugg(false);
  };

  const updateLine = (id: number, field: keyof OTLine, val: string | number) => {
    setFormData(prev => ({
      ...prev,
      lines: prev.lines.map(l => l._id === id ? { ...l, [field]: val } : l)
    }));
  };

  const removeLine = (id: number) => {
    setFormData(prev => ({
      ...prev,
      lines: prev.lines.length === 1 ? [newLine()] : prev.lines.filter(l => l._id !== id)
    }));
  };

  const addLine = (line?: Partial<OTLine>) => {
    setFormData(prev => ({
      ...prev,
      lines: [...prev.lines, newLine(line)]
    }));
  };

  const addFromCatalog = (item: { id: string; name: string; price: number }) => {
    setFormData(prev => {
      const empty = prev.lines.find(l => !l.name && !l.price);
      if (empty) {
        return {
          ...prev,
          lines: prev.lines.map(l => l._id === empty._id ? { ...l, service_id: item.id, name: item.name, price: String(item.price) } : l)
        };
      }
      return {
        ...prev,
        lines: [...prev.lines, newLine({ service_id: item.id, name: item.name, price: String(item.price) })]
      };
    });
  };

  const validate = () => validateServiceOrder(formData);

  return {
    formData,
    setFormData,
    updateField,
    handleRefChange,
    pickSubject,
    suggestions,
    showSugg,
    setShowSugg,
    handleClientSearch,
    pickClient,
    clientSugg,
    showClientSugg,
    setShowClientSugg,
    updateLine,
    removeLine,
    addLine,
    addFromCatalog,
    total,
    validate,
  };
}
