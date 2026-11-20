import { useEffect, useRef } from 'react';

export interface StudioShortcutHandlers {
  canCompare: boolean;
  canGenerate: boolean;
  hasActiveTake: boolean;
  hasMultipleTakes: boolean;
  isLightboxOpen: boolean;
  isShortcutsModalOpen: boolean;
  onToggleSplitCompare: () => void;
  onToggleOriginalCompare: () => void;
  onGenerate: () => void;
  onToggleHistory: () => void;
  onStepTake: (delta: -1 | 1) => void;
  onToggleInspect: () => void;
  onDownloadActive: () => void;
  onToggleShortcutsModal: () => void;
  onCloseShortcutsModal: () => void;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

function isInteractiveControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return true;
  const role = target.getAttribute('role');
  if (role === 'button' || role === 'tab' || role === 'link' || role === 'menuitem') {
    return true;
  }
  return Boolean(target.closest('button, a, [role="button"], [role="tab"]'));
}

export function useStudioShortcuts(handlers: StudioShortcutHandlers): void {
  const handlersRef = useRef<StudioShortcutHandlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const current = handlersRef.current;

      // Always allow Escape to close the shortcuts modal
      if (e.key === 'Escape' && current.isShortcutsModalOpen) {
        e.preventDefault();
        current.onCloseShortcutsModal();
        return;
      }

      // Never intercept modified OS/browser shortcuts or typing inside form fields
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableElement(e.target)) {
        return;
      }

      const key = e.key;
      const lower = key.toLowerCase();

      // '?' opens/closes keyboard shortcut reference (unless lightbox is open)
      if (key === '?' && !current.isLightboxOpen) {
        e.preventDefault();
        current.onToggleShortcutsModal();
        return;
      }

      // While shortcuts modal or fullscreen lightbox is open, pause workspace hotkeys
      if (current.isShortcutsModalOpen) {
        return;
      }

      if (current.isLightboxOpen) {
        if (lower === 'i') {
          e.preventDefault();
          current.onToggleInspect();
        } else if (lower === 'd' && current.hasActiveTake) {
          e.preventDefault();
          current.onDownloadActive();
        }
        return;
      }

      if (e.code === 'Space' || key === ' ') {
        // Respect native Space activation when a button/tab is focused
        if (isInteractiveControl(e.target) || !current.canCompare) {
          return;
        }
        e.preventDefault();
        current.onToggleSplitCompare();
        return;
      }

      if (lower === 'b' && current.canCompare) {
        e.preventDefault();
        current.onToggleOriginalCompare();
        return;
      }

      if (lower === 'g' && current.canGenerate) {
        e.preventDefault();
        current.onGenerate();
        return;
      }

      if (lower === 'h') {
        e.preventDefault();
        current.onToggleHistory();
        return;
      }

      if (key === '[' && current.hasMultipleTakes) {
        e.preventDefault();
        current.onStepTake(-1);
        return;
      }

      if (key === ']' && current.hasMultipleTakes) {
        e.preventDefault();
        current.onStepTake(1);
        return;
      }

      if (lower === 'i' && current.hasActiveTake) {
        e.preventDefault();
        current.onToggleInspect();
        return;
      }

      if (lower === 'd' && current.hasActiveTake) {
        e.preventDefault();
        current.onDownloadActive();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
