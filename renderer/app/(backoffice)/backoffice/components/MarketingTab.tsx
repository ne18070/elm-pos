'use client';

import { useState, useEffect } from 'react';
import { Loader2, Send, Users, Mail, AlertTriangle, CheckCircle } from 'lucide-react';
import { getAllSubscriptions, type SubscriptionRow } from '@services/supabase/subscriptions';
import { sendEmail } from '@services/resend';
import { toUserError } from '@/lib/user-error';

export function MarketingTab() {
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    subject: '',
    title: '',
    content: '',
    buttonLabel: '',
    buttonUrl: '',
    target: 'all' as 'all' | 'active' | 'trial' | 'expired' | 'individual',
    selectedOwnerEmail: '',
  });

  useEffect(() => {
    getAllSubscriptions()
      .then(setSubs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function effectiveStatus(s: SubscriptionRow): string {
    const now = Date.now();
    if (s.status === 'active' && s.expires_at && new Date(s.expires_at).getTime() < now) return 'expired';
    if (s.status === 'trial' && s.trial_ends_at && new Date(s.trial_ends_at).getTime() < now) return 'expired';
    return s.status;
  }

  const getTargetEmails = () => {
    const target = form.target;
    if (target === 'individual') return form.selectedOwnerEmail ? [form.selectedOwnerEmail] : [];
    
    return subs
      .filter(s => target === 'all' || effectiveStatus(s) === target)
      .map(s => s.owner_email)
      .filter(Boolean) as string[];
  };

  const emails = Array.from(new Set(getTargetEmails())); // Unique emails

  async function handleSend() {
    if (!form.subject || !form.title || !form.content) {
      setError('Veuillez remplir le sujet, le titre et le contenu.');
      return;
    }
    if (emails.length === 0) {
      setError('Aucun destinataire sélectionné.');
      return;
    }

    if (!confirm(`Voulez-vous envoyer cet email à ${emails.length} contact(s) ?`)) return;

    setSending(true);
    setSuccess(null);
    setError(null);

    let sentCount = 0;
    let failCount = 0;

    try {
      // Send emails in small batches to avoid hitting limits or timeouts
      const batchSize = 5;
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        await Promise.all(batch.map(email => 
          sendEmail({
            type: 'marketing',
            to: email,
            subject: form.subject,
            data: {
              title: form.title,
              content: form.content,
              button_label: form.buttonLabel || undefined,
              button_url: form.buttonUrl || undefined,
            }
          }).then(() => { sentCount++; })
            .catch((err) => { 
              console.error(`Failed to send to ${email}:`, err);
              failCount++; 
            })
        ));
      }

      setSuccess(`Campagne terminée : ${sentCount} envoyé(s), ${failCount} échec(s).`);
      if (failCount === 0) {
        setForm({ ...form, subject: '', title: '', content: '', buttonLabel: '', buttonUrl: '' });
      }
    } catch (err) {
      setError(toUserError(err));
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-content-brand" /></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-5 h-5 text-content-brand" />
          <h2 className="font-semibold text-content-primary">Nouvelle Campagne Email</h2>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Cible</label>
              <select 
                value={form.target} 
                onChange={(e) => setForm(f => ({ ...f, target: e.target.value as any }))}
                className="input"
              >
                <option value="all">Tous ({subs.length})</option>
                <option value="active">Actifs ({subs.filter(s => effectiveStatus(s) === 'active').length})</option>
                <option value="trial">En essai ({subs.filter(s => effectiveStatus(s) === 'trial').length})</option>
                <option value="expired">Expirés ({subs.filter(s => effectiveStatus(s) === 'expired').length})</option>
                <option value="individual">Un propriétaire spécifique</option>
              </select>
            </div>

            {form.target === 'individual' && (
              <div>
                <label className="label">Sélectionner le propriétaire</label>
                <select
                  value={form.selectedOwnerEmail}
                  onChange={(e) => setForm(f => ({ ...f, selectedOwnerEmail: e.target.value }))}
                  className="input"
                >
                  <option value="">Choisir...</option>
                  {subs
                    .sort((a, b) => (a.owner_name || '').localeCompare(b.owner_name || ''))
                    .map(s => (
                      <option key={s.business_id} value={s.owner_email || ''}>
                        {s.owner_name || 'Inconnu'} ({s.business_name})
                      </option>
                    ))
                  }
                </select>
              </div>
            )}
          </div>

          <p className="text-[10px] text-content-muted mt-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> {emails.length} email(s) unique(s) seront contacté(s)
          </p>

          <div>
            <label className="label">Sujet de l'email (Objet)</label>
            <input 
              type="text" 
              value={form.subject} 
              onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Ex: Nouvelle fonctionnalité disponible !"
              className="input"
            />
          </div>

          <div>
            <label className="label">Titre dans l'email (H2)</label>
            <input 
              type="text" 
              value={form.title} 
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Découvrez le module Stock Pro"
              className="input"
            />
          </div>

          <div>
            <label className="label">Contenu du message</label>
            <textarea 
              value={form.content} 
              onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Écrivez votre message ici..."
              className="input min-h-[150px] resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Texte du bouton (Optionnel)</label>
              <input 
                type="text" 
                value={form.buttonLabel} 
                onChange={(e) => setForm(f => ({ ...f, buttonLabel: e.target.value }))}
                placeholder="Ex: En savoir plus"
                className="input"
              />
            </div>
            <div>
              <label className="label">Lien du bouton (Optionnel)</label>
              <input 
                type="text" 
                value={form.buttonUrl} 
                onChange={(e) => setForm(f => ({ ...f, buttonUrl: e.target.value }))}
                placeholder="https://..."
                className="input"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-status-error shrink-0" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-3 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-status-success shrink-0" />
            <p className="text-sm text-green-200">{success}</p>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || emails.length === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          {sending ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Envoyer la campagne ({emails.length})
            </>
          )}
        </button>
      </div>

      <div className="card p-6 bg-surface-input/30 border-dashed">
        <h3 className="text-content-secondary text-sm font-semibold mb-4 uppercase tracking-wider">Aperçu du rendu</h3>
        
        <div className="bg-white rounded-xl overflow-hidden shadow-2xl max-w-md mx-auto">
          {/* Header Mockup */}
          <div className="bg-[#0a0f1e] p-6 text-center">
            <div className="inline-flex items-center gap-2">
              {/* <div className="w-6 h-6 bg-brand-600 rounded-md"></div> */}
              <span className="text-content-primary font-bold">ELM <span className="text-content-brand">APP</span></span>
            </div>
          </div>
          
          {/* Body Mockup */}
          <div className="p-8 space-y-4">
            <h2 className="text-[#0f172a] text-xl font-extrabold">{form.title || 'Titre de l\'email'}</h2>
            <div className="text-[#475569] text-sm leading-relaxed whitespace-pre-wrap">
              {form.content || 'Le contenu de votre message apparaîtra ici. Vous pouvez utiliser des retours à la ligne pour structurer votre texte.'}
            </div>
            
            {form.buttonLabel && form.buttonUrl && (
              <div className="py-4 text-center">
                <div className="inline-block bg-brand-600 text-content-primary text-sm font-bold px-8 py-3 rounded-xl shadow-lg">
                  {form.buttonLabel}
                </div>
              </div>
            )}
            
            <div className="pt-6 border-t border-slate-100 mt-6">
              <p className="text-[#94a3b8] text-[10px] text-center">
                ELM APP · Gestion simplifiée pour l'Afrique<br/>
                contact@elm-app.click
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
