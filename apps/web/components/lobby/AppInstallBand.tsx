"use client";

import { buttonClasses } from "@/components/ui/button";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { APP_INSTALL_LABELS, INSTALL_STEPS, handheldSignal, isHandheldDevice, mobileAppUrl } from "@/lib/mobileAppInstall";
import { Copy, Info, Smartphone } from "lucide-react";
import { useState } from "react";

export function AppInstallBand() {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <section aria-labelledby="app-install-title" className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-apex text-white">
            <Smartphone size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-content-strong" id="app-install-title">{APP_INSTALL_LABELS.bandTitle}</h2>
            <p className="text-sm text-content-muted">{APP_INSTALL_LABELS.bandHint}</p>
          </div>
        </div>
        <button className={buttonClasses("primary", "touch", "w-full shrink-0 sm:w-auto")} onClick={() => setGuideOpen(true)} type="button">
          {APP_INSTALL_LABELS.bandAction}
        </button>
      </div>
      {guideOpen ? <AppInstallGuide onClose={() => setGuideOpen(false)} /> : null}
    </section>
  );
}

function AppInstallGuide({ onClose }: { onClose: () => void }) {
  const [handheld] = useState(() => isHandheldDevice(handheldSignal()));
  const [feedback, setFeedback] = useState("");
  const url = mobileAppUrl();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback(APP_INSTALL_LABELS.copied);
    } catch {
      // Sin portapapeles concedido el enlace sigue escrito en la pantalla: no hay callejon.
      setFeedback(APP_INSTALL_LABELS.copyBlocked);
    }
  }

  return (
    <ModalFrame
      description={APP_INSTALL_LABELS.guideDescription}
      footer={handheld
        ? <a className={buttonClasses("primary", "touch", "w-full")} href={url} rel="noopener noreferrer" target="_blank">{APP_INSTALL_LABELS.openApp}</a>
        : <button className={buttonClasses("primary", "touch", "w-full")} onClick={() => void copyLink()} type="button"><Copy size={16} />{APP_INSTALL_LABELS.copyLink}</button>}
      icon={<Smartphone size={18} />}
      maxWidth="md:!max-w-lg"
      onClose={onClose}
      title={APP_INSTALL_LABELS.guideTitle}
      tone="brand"
    >
      {!handheld ? (
        <div className="flex items-start gap-2 rounded-control border border-line bg-surface-muted p-3" role="note">
          <Info aria-hidden="true" className="mt-0.5 shrink-0 text-apex" size={16} />
          <p className="text-sm text-content-strong">{APP_INSTALL_LABELS.desktopNotice}</p>
        </div>
      ) : null}

      <ol className="mt-3 space-y-2.5">
        {INSTALL_STEPS.map((step, index) => (
          <li className="flex gap-3" key={step.id}>
            <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-control border border-line text-xs font-semibold text-content-strong">{index + 1}</span>
            <span className="min-w-0">
              <strong className="block text-sm text-content-strong">{step.label}</strong>
              <small className="block text-xs text-content-muted">{step.detail}</small>
            </span>
          </li>
        ))}
      </ol>

      {!handheld ? (
        <>
          <p className="mt-3 text-xs text-content-muted">{APP_INSTALL_LABELS.desktopHint}</p>
          <p className="mt-2 break-all rounded-control border border-line bg-surface px-3 py-2 font-mono text-xs text-content-strong">{url}</p>
        </>
      ) : (
        <p className="mt-3 text-xs text-content-muted">{APP_INSTALL_LABELS.installedHint}</p>
      )}

      {feedback ? <p aria-live="polite" className="mt-2 text-xs text-apex">{feedback}</p> : null}
    </ModalFrame>
  );
}
