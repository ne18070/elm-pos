export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-surface">
      {children}
    </div>
  );
}
