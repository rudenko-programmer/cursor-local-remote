"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { NetworkInfo } from "@/lib/types";

interface QrModalProps {
  open: boolean;
  onClose: () => void;
}

export function QrModal({ open, onClose }: QrModalProps) {
  const [info, setInfo] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/info")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-2xl p-6 max-w-sm w-full mx-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Connect from another device</h2>
        <p className="text-text-secondary text-sm mb-5">
          Scan the QR code or open the URL on any device on your network
        </p>

        {info ? (
          <>
            <div className="bg-white rounded-xl p-4 inline-block mb-4">
              <QRCodeSVG value={info.url} size={200} />
            </div>
            <p className="font-mono text-sm text-accent break-all">{info.url}</p>
          </>
        ) : (
          <div className="py-12 text-text-muted text-sm">Loading...</div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full py-2 rounded-xl bg-bg-tertiary border border-border text-sm text-text-secondary hover:text-text transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
