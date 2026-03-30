'use client';
import { toUserError } from '@/lib/user-error';

import { useState } from 'react';
import { Loader2, UserPlus, RefreshCw, Copy, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/store/notifications';
import { inviteUser } from '@services/supabase/users';

interface InviteModalProps {
  businessId: string;
  onClose:    () => void;
  onInvited:  () => void;
}

const ROLES = [
  { value: 'staff',   label: 'Caissier',       desc: 'Accès à la caisse uniquement' },
  { value: 'manager', label: 'Manager',         desc: 'Accès opérationnel complet, sans données financières sensibles' },
  { value: 'admin',   label: 'Administrateur',  desc: 'Accès complet sauf gestion propriétaire' },
];

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function InviteModal({ businessId, onClose, onInvited }: InviteModalProps) {
  const { success, error: notifError } = useNotificationStore();
  const [loading,       setLoading]       = useState(false);
  const [done,          setDone]          = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [existingUser,  setExistingUser]  = useState(false);
  const [form, setForm] = useState({
    email:     '',
    full_name: '',
    role:      'staff',
    password:  generatePassword(),
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function refreshPassword() {
    setForm((f) => ({ ...f, password: generatePassword() }));
  }

  async function copyPassword() {
    await navigator.clipboard.writeText(form.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCreate() {
    if (!form.email.trim()) return;
    setLoading(true);
    try {
      await inviteUser({
        email:         form.email.trim(),
        full_name:     form.full_name.trim() || form.email.split('@')[0],
        role:          form.role as 'admin' | 'staff',
        business_id:   businessId,
        password:      existingUser ? undefined : form.password,
        existing_user: existingUser,
      });
      setDone(true);
      success(`Compte créé pour ${form.email}`);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Modal title={existingUser ? 'Membre ajouté' : 'Compte créé'} onClose={onClose} size="sm">
        <div className="space-y-4">
          {existingUser ? (
            <p className="text-sm text-slate-300">
              <strong className="text-white">{form.email}</strong> a été ajouté à cet établissement.
              Il verra le nouvel établissement dans son sélecteur en haut à gauche.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-300">
                Le compte <strong className="text-white">{form.email}</strong> a été créé.
                Transmettez ces identifiants à l'utilisateur.
              </p>
              <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Email</span>
                  <span className="text-white font-mono">{form.email}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-400">Mot de passe</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono">{form.password}</span>
                    <button onClick={copyPassword} className="text-slate-400 hover:text-white">
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                L'utilisateur pourra changer son mot de passe depuis son profil.
              </p>
            </>
          )}
        </div>
        <div className="flex justify-end mt-6">
          <button onClick={() => { onInvited(); onClose(); }} className="btn-primary px-5">Fermer</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Créer un compte membre"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary px-5">Annuler</button>
          <button
            onClick={handleCreate}
            disabled={loading || !form.email.trim()}
            className="btn-primary px-5 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Créer le compte
          </button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Toggle compte existant */}
        <label className="flex items-center gap-3 p-3 rounded-xl border border-surface-border cursor-pointer hover:border-slate-500 transition-colors">
          <input
            type="checkbox"
            checked={existingUser}
            onChange={(e) => setExistingUser(e.target.checked)}
            className="w-4 h-4 accent-brand-500"
          />
          <div>
            <p className="text-sm font-medium text-white">Utilisateur existant</p>
            <p className="text-xs text-slate-400">L'utilisateur a déjà un compte sur un autre établissement</p>
          </div>
        </label>

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

        {!existingUser && (
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
        )}

        {!existingUser && (
        <div>
          <label className="label">Mot de passe temporaire</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              className="input font-mono flex-1"
            />
            <button
              onClick={refreshPassword}
              className="btn-secondary px-3"
              title="Générer un nouveau mot de passe"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        )}

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
          {existingUser
            ? "L'utilisateur sera ajouté à cet établissement. Il pourra basculer entre ses établissements depuis la barre latérale."
            : "Le compte est créé immédiatement. Transmettez l'email et le mot de passe à l'utilisateur."}
        </p>
      </div>
    </Modal>
  );
}
