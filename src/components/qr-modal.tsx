"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { NetworkInfo } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";

interface QrModalProps {
  open: boolean;
  onClose: () => void;
}

export function QrModal({ open, onClose }: QrModalProps) {
  const [info, setInfo] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/info")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="bg-bg-elevated border border-border rounded-xl p-6 max-w-xs w-full mx-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[13px] font-medium text-text mb-1">Connect device</p>
        <p className="text-[12px] text-text-muted mb-5">
          Scan from any device on your network
        </p>

        {info ? (
          <>
            <div className="bg-white rounded-lg p-3 inline-block mb-3">
              <QRCodeSVG value={info.authUrl} size={180} />
            </div>
            <p className="font-mono text-[12px] text-text-secondary">{info.url}</p>
          </>
        ) : (
          <div className="py-10 text-text-muted text-[12px]">
            <span className="w-3.5 h-3.5 inline-block rounded-full border-2 border-text-muted border-t-transparent animate-spin" />
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-1.5 rounded-lg text-[12px] text-text-muted hover:text-text-secondary transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
