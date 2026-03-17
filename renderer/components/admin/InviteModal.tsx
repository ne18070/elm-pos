'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/store/notifications';
import { inviteUser } from '@services/supabase/users';

interface InviteModalProps {
  businessId: string;
  onClose: () => void;
  onInvited: () => void;
}

const ROLES = [
  { value: 'staff', label: 'Caissier', desc: "Accès à la caisse uniquement" },
  { value: 'admin', label: 'Administrateur', desc: "Accès complet sauf gestion propriétaire" },
];

export function InviteModal({ businessId, onClose, onInvited }: InviteModalProps) {
  const { success, error: notifError } = useNotificationStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', role: 'staff' });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleInvite() {
    if (!form.email.trim()) return;
    setLoading(true);
    try {
      await inviteUser({
        email:       form.email.trim(),
        full_name:   form.full_name.trim() || form.email.split('@')[0],
        role:        form.role as 'admin' | 'staff',
        business_id: businessId,
      });
      success(`Invitation envoyée à ${form.email}`);
      onInvited();
    } catch (err) {
      notifError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Inviter un membre"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary px-5">Annuler</button>
          <button
            onClick={handleInvite}
            disabled={loading || !form.email.trim()}
            className="btn-primary px-5 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Envoyer l'invitation
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Adresse e-mail *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className="input"
            placeholder="prenom@exemple.com"
            autoFocus
          />
        </div>

        <div>
          <label className="label">Nom complet</label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => update('full_name', e.target.value)}
            className="input"
            placeholder="Prénom Nom"
          />
        </div>

        <div>
          <label className="label">Rôle</label>
          <div className="space-y-2 mt-1">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                  ${form.role === r.value
                    ? 'border-brand-500 bg-brand-900/20'
                    : 'border-surface-border hover:border-slate-500'}`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={form.role === r.value}
                  onChange={() => update('role', r.value)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-white">{r.label}</p>
                  <p className="text-xs text-slate-400">{r.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          L'utilisateur recevra un e-mail avec un lien pour rejoindre votre espace.
        </p>
      </div>
    </Modal>
  );
}
