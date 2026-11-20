import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, History, SlidersHorizontal, X } from 'lucide-react';
import {
  applyAdvancedLightingPreset,
  buildDefaultRecipe,
  getAdvancedLightingPresetById,
  getAttireById,
  getFramingById,
  getLightingById,
  getStyleById,
  getSubjectProfileById,
  suggestSmartCrop,
  type AdvancedLightingPresetId,
  type AspectRatioOption,
  type AttireId,
  type DarkroomRecipe,
  type FramingAnchor,
  type FramingId,
  type GeneratedTake,
  type LightingId,
  type SelfieCritique,
  type SourcePortrait,
  type StudioDirectionConfig,
  type StyleId,
  type SubjectProfileId,
} from './data/studioCatalog';
import { TopBar } from './components/TopBar';
import { ComparisonStage } from './components/ComparisonStage';
import { RetouchPromptBar } from './components/RetouchPromptBar';
import { DirectionPanel } from './components/DirectionPanel';
import { HistoryViewPanel } from './components/HistoryViewPanel';
import { DarkroomReel } from './components/DarkroomReel';
import { StyleLookbookSection } from './components/StyleLookbookSection';
import { PortraitLightbox } from './components/PortraitLightbox';
import { ShortcutsModal } from './components/ShortcutsModal';
import { useStudioShortcuts } from './hooks/useStudioShortcuts';
import {
  buildTakeExifMetadata,
  downloadPortrait,
  processSelfieFile,
} from './utils/imageProcessing';
import {
  applyLocalUnsharpMask,
  renderStudioHeadshot,
  segmentSelfie,
  type SegmentationMasks,
} from './utils/darkroomEngine';
import {
  analyzeSelfieLocally,
  applyRetouchLocally,
  detectFacialAlignmentLocally,
  planFramingLocally,
  safePostJson,
} from './utils/localDarkroomAi';

const INITIAL_CONFIG: StudioDirectionConfig = {
  styleId: 'corporate-grey',
  attireId: 'keep-original',
  framingId: 'head-shoulders',
  smartCrop: true,
  lightingId: 'softbox-key',
  advancedLightingPreset: 'none',
  subjectProfile: 'androgynous',
  aspectRatio: '3:4',
  backdropBlur: 4,
  extraNotes: '',
};

const DEFAULT_ANCHOR: FramingAnchor = {
  faceCenterX: 0.5,
  faceCenterY: 0.37,
  faceHeightRatio: 0.34,
};

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Cache on-device neural segmentation per uploaded selfie so retouches and style changes render instantaneously
  const maskCacheRef = useRef<{ sourceDataUrl: string; masks: SegmentationMasks } | null>(null);

  const [sourcePortrait, setSourcePortrait] = useState<SourcePortrait | null>(null);
  const [config, setConfig] = useState<StudioDirectionConfig>(INITIAL_CONFIG);
  const [takes, setTakes] = useState<GeneratedTake[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);

  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [retouchPrompt, setRetouchPrompt] = useState<string>('');
  const [critique, setCritique] = useState<SelfieCritique | null>(null);
  const [detectedAnchor, setDetectedAnchor] = useState<FramingAnchor | null>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationPhase, setGenerationPhase] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isSharpening, setIsSharpening] = useState<boolean>(false);
  const [isUpdatingBokeh, setIsUpdatingBokeh] = useState<boolean>(false);
  const [isSuggestingRetouches, setIsSuggestingRetouches] = useState<boolean>(false);
  const [bulkRetouchProgress, setBulkRetouchProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [suggestRetouchError, setSuggestRetouchError] = useState<string | null>(null);
  const [autoSuggestionsByTakeId, setAutoSuggestionsByTakeId] = useState<
    Record<string, string[]>
  >({});
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState<boolean>(false);
  const [rightPanelMode, setRightPanelMode] = useState<'direction' | 'history'>('direction');

  const rightPanelRef = useRef<HTMLElement | null>(null);
  const frameCounterRef = useRef<number>(0);
  const sharpenJobRef = useRef<number>(0);
  const sharpenTimerRef = useRef<number | null>(null);
  const bokehJobRef = useRef<number>(0);
  const bokehTimerRef = useRef<number | null>(null);

  const selectedStyle = useMemo(() => getStyleById(config.styleId), [config.styleId]);
  const activeTake = useMemo(
    () => takes.find((t) => t.id === activeTakeId) ?? null,
    [takes, activeTakeId]
  );
  const smartCropSuggestion = useMemo(
    () => (detectedAnchor ? suggestSmartCrop(detectedAnchor, config.aspectRatio) : null),
    [detectedAnchor, config.aspectRatio]
  );

  useEffect(() => {
    if (!config.smartCrop || !smartCropSuggestion) return;
    setConfig((prev) =>
      prev.smartCrop && prev.framingId !== smartCropSuggestion.framingId
        ? { ...prev, framingId: smartCropSuggestion.framingId }
        : prev
    );
  }, [config.smartCrop, smartCropSuggestion]);

  useEffect(() => {
    if (!isGenerating) {
      setElapsedSeconds(0);
      return;
    }
    const start = performance.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds((performance.now() - start) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    return () => {
      if (sharpenTimerRef.current !== null) {
        window.clearTimeout(sharpenTimerRef.current);
      }
      if (bokehTimerRef.current !== null) {
        window.clearTimeout(bokehTimerRef.current);
      }
    };
  }, []);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (file: File) => {
    setErrorMessage(null);
    try {
      const processed = await processSelfieFile(file);
      maskCacheRef.current = null;
      setSourcePortrait(processed);
      setCritique(null);
      setActiveTakeId(null);
      const anchor = await detectFacialAlignmentLocally(processed.dataUrl);
      setDetectedAnchor(anchor);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to load the selected photograph.'
      );
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileSelected(file);
    }
    e.target.value = '';
  };

  const handleStyleSelect = (styleId: StyleId) => {
    const preset = getStyleById(styleId);
    setConfig((prev) => ({
      ...prev,
      styleId,
      lightingId: preset.defaultLighting,
      backdropBlur: preset.defaultRecipe.backdropBlur ?? prev.backdropBlur,
    }));
  };

  const handleSelectStyleFromLookbook = (styleId: StyleId) => {
    handleStyleSelect(styleId);
    const studioEl = document.getElementById('studio');
    studioEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleAnalyzeSelfie = async () => {
    if (!sourcePortrait || isAnalyzing) return;
    setErrorMessage(null);
    setIsAnalyzing(true);
    try {
      const apiCritique = await safePostJson<SelfieCritique>('/api/headshots/analyze', {
        sourceBase64: sourcePortrait.base64,
        sourceMimeType: sourcePortrait.mimeType,
      });
      if (apiCritique) {
        setCritique(apiCritique);
      } else {
        const localCritique = await analyzeSelfieLocally(sourcePortrait.dataUrl);
        setCritique(localCritique);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Lighting analysis failed. Please try again.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyCritique = () => {
    if (!critique) return;
    setConfig((prev) => ({
      ...prev,
      styleId: critique.recommendedStyleId,
      attireId: critique.recommendedAttireId,
      framingId: critique.recommendedFramingId,
      smartCrop: false,
      lightingId: critique.recommendedLightingId,
    }));
  };

  const getOrComputeMasks = async (
    sourceDataUrl: string,
    anchor: FramingAnchor
  ): Promise<SegmentationMasks> => {
    if (maskCacheRef.current?.sourceDataUrl === sourceDataUrl) {
      return maskCacheRef.current.masks;
    }
    const masks = await segmentSelfie(sourceDataUrl, anchor);
    maskCacheRef.current = { sourceDataUrl, masks };
    return masks;
  };

  const handleGenerateHeadshot = async () => {
    if (isGenerating) return;
    if (!sourcePortrait) {
      openFilePicker();
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);

    try {
      setGenerationPhase('Calibrating facial framing & light');

      const planData = await safePostJson<{
        anchor?: FramingAnchor;
        recipe?: DarkroomRecipe;
        directorNote?: string;
      }>('/api/headshots/plan', {
        sourceBase64: sourcePortrait.base64,
        sourceMimeType: sourcePortrait.mimeType,
        styleId: config.styleId,
        attireId: config.attireId,
        framingId: config.framingId,
        smartCrop: config.smartCrop,
        detectedAnchor,
        lightingId: config.lightingId,
        advancedLightingPreset: config.advancedLightingPreset,
        subjectProfile: config.subjectProfile,
        backdropBlur: config.backdropBlur,
        aspectRatio: config.aspectRatio,
        extraNotes: config.extraNotes,
      });

      let anchor: FramingAnchor = detectedAnchor ?? DEFAULT_ANCHOR;
      let recipe: DarkroomRecipe = buildDefaultRecipe(config);
      let directorNote: string | undefined;

      if (planData?.anchor && planData?.recipe) {
        anchor = planData.anchor;
        recipe = applyAdvancedLightingPreset(planData.recipe, config.advancedLightingPreset);
        directorNote = planData.directorNote;
      } else {
        const localPlan = await planFramingLocally(sourcePortrait.dataUrl, config);
        anchor = localPlan.anchor;
        recipe = applyAdvancedLightingPreset(localPlan.recipe, config.advancedLightingPreset);
        directorNote = localPlan.directorNote;
      }

      // Sync refined vision-detected anchor & apply Smart Crop optics consistently
      setDetectedAnchor(anchor);
      if (config.smartCrop) {
        const suggestion = suggestSmartCrop(anchor, config.aspectRatio);
        const profileBias = getSubjectProfileById(config.subjectProfile).verticalBias;
        recipe = {
          ...recipe,
          framingId: suggestion.framingId,
          zoomAdjust: suggestion.zoomAdjust,
          verticalOffset: Math.max(-0.15, Math.min(0.15, suggestion.verticalOffset + profileBias)),
          smartCrop: true,
        };
      }

      setGenerationPhase('Isolating portrait silhouette');
      const masks = await getOrComputeMasks(sourcePortrait.dataUrl, anchor);

      setGenerationPhase('Relighting & developing studio plate');
      const { imageUrl, alignedSourceUrl } = await renderStudioHeadshot(
        sourcePortrait.dataUrl,
        masks,
        recipe,
        anchor
      );

      const resolvedLightingLabel =
        recipe.advancedLightingPreset && recipe.advancedLightingPreset !== 'none'
          ? getAdvancedLightingPresetById(recipe.advancedLightingPreset).label
          : getLightingById(recipe.lightingId).label;

      frameCounterRef.current += 1;
      const newTake: GeneratedTake = {
        id: `take-${Date.now()}-${frameCounterRef.current}`,
        frameNumber: frameCounterRef.current,
        imageUrl,
        baseImageUrl: imageUrl,
        sourceImageUrl: sourcePortrait.dataUrl,
        alignedSourceUrl,
        styleId: recipe.styleId,
        styleName: getStyleById(recipe.styleId).name,
        attireLabel: getAttireById(recipe.attireId).label,
        framingLabel: getFramingById(recipe.framingId).label,
        lightingLabel: resolvedLightingLabel,
        aspectRatio: recipe.aspectRatio,
        recipe,
        anchor,
        directorNote,
        createdAt: Date.now(),
      };

      setTakes((prev) => [newTake, ...prev]);
      setActiveTakeId(newTake.id);
      setSliderPosition(50);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to develop headshot right now.'
      );
    } finally {
      setIsGenerating(false);
      setGenerationPhase('');
    }
  };

  const handleApplyRetouch = async (overridePrompt?: string) => {
    if (isGenerating || !activeTake) return;
    const promptText = (overridePrompt ?? retouchPrompt).trim();
    if (!promptText) return;

    setErrorMessage(null);
    setIsGenerating(true);

    try {
      setGenerationPhase('Interpreting darkroom retouching note');
      const apiRetouch = await safePostJson<{
        recipe?: DarkroomRecipe;
        directorNote?: string;
      }>('/api/headshots/retouch-recipe', {
        retouchPrompt: promptText,
        currentRecipe: activeTake.recipe,
      });

      const resolved =
        apiRetouch?.recipe
          ? { recipe: apiRetouch.recipe, directorNote: apiRetouch.directorNote }
          : applyRetouchLocally(promptText, activeTake.recipe);

      const nextRecipe: DarkroomRecipe = resolved.recipe;
      const directorNote: string | undefined = resolved.directorNote
        ? String(resolved.directorNote)
        : undefined;

      setGenerationPhase('Re-exposing studio plate');
      const masks = await getOrComputeMasks(activeTake.sourceImageUrl, activeTake.anchor);
      const targetSharpen = nextRecipe.sharpen ?? 0;
      const { imageUrl: cleanBaseUrl, alignedSourceUrl } = await renderStudioHeadshot(
        activeTake.sourceImageUrl,
        masks,
        { ...nextRecipe, sharpen: 0 },
        activeTake.anchor
      );
      const finalImageUrl =
        targetSharpen > 0.005
          ? await applyLocalUnsharpMask(cleanBaseUrl, targetSharpen)
          : cleanBaseUrl;

      // Keep direction controls aligned with any backdrop/attire/lighting changes made via retouching
      setConfig((prev) => ({
        ...prev,
        styleId: nextRecipe.styleId,
        attireId: nextRecipe.attireId,
        framingId: nextRecipe.framingId,
        smartCrop: Boolean(nextRecipe.smartCrop),
        lightingId: nextRecipe.lightingId,
        backdropBlur: Math.round(nextRecipe.backdropBlur),
      }));

      frameCounterRef.current += 1;
      const newTake: GeneratedTake = {
        id: `take-${Date.now()}-${frameCounterRef.current}`,
        frameNumber: frameCounterRef.current,
        imageUrl: finalImageUrl,
        baseImageUrl: cleanBaseUrl,
        sourceImageUrl: activeTake.sourceImageUrl,
        alignedSourceUrl,
        styleId: nextRecipe.styleId,
        styleName: getStyleById(nextRecipe.styleId).name,
        attireLabel: getAttireById(nextRecipe.attireId).label,
        framingLabel: getFramingById(nextRecipe.framingId).label,
        lightingLabel: getLightingById(nextRecipe.lightingId).label,
        aspectRatio: nextRecipe.aspectRatio,
        recipe: nextRecipe,
        anchor: activeTake.anchor,
        retouchPrompt: promptText,
        directorNote,
        createdAt: Date.now(),
      };

      setTakes((prev) => [newTake, ...prev]);
      setActiveTakeId(newTake.id);
      setSliderPosition(50);
      setRetouchPrompt('');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to apply retouching right now.'
      );
    } finally {
      setIsGenerating(false);
      setGenerationPhase('');
    }
  };

  const handleBulkRetouch = async (rawPrompts: string[]): Promise<boolean> => {
    if (isGenerating || !activeTake) return false;

    const uniquePrompts: string[] = [];
    const seen = new Set<string>();
    for (const raw of rawPrompts) {
      const cleaned = raw.trim();
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniquePrompts.push(cleaned);
      if (uniquePrompts.length >= 6) break;
    }

    if (uniquePrompts.length === 0) return false;

    const baseTake = activeTake;
    const total = uniquePrompts.length;
    let completedCount = 0;

    setErrorMessage(null);
    setIsGenerating(true);
    setBulkRetouchProgress({ completed: 0, total });
    setGenerationPhase(`Developing ${total} retouch variations in parallel`);

    try {
      // Reuse or compute segmentation mask once so all parallel variations stay crisp and fast
      const masks = await getOrComputeMasks(baseTake.sourceImageUrl, baseTake.anchor);

      const settled = await Promise.allSettled(
        uniquePrompts.map(async (promptText, index) => {
          const apiRetouch = await safePostJson<{
            recipe?: DarkroomRecipe;
            directorNote?: string;
          }>('/api/headshots/retouch-recipe', {
            retouchPrompt: promptText,
            currentRecipe: baseTake.recipe,
          });

          const resolved =
            apiRetouch?.recipe
              ? { recipe: apiRetouch.recipe, directorNote: apiRetouch.directorNote }
              : applyRetouchLocally(promptText, baseTake.recipe);

          const nextRecipe: DarkroomRecipe = resolved.recipe;
          const directorNote: string | undefined = resolved.directorNote
            ? String(resolved.directorNote)
            : undefined;

          const targetSharpen = nextRecipe.sharpen ?? 0;
          const { imageUrl: cleanBaseUrl, alignedSourceUrl } = await renderStudioHeadshot(
            baseTake.sourceImageUrl,
            masks,
            { ...nextRecipe, sharpen: 0 },
            baseTake.anchor
          );
          const finalImageUrl =
            targetSharpen > 0.005
              ? await applyLocalUnsharpMask(cleanBaseUrl, targetSharpen)
              : cleanBaseUrl;

          completedCount += 1;
          setBulkRetouchProgress({ completed: completedCount, total });
          setGenerationPhase(`Developed ${completedCount} of ${total} variations in parallel`);

          return {
            index,
            promptText,
            nextRecipe,
            directorNote,
            cleanBaseUrl,
            finalImageUrl,
            alignedSourceUrl,
          };
        })
      );

      const successes = settled
        .filter(
          (
            result
          ): result is PromiseFulfilledResult<{
            index: number;
            promptText: string;
            nextRecipe: DarkroomRecipe;
            directorNote: string | undefined;
            cleanBaseUrl: string;
            finalImageUrl: string;
            alignedSourceUrl: string;
          }> => result.status === 'fulfilled'
        )
        .map((result) => result.value)
        .sort((a, b) => a.index - b.index);

      if (successes.length === 0) {
        setErrorMessage('Unable to develop the queued retouch variations. Please try again.');
        return false;
      }

      const now = Date.now();
      const createdTakes: GeneratedTake[] = successes.map((item, offset) => {
        frameCounterRef.current += 1;
        const resolvedLightingLabel =
          item.nextRecipe.advancedLightingPreset && item.nextRecipe.advancedLightingPreset !== 'none'
            ? getAdvancedLightingPresetById(item.nextRecipe.advancedLightingPreset).label
            : getLightingById(item.nextRecipe.lightingId).label;

        return {
          id: `take-${now}-${frameCounterRef.current}`,
          frameNumber: frameCounterRef.current,
          imageUrl: item.finalImageUrl,
          baseImageUrl: item.cleanBaseUrl,
          sourceImageUrl: baseTake.sourceImageUrl,
          alignedSourceUrl: item.alignedSourceUrl,
          styleId: item.nextRecipe.styleId,
          styleName: getStyleById(item.nextRecipe.styleId).name,
          attireLabel: getAttireById(item.nextRecipe.attireId).label,
          framingLabel: getFramingById(item.nextRecipe.framingId).label,
          lightingLabel: resolvedLightingLabel,
          aspectRatio: item.nextRecipe.aspectRatio,
          recipe: item.nextRecipe,
          anchor: baseTake.anchor,
          retouchPrompt: item.promptText,
          directorNote: item.directorNote,
          createdAt: now + offset,
        };
      });

      const newestTake = createdTakes[createdTakes.length - 1];
      setTakes((prev) => [...[...createdTakes].reverse(), ...prev]);
      setActiveTakeId(newestTake.id);
      setSliderPosition(50);
      setConfig((prev) => ({
        ...prev,
        styleId: newestTake.recipe.styleId,
        attireId: newestTake.recipe.attireId,
        framingId: newestTake.recipe.framingId,
        smartCrop: Boolean(newestTake.recipe.smartCrop),
        lightingId: newestTake.recipe.lightingId,
        advancedLightingPreset: newestTake.recipe.advancedLightingPreset ?? 'none',
        backdropBlur: Math.round(newestTake.recipe.backdropBlur),
      }));
      // Open Session History so all newly generated parallel takes are immediately visible
      setRightPanelMode('history');

      if (successes.length < total) {
        setErrorMessage(
          `Completed ${successes.length} of ${total} retouch variations; ${
            total - successes.length
          } failed to render.`
        );
      }
      return true;
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to run bulk retouching right now.'
      );
      return false;
    } finally {
      setIsGenerating(false);
      setGenerationPhase('');
      setBulkRetouchProgress(null);
    }
  };

  const handleAutoSuggestRetouches = async () => {
    if (!activeTake || isGenerating || isSuggestingRetouches) return;
    const targetTakeId = activeTake.id;
    const previousSuggestions = autoSuggestionsByTakeId[targetTakeId] ?? [];

    setSuggestRetouchError(null);
    setIsSuggestingRetouches(true);
    try {
      const response = await fetch('/api/headshots/suggest-retouches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleName: activeTake.styleName,
          attireLabel: activeTake.attireLabel,
          framingLabel: activeTake.framingLabel,
          lightingLabel: activeTake.lightingLabel,
          aspectRatio: activeTake.aspectRatio,
          recipe: activeTake.recipe,
          retouchPrompt: activeTake.retouchPrompt,
          directorNote: activeTake.directorNote,
          previousSuggestions,
        }),
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(
          'AI Auto-Suggest requires the studio server API and is unavailable in static-only preview.'
        );
      }

      const payload = (await response.json()) as {
        suggestions?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || 'Unable to generate retouching suggestions right now.'
        );
      }

      if (!Array.isArray(payload.suggestions) || payload.suggestions.length === 0) {
        throw new Error('No retouching suggestions were returned. Try again.');
      }

      setAutoSuggestionsByTakeId((prev) => ({
        ...prev,
        [targetTakeId]: payload.suggestions!,
      }));
    } catch (err) {
      setSuggestRetouchError(
        err instanceof Error
          ? err.message
          : 'Unable to generate retouching suggestions right now.'
      );
    } finally {
      setIsSuggestingRetouches(false);
    }
  };

  const handleSelectTake = (id: string) => {
    setActiveTakeId(id);
    setSuggestRetouchError(null);
    const found = takes.find((t) => t.id === id);
    if (found) {
      setConfig((prev) => ({
        ...prev,
        styleId: found.recipe.styleId,
        attireId: found.recipe.attireId,
        framingId: found.recipe.framingId,
        smartCrop: Boolean(found.recipe.smartCrop),
        lightingId: found.recipe.lightingId,
        advancedLightingPreset: found.recipe.advancedLightingPreset ?? 'none',
        aspectRatio: found.recipe.aspectRatio,
        backdropBlur: Math.round(found.recipe.backdropBlur),
      }));
    }
  };

  const handleInspectTake = (id: string) => {
    handleSelectTake(id);
    setLightboxOpen(true);
  };

  const handleToggleHistoryPanel = () => {
    setRightPanelMode((prev) => {
      const next = prev === 'history' ? 'direction' : 'history';
      if (next === 'history' && window.innerWidth < 1024) {
        window.requestAnimationFrame(() => {
          rightPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return next;
    });
  };

  const handleRemoveTake = (id: string) => {
    setTakes((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activeTakeId === id) {
        setActiveTakeId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleSharpenChange = (intensity: number) => {
    if (!activeTake || isGenerating) return;
    const clamped = Math.max(0, Math.min(1, intensity));
    const targetId = activeTake.id;
    const baseUrl = activeTake.baseImageUrl ?? activeTake.imageUrl;

    // Update slider readout & recipe immediately for responsive control feel
    setTakes((prev) =>
      prev.map((item) =>
        item.id === targetId
          ? {
              ...item,
              baseImageUrl: item.baseImageUrl ?? item.imageUrl,
              imageUrl: clamped <= 0.005 ? baseUrl : item.imageUrl,
              recipe: { ...item.recipe, sharpen: clamped },
            }
          : item
      )
    );

    if (sharpenTimerRef.current !== null) {
      window.clearTimeout(sharpenTimerRef.current);
      sharpenTimerRef.current = null;
    }

    const jobId = ++sharpenJobRef.current;
    if (clamped <= 0.005) {
      setIsSharpening(false);
      return;
    }

    setIsSharpening(true);
    sharpenTimerRef.current = window.setTimeout(() => {
      sharpenTimerRef.current = null;
      void applyLocalUnsharpMask(baseUrl, clamped)
        .then((sharpenedUrl) => {
          if (sharpenJobRef.current !== jobId) return;
          setTakes((prev) =>
            prev.map((item) =>
              item.id === targetId
                ? {
                    ...item,
                    baseImageUrl: baseUrl,
                    imageUrl: sharpenedUrl,
                    recipe: { ...item.recipe, sharpen: clamped },
                  }
                : item
            )
          );
        })
        .catch(() => {
          if (sharpenJobRef.current !== jobId) return;
          setErrorMessage('Unable to apply unsharp masking on this frame.');
        })
        .finally(() => {
          if (sharpenJobRef.current === jobId) {
            setIsSharpening(false);
          }
        });
    }, 40);
  };

  const handleBackdropBlurChange = (blurPx: number) => {
    const clamped = Math.max(0, Math.min(20, Math.round(blurPx)));
    setConfig((prev) => ({ ...prev, backdropBlur: clamped }));

    if (!activeTake || isGenerating) return;
    const targetTake = activeTake;
    const targetId = targetTake.id;

    setTakes((prev) =>
      prev.map((item) =>
        item.id === targetId
          ? { ...item, recipe: { ...item.recipe, backdropBlur: clamped } }
          : item
      )
    );

    if (bokehTimerRef.current !== null) {
      window.clearTimeout(bokehTimerRef.current);
      bokehTimerRef.current = null;
    }

    const jobId = ++bokehJobRef.current;
    setIsUpdatingBokeh(true);

    bokehTimerRef.current = window.setTimeout(() => {
      bokehTimerRef.current = null;
      const updatedRecipe: DarkroomRecipe = {
        ...targetTake.recipe,
        backdropBlur: clamped,
      };
      const targetSharpen = updatedRecipe.sharpen ?? 0;

      void getOrComputeMasks(targetTake.sourceImageUrl, targetTake.anchor)
        .then((masks) =>
          renderStudioHeadshot(
            targetTake.sourceImageUrl,
            masks,
            { ...updatedRecipe, sharpen: 0 },
            targetTake.anchor
          )
        )
        .then(async ({ imageUrl: cleanBaseUrl, alignedSourceUrl }) => {
          const finalImageUrl =
            targetSharpen > 0.005
              ? await applyLocalUnsharpMask(cleanBaseUrl, targetSharpen)
              : cleanBaseUrl;
          if (bokehJobRef.current !== jobId) return;
          setTakes((prev) =>
            prev.map((item) =>
              item.id === targetId
                ? {
                    ...item,
                    baseImageUrl: cleanBaseUrl,
                    imageUrl: finalImageUrl,
                    alignedSourceUrl,
                    recipe: { ...item.recipe, backdropBlur: clamped },
                  }
                : item
            )
          );
        })
        .catch(() => {
          if (bokehJobRef.current !== jobId) return;
          setErrorMessage('Unable to update background bokeh depth on this frame.');
        })
        .finally(() => {
          if (bokehJobRef.current === jobId) {
            setIsUpdatingBokeh(false);
          }
        });
    }, 65);
  };

  const handleDownloadTake = (take: GeneratedTake) => {
    downloadPortrait(take.imageUrl, take.frameNumber, take.styleName, buildTakeExifMetadata(take));
  };

  const handleStepActiveTake = (delta: -1 | 1) => {
    if (takes.length < 2) return;
    const currentIndex = takes.findIndex((t) => t.id === activeTakeId);
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (baseIndex + delta + takes.length) % takes.length;
    handleSelectTake(takes[nextIndex].id);
  };

  useStudioShortcuts({
    canCompare: Boolean(activeTake && activeTake.sourceImageUrl),
    canGenerate: !isGenerating,
    hasActiveTake: Boolean(activeTake),
    hasMultipleTakes: takes.length > 1,
    isLightboxOpen: lightboxOpen,
    isShortcutsModalOpen: shortcutsModalOpen,
    onToggleSplitCompare: () => {
      setSliderPosition((prev) => (prev > 5 && prev < 95 ? 0 : 50));
    },
    onToggleOriginalCompare: () => {
      setSliderPosition((prev) => (prev >= 95 ? 0 : 100));
    },
    onGenerate: () => {
      void handleGenerateHeadshot();
    },
    onToggleHistory: handleToggleHistoryPanel,
    onStepTake: handleStepActiveTake,
    onToggleInspect: () => {
      if (activeTake) {
        setLightboxOpen((prev) => !prev);
      }
    },
    onDownloadActive: () => {
      if (activeTake) {
        handleDownloadTake(activeTake);
      }
    },
    onToggleShortcutsModal: () => setShortcutsModalOpen((prev) => !prev),
    onCloseShortcutsModal: () => setShortcutsModalOpen(false),
  });

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F5F1E8]">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileInputChange}
        className="hidden"
        aria-hidden="true"
      />

      <TopBar onUploadClick={openFilePicker} hasReelItems={takes.length > 0} />

      <main id="studio" className="mx-auto max-w-[1400px] px-5 pt-8 pb-24 sm:px-8 sm:pt-10">
        {/* Compact Editorial Masthead */}
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-7 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#F5F1E8] sm:text-5xl">
              Editorial headshots from a single selfie
            </h1>
            <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-[#9B968C] sm:text-[15px]">
              Upload a casual portrait, choose a studio backdrop, dial in wardrobe tone, lens
              framing, and directional lighting, then refine any frame with natural-language
              retouching—completely free and private to your session.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#9B968C]">
            <span>6 Studio Backdrop Plates</span>
            <span aria-hidden="true">·</span>
            <span>On-Device Neural Cutout</span>
            <span aria-hidden="true">·</span>
            <span>100% Free Unlimited Exports</span>
          </div>
        </div>

        {/* Inline Error Recovery Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-amber-400/30 bg-amber-950/30 px-4 py-3.5 text-sm text-[#F5F1E8]"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A853]"
                aria-hidden="true"
              />
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="Dismiss error"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/10 hover:text-[#F5F1E8] cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Two-Column Darkroom Workbench */}
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <ComparisonStage
              sourcePortrait={sourcePortrait}
              activeTake={activeTake}
              selectedStyle={selectedStyle}
              critique={critique}
              detectedAnchor={detectedAnchor}
              currentLightingId={config.lightingId}
              currentAdvancedLightingPreset={config.advancedLightingPreset}
              sliderPosition={sliderPosition}
              isGenerating={isGenerating}
              generationPhase={generationPhase}
              isAnalyzing={isAnalyzing}
              elapsedSeconds={elapsedSeconds}
              takesCount={takes.length}
              isHistoryOpen={rightPanelMode === 'history'}
              onSliderChange={setSliderPosition}
              onToggleHistory={handleToggleHistoryPanel}
              onFileSelected={(file) => void handleFileSelected(file)}
              onOpenFilePicker={openFilePicker}
              onAnalyzeSelfie={() => void handleAnalyzeSelfie()}
              onApplyRecommendedLighting={(lightingId, advancedLightingPreset) =>
                setConfig((prev) => ({
                  ...prev,
                  lightingId,
                  advancedLightingPreset,
                }))
              }
              onInspect={() => setLightboxOpen(true)}
              onDownload={handleDownloadTake}
            />

            <RetouchPromptBar
              activeTake={activeTake}
              critique={critique}
              promptValue={retouchPrompt}
              sharpenIntensity={activeTake?.recipe.sharpen ?? 0}
              autoSuggestions={activeTake ? autoSuggestionsByTakeId[activeTake.id] ?? [] : []}
              isGenerating={isGenerating}
              isSharpening={isSharpening}
              isSuggesting={isSuggestingRetouches}
              bulkProgress={bulkRetouchProgress}
              suggestError={suggestRetouchError}
              onPromptChange={setRetouchPrompt}
              onSubmitPrompt={(custom) => void handleApplyRetouch(custom)}
              onRunBulkRetouch={handleBulkRetouch}
              onAutoSuggest={() => void handleAutoSuggestRetouches()}
              onSharpenChange={handleSharpenChange}
            />
          </div>

          <div className="lg:col-span-5">
            <aside
              ref={rightPanelRef}
              aria-label={
                rightPanelMode === 'history'
                  ? 'Session headshot history panel'
                  : 'Studio direction controls'
              }
              className="flex flex-col gap-5 rounded-xl border border-white/[0.08] bg-[#141416] p-5 sm:p-6"
            >
              {/* Workbench Mode Switcher: Studio Direction / Session History */}
              <div
                role="tablist"
                aria-label="Workbench panel view"
                className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.08] bg-[#0B0B0C] p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightPanelMode === 'direction'}
                  onClick={() => setRightPanelMode('direction')}
                  className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                    rightPanelMode === 'direction'
                      ? 'bg-[#26262B] text-[#F5F1E8]'
                      : 'text-[#9B968C] hover:text-[#F5F1E8]'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Direction</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightPanelMode === 'history'}
                  onClick={() => setRightPanelMode('history')}
                  className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                    rightPanelMode === 'history'
                      ? 'bg-[#26262B] text-[#F5F1E8]'
                      : 'text-[#9B968C] hover:text-[#F5F1E8]'
                  }`}
                >
                  <History
                    className={`h-3.5 w-3.5 shrink-0 ${
                      rightPanelMode === 'history' ? 'text-[#D4A853]' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span>History</span>
                  {takes.length > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-[#D4A853]">
                      {takes.length}
                    </span>
                  )}
                </button>
              </div>

              {rightPanelMode === 'history' ? (
                <HistoryViewPanel
                  takes={takes}
                  activeTakeId={activeTakeId}
                  hasSourcePortrait={Boolean(sourcePortrait)}
                  onSelectTake={handleSelectTake}
                  onInspectTake={handleInspectTake}
                  onDownloadTake={handleDownloadTake}
                  onRemoveTake={handleRemoveTake}
                  onReturnToDirection={() => setRightPanelMode('direction')}
                  onUploadClick={openFilePicker}
                />
              ) : (
                <DirectionPanel
                  config={config}
                  sourcePortrait={sourcePortrait}
                  critique={critique}
                  smartCropSuggestion={smartCropSuggestion}
                  isGenerating={isGenerating}
                  isAnalyzing={isAnalyzing}
                  isUpdatingBokeh={isUpdatingBokeh}
                  onStyleSelect={handleStyleSelect}
                  onAttireSelect={(attireId: AttireId) =>
                    setConfig((prev) => ({ ...prev, attireId }))
                  }
                  onFramingSelect={(framingId: FramingId) =>
                    setConfig((prev) => ({ ...prev, framingId, smartCrop: false }))
                  }
                  onSmartCropToggle={(enabled: boolean) =>
                    setConfig((prev) => ({
                      ...prev,
                      smartCrop: enabled,
                      framingId:
                        enabled && smartCropSuggestion
                          ? smartCropSuggestion.framingId
                          : prev.framingId,
                    }))
                  }
                  onLightingSelect={(lightingId: LightingId) =>
                    setConfig((prev) => ({
                      ...prev,
                      lightingId,
                      advancedLightingPreset: 'none',
                    }))
                  }
                  onAdvancedLightingSelect={(presetId: AdvancedLightingPresetId) => {
                    const preset = getAdvancedLightingPresetById(presetId);
                    setConfig((prev) => ({
                      ...prev,
                      advancedLightingPreset: preset.id,
                      lightingId: preset.targetLightingId ?? prev.lightingId,
                    }));
                  }}
                  onSubjectProfileSelect={(subjectProfile: SubjectProfileId) =>
                    setConfig((prev) => ({ ...prev, subjectProfile }))
                  }
                  onBackdropBlurChange={handleBackdropBlurChange}
                  onAspectRatioSelect={(aspectRatio: AspectRatioOption) =>
                    setConfig((prev) => ({ ...prev, aspectRatio }))
                  }
                  onExtraNotesChange={(extraNotes: string) =>
                    setConfig((prev) => ({ ...prev, extraNotes }))
                  }
                  onApplyCritique={handleApplyCritique}
                  onGenerate={() => void handleGenerateHeadshot()}
                  onUploadClick={openFilePicker}
                />
              )}
            </aside>
          </div>
        </div>

        {/* Session Darkroom Reel */}
        <DarkroomReel
          takes={takes}
          activeTakeId={activeTakeId}
          onSelectTake={handleSelectTake}
          onDownloadTake={handleDownloadTake}
          onRemoveTake={handleRemoveTake}
        />

        {/* Editorial Style Lookbook & Capture Guide */}
        <StyleLookbookSection
          selectedStyleId={config.styleId}
          onSelectStyleFromLookbook={handleSelectStyleFromLookbook}
        />
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-white/[0.08] py-8">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-4 px-5 text-xs text-[#9B968C] sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-3">
            <span className="font-serif text-base font-semibold text-[#F5F1E8]">Sable Studio</span>
            <span aria-hidden="true">·</span>
            <span>Editorial Darkroom Portrait Studio</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#studio" className="transition-colors hover:text-[#F5F1E8]">
              Studio
            </a>
            <a href="#lookbook" className="transition-colors hover:text-[#F5F1E8]">
              Lookbook
            </a>
            <a href="#guide" className="transition-colors hover:text-[#F5F1E8]">
              Capture Guide
            </a>
            <button
              type="button"
              onClick={() => setShortcutsModalOpen(true)}
              className="transition-colors hover:text-[#F5F1E8] whitespace-nowrap cursor-pointer"
            >
              Shortcuts <span className="font-mono text-[#D4A853]">?</span>
            </button>
          </div>
        </div>
      </footer>

      <PortraitLightbox
        take={lightboxOpen ? activeTake : null}
        onClose={() => setLightboxOpen(false)}
        onDownload={handleDownloadTake}
      />

      <ShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </div>
  );
}
