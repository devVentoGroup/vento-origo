"use client";

import { useState } from "react";

type Props = {
  message: string;
  className?: string;
};

export function CopyPoMessageButton({ message, className }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className={`ui-btn ui-btn--ghost ${className ?? ""}`} onClick={handleCopy}>
      {copied ? "Mensaje copiado" : "Copiar mensaje proveedor"}
    </button>
  );
}
