import { useEffect, useRef } from 'react';

export function SignatureCanvas({
  canvasRef, hasStrokesRef, onDrawStart
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  hasStrokesRef: React.MutableRefObject<boolean>;
  onDrawStart?: () => void;
}) {
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getPos(e: MouseEvent | Touch) {
      const r = canvas!.getBoundingClientRect();
      const scaleX = canvas!.width / r.width;
      const scaleY = canvas!.height / r.height;
      return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
    }

    function start(x: number, y: number) {
      drawing.current = true;
      hasStrokesRef.current = true;
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b';
      if (onDrawStart) onDrawStart();
    }

    function move(x: number, y: number) {
      if (!drawing.current) return;
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    function stop() { drawing.current = false; }

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const pos = getPos(e.touches[0]);
      start(pos.x, pos.y);
    };
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const pos = getPos(e.touches[0]);
      move(pos.x, pos.y);
    };
    const handleTouchEnd = () => stop();

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  handleTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   handleTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove',  handleTouchMove);
      canvas.removeEventListener('touchend',   handleTouchEnd);
    };
  }, [canvasRef, hasStrokesRef, onDrawStart]);

  return (
    <canvas
      ref={canvasRef}
      width={500}
      height={150}
      className="w-full touch-none cursor-crosshair"
      style={{ display: 'block' }}
      onMouseDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) * (e.currentTarget.width / r.width);
        const y = (e.clientY - r.top) * (e.currentTarget.height / r.height);
        drawing.current = true;
        hasStrokesRef.current = true;
        const ctx = e.currentTarget.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#1e293b';
        }
        if (onDrawStart) onDrawStart();
      }}
      onMouseMove={(e) => {
        if (!drawing.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) * (e.currentTarget.width / r.width);
        const y = (e.clientY - r.top) * (e.currentTarget.height / r.height);
        const ctx = e.currentTarget.getContext('2d');
        if (ctx) {
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }}
      onMouseUp={() => { drawing.current = false; }}
      onMouseLeave={() => { drawing.current = false; }}
    />
  );
}
