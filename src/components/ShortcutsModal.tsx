import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_ITEMS: { keys: string[]; label: string; detail: string }[] = [
  {
    keys: ['Space'],
    label: 'Toggle Split Compare',
    detail: 'Switch active portrait between Final Portrait and Split Compare',
  },
  {
    keys: ['B'],
    label: 'Toggle Original Before/After',
    detail: 'Flip between the generated studio headshot and original selfie',
  },
  {
    keys: ['G'],
    label: 'Generate Studio Headshot',
    detail: 'Develop a new take using your current direction settings',
  },
  {
    keys: ['H'],
    label: 'Toggle Session History',
    detail: 'Switch the right workbench panel between Direction and History',
  },
  {
    keys: ['[', ']'],
    label: 'Previous / Next Take',
    detail: 'Step backward or forward through session headshots',
  },
  {
    keys: ['I'],
    label: 'Inspect Fullscreen',
    detail: 'Open or close the high-resolution portrait lightbox',
  },
  {
    keys: ['D'],
    label: 'Download Active PNG',
    detail: 'Export the active headshot with Sable Studio EXIF metadata',
  },
  {
    keys: ['?'],
    label: 'Keyboard Shortcuts',
    detail: 'Show or dismiss this darkroom shortcut reference',
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Studio keyboard shortcuts"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050506]/85 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.1] bg-[#141416] shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-4 w-4 text-[#D4A853]" aria-hidden="true" />
            <h2 className="font-serif text-xl font-semibold text-[#F5F1E8]">
              Darkroom Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts reference"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/12 text-[#9B968C] transition-colors hover:bg-white/10 hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <ul className="divide-y divide-white/[0.06] px-5 py-2">
          {SHORTCUT_ITEMS.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between gap-4 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F5F1E8]">{item.label}</p>
                <p className="mt-0.5 text-[11px] text-[#9B968C]">{item.detail}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.keys.map((keyLabel) => (
                  <kbd
                    key={keyLabel}
                    className="inline-flex min-w-[28px] items-center justify-center rounded border border-white/[0.14] bg-[#0B0B0C] px-2 py-1 font-mono text-[11px] font-medium text-[#F5F1E8]"
                  >
                    {keyLabel}
                  </kbd>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-white/[0.08] bg-[#0B0B0C]/60 px-5 py-3 text-[11px] text-[#9B968C]">
          Shortcuts automatically pause while typing in prompts or form inputs.
        </div>
      </div>
    </div>
  );
};
