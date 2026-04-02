"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pen, Type, Eraser } from "lucide-react";

type Mode = "draw" | "type";

interface Props {
  onCapture: (dataUrl: string) => void;
  disabled?: boolean;
}

export function SignatureCapture({ onCapture, disabled }: Props) {
  const [mode, setMode] = useState<Mode>("draw");
  const [typedName, setTypedName] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Set up canvas with retina support
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 2;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
  }, []);

  useEffect(() => {
    if (mode === "draw") {
      setupCanvas();
    }
  }, [mode, setupCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDrawing(true);
    setHasDrawn(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 2;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasDrawn(false);
  };

  const captureDrawn = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCapture(canvas.toDataURL("image/png"));
  };

  const captureTyped = () => {
    if (!typedName.trim()) return;
    // Render typed name to a hidden canvas
    const canvas = document.createElement("canvas");
    const dpr = 2;
    canvas.width = 400 * dpr;
    canvas.height = 120 * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 400, 120);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "italic 36px Georgia, 'Times New Roman', serif";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName, 16, 60);
    onCapture(canvas.toDataURL("image/png"));
  };

  const canApply = mode === "draw" ? hasDrawn : typedName.trim().length > 0;

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg border border-border p-1 w-fit">
        <button
          type="button"
          onClick={() => setMode("draw")}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "draw"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Pen className="h-3.5 w-3.5" />
          Draw
        </button>
        <button
          type="button"
          onClick={() => setMode("type")}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "type"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Type className="h-3.5 w-3.5" />
          Type
        </button>
      </div>

      {mode === "draw" ? (
        <div className="space-y-2">
          <div className="relative rounded-lg border-2 border-dashed border-border bg-white">
            <canvas
              ref={canvasRef}
              className="w-full h-[120px] cursor-crosshair touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            {!hasDrawn && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
                Sign here
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearCanvas}
              disabled={disabled || !hasDrawn}
            >
              <Eraser className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Type your full name"
            disabled={disabled}
            className="text-base"
          />
          {typedName.trim() && (
            <div className="rounded-lg border border-border bg-white p-4">
              <p
                className="text-3xl text-foreground"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
              >
                {typedName}
              </p>
            </div>
          )}
        </div>
      )}

      <Button
        type="button"
        onClick={mode === "draw" ? captureDrawn : captureTyped}
        disabled={disabled || !canApply}
        className="w-full"
      >
        Apply Signature
      </Button>
    </div>
  );
}
