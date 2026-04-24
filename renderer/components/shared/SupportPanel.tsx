'use client';

import React, { useState, useRef } from 'react';
import { 
  X, Send, Paperclip, Loader2, MessageSquare, 
  Bug, Lightbulb, HelpCircle, CheckCircle2,
  Trash2, Image as ImageIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createTicket, uploadAttachment, type TicketType } from '@services/supabase/support';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { SideDrawer } from '@/components/ui/SideDrawer';

export function SupportPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<TicketType>('feedback');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    try {
      const urls = await Promise.all(
        Array.from(files).map(file => uploadAttachment(file))
      );
      setAttachments(prev => [...prev, ...urls]);
      success(`${urls.length} fichier(s) ajouté(s)`);
    } catch (err) {
      notifError("Échec de l'upload des fichiers");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeAttachment(url: string) {
    setAttachments(prev => prev.filter(a => a !== url));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !user) return;
    if (!subject.trim() || !message.trim()) return;

    setLoading(true);
    try {
      await createTicket(business.id, user.id, {
        type,
        subject,
        message,
        attachments,
        priority: type === 'bug' ? 'high' : 'medium'
      });
      
      success("Merci ! Votre retour a été envoyé avec succès.");
      setSubject('');
      setMessage('');
      setAttachments([]);
      onClose();
    } catch (err) {
      notifError("Une erreur est survenue lors de l'envoi.");
    } finally {
      setLoading(false);
    }
  }

  const TICKET_TYPES: { value: TicketType; label: string; icon: any; color: string }[] = [
    { value: 'bug',        label: 'Signaler un Bug', icon: Bug,         color: 'text-status-error bg-red-500/10 border-red-500/20' },
    { value: 'suggestion', label: 'Suggestion',      icon: Lightbulb,   color: 'text-status-warning bg-amber-500/10 border-amber-500/20' },
    { value: 'question',   label: 'Question',        icon: HelpCircle,  color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    { value: 'feedback',   label: 'Retour général',  icon: MessageSquare, color: 'text-status-success bg-emerald-500/10 border-emerald-500/20' },
  ];

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Centre de Support"
      subtitle="Aidez-nous à améliorer votre expérience"
      maxWidth="max-w-md"
      footer={
        <button
          onClick={handleSubmit}
          disabled={loading || !subject.trim() || !message.trim()}
          className="btn-primary w-full h-12 flex items-center justify-center gap-2 font-black uppercase tracking-widest text-xs shadow-xl shadow-brand-500/20"
        >
          {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Send className="w-4 h-4" />}
          Envoyer mon retour
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Type Selection */}
        <div className="space-y-3">
          <label className="label text-[10px] font-black uppercase tracking-widest text-slate-500">Nature de votre message</label>
          <div className="grid grid-cols-2 gap-2">
            {TICKET_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all text-center",
                  type === t.value 
                    ? t.color + " ring-2 ring-current ring-offset-2 ring-offset-surface" 
                    : "bg-surface-input/50 border-surface-border text-slate-500 hover:text-slate-300 hover:bg-surface-input"
                )}
              >
                <t.icon size={20} />
                <span className="text-[10px] font-bold uppercase tracking-tight leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Subject & Message */}
        <div className="space-y-4">
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-slate-500">Sujet</label>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="En quelques mots..."
              className="input h-12 text-sm"
            />
          </div>
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-slate-500">Message détaillé</label>
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Décrivez votre suggestion ou le problème rencontré..."
              className="input py-4 text-sm min-h-[150px]"
            />
          </div>
        </div>

        {/* Attachments */}
        <div className="space-y-3">
          <label className="label text-[10px] font-black uppercase tracking-widest text-slate-500">Captures d'écran (Optionnel)</label>
          <div className="flex flex-wrap gap-2">
            {attachments.map((url) => (
              <div key={url} className="relative group w-20 h-20 rounded-xl overflow-hidden border border-surface-border bg-surface-input">
                <img src={url} alt="screenshot" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAttachment(url)}
                  className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-surface-border flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-content-brand hover:border-brand-500/50 transition-all bg-surface-input/30"
            >
              {uploading ? <Loader2 className="animate-spin w-5 h-5" /> : <Paperclip size={20} />}
              <span className="text-[8px] font-black uppercase">Ajouter</span>
            </button>
            <input
              type="file"
              multiple
              accept="image/*"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          <p className="text-[10px] text-slate-500 italic">Formats acceptés : JPG, PNG. Max 5Mo.</p>
        </div>

        <div className="p-4 rounded-2xl bg-brand-500/5 border border-brand-500/10 flex items-start gap-3">
           <CheckCircle2 size={18} className="text-content-brand shrink-0 mt-0.5" />
           <p className="text-[11px] text-content-secondary leading-relaxed">
             Votre retour est précieux ! Notre équipe technique analyse chaque message pour rendre ELM plus performant.
           </p>
        </div>
      </form>
    </SideDrawer>
  );
}
