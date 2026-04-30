import { useState } from 'react';
import { Palette, Printer } from 'lucide-react';
import { TemplateManager } from '@/components/settings/TemplateManager';
import { useAuthStore } from '@/store/auth';

export function PrintTemplatesSection() {
  const { business } = useAuthStore();
  const [showManager, setShowTemplateManager] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-content-secondary leading-relaxed">
        Créez et personnalisez vos modèles d&apos;impression : format de papier (80mm, A4, A5), couleurs, champs affichés (RIB, TVA), et messages personnalisés.
      </p>
      
      <button 
        onClick={() => setShowTemplateManager(true)} 
        className="w-full btn-secondary h-11 flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all hover:scale-[1.01]"
      >
        <Palette className="w-4 h-4" />
        Gérer les modèles d&apos;impression
      </button>

      {showManager && (
        <TemplateManager 
          businessId={business?.id ?? ''} 
          onClose={() => setShowTemplateManager(false)} 
        />
      )}
    </div>
  );
}
