import React from 'react';
import { Upload } from 'lucide-react';
import { SessionTimer } from './SessionTimer';

interface TopBarProps {
  onUploadClick: () => void;
  hasReelItems: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ onUploadClick, hasReelItems }) => {
  return (
    <header className="sticky top-0 z-40 h-16 border-b border-white/[0.08] bg-[#0B0B0C]/90 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between gap-6 px-5 sm:gap-8 sm:px-8">
        <a
          href="#studio"
          className="font-serif text-[26px] font-semibold tracking-tight text-[#F5F1E8] whitespace-nowrap shrink-0 transition-opacity duration-150 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0C] rounded-sm"
        >
          Sable Studio
        </a>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#9B968C]"
        >
          <a
            href="#studio"
            className="whitespace-nowrap shrink-0 py-1 transition-colors duration-150 hover:text-[#F5F1E8]"
          >
            Studio
          </a>
          <a
            href="#lookbook"
            className="whitespace-nowrap shrink-0 py-1 transition-colors duration-150 hover:text-[#F5F1E8]"
          >
            Lookbook
          </a>
          <a
            href="#reel"
            className="whitespace-nowrap shrink-0 py-1 transition-colors duration-150 hover:text-[#F5F1E8]"
          >
            {hasReelItems ? 'Darkroom Reel' : 'Contact Strip'}
          </a>
          <a
            href="#guide"
            className="whitespace-nowrap shrink-0 py-1 transition-colors duration-150 hover:text-[#F5F1E8]"
          >
            Capture Guide
          </a>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0 sm:gap-3">
          <SessionTimer />
          <button
            type="button"
            onClick={onUploadClick}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[#F5F1E8] px-4 py-2 text-xs font-semibold text-[#0B0B0C] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E7E0D0] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0C] cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Upload Selfie</span>
          </button>
        </div>
      </div>
    </header>
  );
};
