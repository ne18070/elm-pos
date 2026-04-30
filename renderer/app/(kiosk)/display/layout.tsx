/** Layout minimal —pas de sidebar, fond sombre, plein écran */
export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0f172a] text-content-primary">
      {children}
    </div>
  );
}

