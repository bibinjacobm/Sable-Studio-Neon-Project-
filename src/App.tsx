import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import {
  buildDefaultRecipe,
  getAttireById,
  getFramingById,
  getLightingById,
  getStyleById,
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
} from './data/studioCatalog';
import { TopBar } from './components/TopBar';
import { ComparisonStage, type CompareViewMode } from './components/ComparisonStage';
import { RetouchPromptBar } from './components/RetouchPromptBar';
import { DirectionPanel } from './components/DirectionPanel';
import { DarkroomReel } from './components/DarkroomReel';
import { StyleLookbookSection } from './components/StyleLookbookSection';
import { PortraitLightbox } from './components/PortraitLightbox';
import { downloadPortrait, processSelfieFile } from './utils/imageProcessing';
import {
  renderStudioHeadshot,
  segmentSelfie,
  type SegmentationMasks,
} from './utils/darkroomEngine';
import {
  analyzeSelfieLocally,
  applyRetouchLocally,
  planFramingLocally,
  safePostJson,
} from './utils/localDarkroomAi';

const INITIAL_CONFIG: StudioDirectionConfig = {
  styleId: 'corporate-grey',
  attireId: 'charcoal-blazer',
  framingId: 'head-shoulders',
  lightingId: 'softbox-key',
  aspectRatio: '3:4',
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

  const [compareMode, setCompareMode] = useState<CompareViewMode>('after');
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [retouchPrompt, setRetouchPrompt] = useState<string>('');
  const [critique, setCritique] = useState<SelfieCritique | null>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationPhase, setGenerationPhase] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);

  const frameCounterRef = useRef<number>(0);

  const selectedStyle = useMemo(() => getStyleById(config.styleId), [config.styleId]);
  const activeTake = useMemo(
    () => takes.find((t) => t.id === activeTakeId) ?? null,
    [takes, activeTakeId]
  );

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
        lightingId: config.lightingId,
        aspectRatio: config.aspectRatio,
        extraNotes: config.extraNotes,
      });

      let anchor: FramingAnchor = DEFAULT_ANCHOR;
      let recipe: DarkroomRecipe = buildDefaultRecipe(config);
      let directorNote: string | undefined;

      if (planData?.anchor && planData?.recipe) {
        anchor = planData.anchor;
        recipe = planData.recipe;
        directorNote = planData.directorNote;
      } else {
        const localPlan = await planFramingLocally(sourcePortrait.dataUrl, config);
        anchor = localPlan.anchor;
        recipe = localPlan.recipe;
        directorNote = localPlan.directorNote;
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

      frameCounterRef.current += 1;
      const newTake: GeneratedTake = {
        id: `take-${Date.now()}-${frameCounterRef.current}`,
        frameNumber: frameCounterRef.current,
        imageUrl,
        sourceImageUrl: sourcePortrait.dataUrl,
        alignedSourceUrl,
        styleId: recipe.styleId,
        styleName: getStyleById(recipe.styleId).name,
        attireLabel: getAttireById(recipe.attireId).label,
        framingLabel: getFramingById(recipe.framingId).label,
        lightingLabel: getLightingById(recipe.lightingId).label,
        aspectRatio: recipe.aspectRatio,
        recipe,
        anchor,
        directorNote,
        createdAt: Date.now(),
      };

      setTakes((prev) => [newTake, ...prev]);
      setActiveTakeId(newTake.id);
      setCompareMode('after');
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
      const { imageUrl, alignedSourceUrl } = await renderStudioHeadshot(
        activeTake.sourceImageUrl,
        masks,
        nextRecipe,
        activeTake.anchor
      );

      // Keep direction controls aligned with any backdrop/attire/lighting changes made via retouching
      setConfig((prev) => ({
        ...prev,
        styleId: nextRecipe.styleId,
        attireId: nextRecipe.attireId,
        framingId: nextRecipe.framingId,
        lightingId: nextRecipe.lightingId,
      }));

      frameCounterRef.current += 1;
      const newTake: GeneratedTake = {
        id: `take-${Date.now()}-${frameCounterRef.current}`,
        frameNumber: frameCounterRef.current,
        imageUrl,
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
      setCompareMode('after');
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

  const handleRemoveTake = (id: string) => {
    setTakes((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activeTakeId === id) {
        setActiveTakeId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleDownloadTake = (take: GeneratedTake) => {
    downloadPortrait(take.imageUrl, take.frameNumber, take.styleName);
  };

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
              compareMode={compareMode}
              sliderPosition={sliderPosition}
              isGenerating={isGenerating}
              generationPhase={generationPhase}
              isAnalyzing={isAnalyzing}
              elapsedSeconds={elapsedSeconds}
              onCompareModeChange={setCompareMode}
              onSliderChange={setSliderPosition}
              onFileSelected={(file) => void handleFileSelected(file)}
              onOpenFilePicker={openFilePicker}
              onAnalyzeSelfie={() => void handleAnalyzeSelfie()}
              onInspect={() => setLightboxOpen(true)}
              onDownload={handleDownloadTake}
            />

            <RetouchPromptBar
              activeTake={activeTake}
              critique={critique}
              promptValue={retouchPrompt}
              isGenerating={isGenerating}
              onPromptChange={setRetouchPrompt}
              onSubmitPrompt={(custom) => void handleApplyRetouch(custom)}
            />
          </div>

          <div className="lg:col-span-5">
            <DirectionPanel
              config={config}
              sourcePortrait={sourcePortrait}
              critique={critique}
              isGenerating={isGenerating}
              isAnalyzing={isAnalyzing}
              onStyleSelect={handleStyleSelect}
              onAttireSelect={(attireId: AttireId) =>
                setConfig((prev) => ({ ...prev, attireId }))
              }
              onFramingSelect={(framingId: FramingId) =>
                setConfig((prev) => ({ ...prev, framingId }))
              }
              onLightingSelect={(lightingId: LightingId) =>
                setConfig((prev) => ({ ...prev, lightingId }))
              }
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
          </div>
        </div>

        {/* Session Darkroom Reel */}
        <DarkroomReel
          takes={takes}
          activeTakeId={activeTakeId}
          onSelectTake={(id) => {
            setActiveTakeId(id);
            const found = takes.find((t) => t.id === id);
            if (found) {
              setCompareMode('after');
              setConfig((prev) => ({
                ...prev,
                styleId: found.recipe.styleId,
                attireId: found.recipe.attireId,
                framingId: found.recipe.framingId,
                lightingId: found.recipe.lightingId,
                aspectRatio: found.recipe.aspectRatio,
              }));
            }
          }}
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
          </div>
        </div>
      </footer>

      <PortraitLightbox
        take={lightboxOpen ? activeTake : null}
        onClose={() => setLightboxOpen(false)}
        onDownload={handleDownloadTake}
      />
    </div>
  );
}
