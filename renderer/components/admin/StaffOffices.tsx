'use client';

import { useState, useMemo } from 'react';
import { 
  Building2, Users, GripVertical, Plus, X, 
  Map as MapIcon, Laptop, Coffee, Briefcase, 
  User, LayoutGrid, Trash2, ArrowRightLeft,
  Globe, MapPin, Layers, Home, Flag
} from 'lucide-react';
import type { Staff, StaffForm } from '@services/supabase/staff';
import { cn } from '@/lib/utils';

interface StaffOfficesProps {
  staffList: Staff[];
  onUpdateStaff: (id: string, form: Partial<StaffForm>) => Promise<void>;
}

// Helper to pick an icon based on space name
function getSpaceIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('étage') || n.includes('floor') || n.includes('niveau')) return Layers;
  if (n.includes('pays') || n.includes('country') || n.includes('monde') || n.includes('global')) return Globe;
  if (n.includes('région') || n.includes('zone') || n.includes('secteur')) return MapPin;
  if (n.includes('agence') || n.includes('site') || n.includes('bureau')) return Building2;
  if (n.includes('maison') || n.includes('home') || n.includes('télétravail')) return Home;
  if (n.includes('france') || n.includes('senegal') || n.includes('maroc') || n.includes('usa')) return Flag;
  return Briefcase;
}

export function StaffOffices({ staffList, onUpdateStaff }: StaffOfficesProps) {
  const [draggedStaffId, setDraggedStaffId] = useState<string | null>(null);
  const [extraOffices, setExtraOffices] = useState<string[]>([]);
  const [newOfficeName, setNewOfficeName] = useState('');
  const [isAddingOffice, setIsAddingOffice] = useState(false);

  // Derive offices from staff departments + extra offices
  const offices = useMemo(() => {
    const fromStaff = Array.from(new Set(staffList.map(s => s.department).filter(Boolean))) as string[];
    return Array.from(new Set([...fromStaff, ...extraOffices])).sort();
  }, [staffList, extraOffices]);

  const staffByOffice = useMemo(() => {
    const map: Record<string, Staff[]> = {};
    offices.forEach(o => map[o] = []);
    map['unassigned'] = [];
    
    staffList.forEach(s => {
      if (s.department && offices.includes(s.department)) {
        map[s.department].push(s);
      } else {
        map['unassigned'].push(s);
      }
    });
    return map;
  }, [staffList, offices]);

  async function handleDrop(e: React.DragEvent, officeName: string | null) {
    e.preventDefault();
    if (!draggedStaffId) return;

    const staff = staffList.find(s => s.id === draggedStaffId);
    if (!staff) return;

    const newDept = officeName === 'unassigned' ? null : officeName;
    if (staff.department === newDept) return;

    try {
      await onUpdateStaff(draggedStaffId, { department: newDept });
    } catch (err) {
      console.error('Failed to move staff:', err);
    } finally {
      setDraggedStaffId(null);
    }
  }

  function handleDragStart(staffId: string) {
    setDraggedStaffId(staffId);
  }

  function addOffice() {
    if (!newOfficeName.trim()) return;
    if (!offices.includes(newOfficeName.trim())) {
      setExtraOffices(prev => [...prev, newOfficeName.trim()]);
    }
    setNewOfficeName('');
    setIsAddingOffice(false);
  }

  function removeEmptyOffice(name: string) {
    setExtraOffices(prev => prev.filter(o => o !== name));
  }

  return (
    <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-brand-400" />
            Espaces & Localisations
          </h2>
          <p className="text-sm text-slate-500 mt-1">Organisez votre équipe par pays, régions ou bureaux</p>
        </div>

        <div className="flex items-center gap-3">
          {isAddingOffice ? (
            <div className="flex items-center gap-2 bg-surface-card border border-surface-border p-1 rounded-lg shadow-xl ring-1 ring-white/5">
              <input
                autoFocus
                value={newOfficeName}
                onChange={(e) => setNewOfficeName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addOffice()}
                placeholder="Nom (ex: France, Étage 1...)"
                className="bg-transparent border-none focus:ring-0 text-sm px-2 w-48 text-white"
              />
              <button onClick={addOffice} className="p-1.5 hover:bg-brand-500/10 text-brand-400 rounded-md transition-colors">
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={() => setIsAddingOffice(false)} className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingOffice(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-card border border-surface-border hover:border-brand-500/50 text-slate-300 hover:text-brand-400 rounded-xl transition-all text-sm font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Ajouter un espace
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {/* Unassigned Zone */}
        <OfficeZone
          name="Sans affectation"
          id="unassigned"
          staff={staffByOffice['unassigned']}
          onDrop={(e) => handleDrop(e, 'unassigned')}
          onDragStart={handleDragStart}
          isUnassigned
        />

        {/* Real Spaces */}
        {offices.map((office) => (
          <OfficeZone
            key={office}
            name={office}
            id={office}
            staff={staffByOffice[office]}
            onDrop={(e) => handleDrop(e, office)}
            onDragStart={handleDragStart}
            onRemove={staffByOffice[office].length === 0 ? () => removeEmptyOffice(office) : undefined}
          />
        ))}
      </div>

      {offices.length === 0 && staffByOffice['unassigned'].length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 opacity-50">
          <MapIcon className="w-16 h-16 mb-4" />
          <p>Aucun membre du personnel à organiser</p>
        </div>
      )}
    </div>
  );
}

interface OfficeZoneProps {
  name: string;
  id: string;
  staff: Staff[];
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (id: string) => void;
  isUnassigned?: boolean;
  onRemove?: () => void;
}

function OfficeZone({ name, id, staff, onDrop, onDragStart, isUnassigned, onRemove }: OfficeZoneProps) {
  const [isOver, setIsOver] = useState(false);

  const Icon = isUnassigned ? User : getSpaceIcon(name);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => { setIsOver(false); onDrop(e); }}
      className={cn(
        "flex flex-col min-h-[280px] rounded-2xl border-2 transition-all duration-300 relative group",
        isOver 
          ? "border-brand-500 bg-brand-900/10 ring-4 ring-brand-500/20 scale-[1.02]" 
          : isUnassigned
            ? "border-slate-800/50 bg-slate-900/20 border-dashed"
            : "border-surface-border bg-surface-card/50 hover:border-slate-700 hover:bg-surface-card"
      )}
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-surface-border/50">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            isUnassigned ? "bg-slate-800 text-slate-500" : "bg-brand-900/20 text-brand-400"
          )}>
            <Icon className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-white text-sm truncate max-w-[150px]">{name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-input text-slate-400">
            {staff.length}
          </span>
          {onRemove && (
            <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Staff List */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[400px] no-scrollbar">
        {staff.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-10 text-slate-600 text-[11px] font-medium italic">
            <ArrowRightLeft className="w-8 h-8 mb-2 opacity-20" />
            Déposez ici
          </div>
        ) : (
          staff.map((s) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => onDragStart(s.id)}
              className="flex items-center gap-3 p-2.5 bg-surface-card border border-surface-border rounded-xl cursor-grab active:cursor-grabbing hover:border-brand-500/30 hover:shadow-lg transition-all group/item"
            >
              <GripVertical className="w-3.5 h-3.5 text-slate-500 group-hover/item:text-brand-500 transition-colors" />
              <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center shrink-0 border border-surface-border">
                <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400">
                  {s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate leading-tight">{s.name}</p>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter truncate">{s.position || 'Employé'}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Visual background indicator when dragging over */}
      {isOver && (
        <div className="absolute inset-0 border-2 border-brand-500 rounded-2xl pointer-events-none animate-pulse" />
      )}
    </div>
  );
}
