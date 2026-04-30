import { useState } from 'react';
import { X, Loader2, Link2, RefreshCw, Copy, Check } from 'lucide-react';
import { inviteUser } from '@services/supabase/users';
import { getTeamMembers } from '@services/supabase/users';
import { linkStaffToUser } from '@services/supabase/staff';
import type { User as SystemUser } from '@pos-types';
import { type Staff } from '@services/supabase/staff';

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function LinkAccountModal({
  staff, businessId, teamMembers, linkedUserIds,
  onClose, onLinked, onTeamRefresh, notifError, notifSuccess,
}: {
  staff:          Staff;
  businessId:     string;
  teamMembers:    SystemUser[];
  linkedUserIds:  string[];   // user_ids already linked to another staff record
  onClose:        () => void;
  onLinked:       (staffId: string, userId: string) => void;
  onTeamRefresh:  () => Promise<void>;
  notifError:     (m: string) => void;
  notifSuccess:   (m: string) => void;
}) {
  const [mode, setMode]       = useState<'new' | 'existing'>('new');
  const [saving, setSaving]   = useState(false);
  const [copied, setCopied]   = useState(false);

  // New account form
  const [email, setEmail]     = useState(staff.email ?? '');
  const [password, setPassword] = useState(generatePassword);

  // Existing account picker
  // Only show team members not yet linked to another staff
  const availableMembers = teamMembers.filter((m) => !linkedUserIds.includes(m.id));
  const [selectedUserId, setSelectedUserId] = useState(availableMembers[0]?.id ?? '');

  async function handleCopyPassword() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (mode === 'new') {
        if (!email.trim()) { notifError('Email requis'); setSaving(false); return; }

        // Create the account
        await inviteUser({
          email:       email.trim(),
          full_name:   staff.name,
          role:        'staff',
          business_id: businessId,
          password,
          existing_user: false,
        });

        // Refresh team to get the new user's ID
        await onTeamRefresh();
        const freshMembers = await getTeamMembers(businessId);
        const newMember = freshMembers.find((m) => m.email.toLowerCase() === email.trim().toLowerCase());

        if (!newMember) {
          notifError('Compte créé mais introuvable — liez-le manuellement via "Compte existant"');
          onClose();
          return;
        }

        await linkStaffToUser(staff.id, newMember.id);
        onLinked(staff.id, newMember.id);

      } else {
        if (!selectedUserId) { notifError('Sélectionnez un compte'); setSaving(false); return; }
        await linkStaffToUser(staff.id, selectedUserId);
        onLinked(staff.id, selectedUserId);
      }
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border bg-surface-card/30">
          <div>
            <h2 className="font-bold text-content-primary text-lg">Compte de connexion</h2>
            <p className="text-xs text-content-secondary mt-0.5">{staff.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-card text-content-muted">
            <X className="w-5 h-5 text-content-secondary" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-surface-input rounded-xl p-1 border border-surface-border">
            <button onClick={() => setMode('new')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                mode === 'new' ? 'bg-brand-600 text-content-primary shadow-lg' : 'text-content-muted hover:text-content-primary'
              }`}>
              Nouveau compte
            </button>
            <button onClick={() => setMode('existing')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                mode === 'existing' ? 'bg-brand-600 text-content-primary shadow-lg' : 'text-content-muted hover:text-content-primary'
              }`}>
              Compte existant
            </button>
          </div>

          {mode === 'new' ? (
            <div className="space-y-4">
              <p className="text-xs text-content-secondary leading-relaxed">
                Un compte Caissier sera créé. L'employé pourra se connecter et accéder à la caisse, aux commandes et aux livraisons.
              </p>
              <div>
                <label className="text-[10px] font-black text-content-muted uppercase tracking-widest block mb-1.5">Adresse e-mail *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input w-full text-sm h-11" placeholder="employe@exemple.com" autoFocus />
              </div>
              <div>
                <label className="text-[10px] font-black text-content-muted uppercase tracking-widest block mb-1.5">Mot de passe temporaire</label>
                <div className="flex gap-2">
                  <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="input flex-1 text-sm font-mono h-11" />
                  <button onClick={() => setPassword(generatePassword())}
                    className="p-2 rounded-xl bg-surface-hover hover:bg-surface-border transition-colors" title="Régénérer">
                    <RefreshCw className="w-4 h-4 text-content-secondary" />
                  </button>
                  <button onClick={handleCopyPassword}
                    className="p-2 rounded-xl bg-surface-hover hover:bg-surface-border transition-colors" title="Copier">
                    {copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4 text-content-secondary" />}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-content-muted italic">Copiez ce mot de passe et transmettez-le à l'employé.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-content-secondary leading-relaxed">
                Liez cet employé à un compte déjà existant dans l'équipe.
              </p>
              {availableMembers.length === 0 ? (
                <div className="text-center py-10 bg-surface-input/30 rounded-2xl border border-dashed border-surface-border text-content-muted text-xs italic">
                  Aucun compte disponible — tous les membres sont déjà liés à un employé.
                </div>
              ) : (
                <div className="space-y-2">
                  {availableMembers.map((m) => (
                    <label key={m.id}
                      className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                        selectedUserId === m.id
                          ? 'border-brand-500 bg-brand-500/5 shadow-inner'
                          : 'border-surface-border hover:border-surface-border hover:bg-surface-hover'
                      }`}>
                      <input type="radio" name="existing_user" value={m.id}
                        checked={selectedUserId === m.id}
                        onChange={() => setSelectedUserId(m.id)}
                        className="accent-brand-500" />
                      <div className="w-10 h-10 rounded-xl bg-surface-input border border-surface-border flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-content-primary">
                          {m.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-content-primary truncate">{m.full_name}</p>
                        <p className="text-[10px] text-content-muted font-medium truncate uppercase tracking-tight">{m.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 shrink-0">
          <button onClick={handleSave}
            disabled={saving || (mode === 'existing' && !selectedUserId)}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm font-black uppercase tracking-widest disabled:opacity-60 shadow-lg shadow-brand-500/20">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> En cours…</>
              : <><Link2 className="w-4 h-4" /> {mode === 'new' ? 'Créer et lier le compte' : 'Lier ce compte'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
