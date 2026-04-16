import { EditorView } from '@codemirror/view';
import { unifiedMergeView } from '@codemirror/merge';
import type { Extension } from '@codemirror/state';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBackendFetch } from '../../../hooks/useBackendApi';
import { useCodeEditorDocument } from '../hooks/useCodeEditorDocument';
import { useCodeEditorSettings } from '../hooks/useCodeEditorSettings';
import { useEditorKeyboardShortcuts } from '../hooks/useEditorKeyboardShortcuts';
import type { CodeEditorFile } from '../types/types';
import { createMinimapExtension, createScrollToFirstChunkExtension, getLanguageExtensions } from '../utils/editorExtensions';
import { getEditorStyles } from '../utils/editorStyles';
import { createEditorToolbarPanelExtension } from '../utils/editorToolbarPanel';
import CodeEditorFooter from './subcomponents/CodeEditorFooter';
import CodeEditorHeader from './subcomponents/CodeEditorHeader';
import CodeEditorLoadingState from './subcomponents/CodeEditorLoadingState';
import CodeEditorSurface from './subcomponents/CodeEditorSurface';
import CodeEditorBinaryFile from './subcomponents/CodeEditorBinaryFile';

type CodeEditorProps = {
  file: CodeEditorFile;
  onClose: () => void;
  projectPath?: string;
  isSidebar?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (() => void) | null;
  onPopOut?: (() => void) | null;
};

export default function CodeEditor({
  file,
  onClose,
  projectPath,
  isSidebar = false,
  isExpanded = false,
  onToggleExpand = null,
  onPopOut = null,
}: CodeEditorProps) {
  const { t } = useTranslation('codeEditor');
  const backendFetch = useBackendFetch();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDiff, setShowDiff] = useState(Boolean(file.diffInfo));
  const [markdownPreview, setMarkdownPreview] = useState(false);

  const {
    isDarkMode,
    wordWrap,
    minimapEnabled,
    showLineNumbers,
    fontSize,
  } = useCodeEditorSettings();

  const {
    content,
    setContent,
    loading,
    saving,
    saveSuccess,
    saveError,
    isBinary,
    handleSave,
    handleDownload,
  } = useCodeEditorDocument({
    file,
    projectPath,
  });

  const isMarkdownFile = useMemo(() => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension === 'md' || extension === 'markdown';
  }, [file.name]);

  const minimapExtension = useMemo(
    () => (
      createMinimapExtension({
        file,
        showDiff,
        minimapEnabled,
        isDarkMode,
      })
    ),
    [file, isDarkMode, minimapEnabled, showDiff],
  );

  const scrollToFirstChunkExtension = useMemo(
    () => createScrollToFirstChunkExtension({ file, showDiff }),
    [file, showDiff],
  );

  const toolbarPanelExtension = useMemo(
    () => (
      createEditorToolbarPanelExtension({
        file,
        showDiff,
        isSidebar,
        isExpanded,
        onToggleDiff: () => setShowDiff((previous) => !previous),
        onPopOut,
        onToggleExpand,
        labels: {
          changes: t('toolbar.changes'),
          previousChange: t('toolbar.previousChange'),
          nextChange: t('toolbar.nextChange'),
          hideDiff: t('toolbar.hideDiff'),
          showDiff: t('toolbar.showDiff'),
          collapse: t('toolbar.collapse'),
          expand: t('toolbar.expand'),
        },
      })
    ),
    [file, isExpanded, isSidebar, onPopOut, onToggleExpand, showDiff, t],
  );

  const extensions = useMemo(() => {
    const allExtensions: Extension[] = [
      ...getLanguageExtensions(file.name),
      ...toolbarPanelExtension,
    ];

    if (file.diffInfo && showDiff && file.diffInfo.old_string !== undefined) {
      allExtensions.push(
        unifiedMergeView({
          original: file.diffInfo.old_string,
          mergeControls: false,
          highlightChanges: true,
          syntaxHighlightDeletions: false,
          gutter: true,
        }),
      );
      allExtensions.push(...minimapExtension);
      allExtensions.push(...scrollToFirstChunkExtension);
    }

    if (wordWrap) {
      allExtensions.push(EditorView.lineWrapping);
    }

    return allExtensions;
  }, [
    file.diffInfo,
    file.name,
    minimapExtension,
    scrollToFirstChunkExtension,
    showDiff,
    toolbarPanelExtension,
    wordWrap,
  ]);

  // Image file detection — hooks must be before any conditional returns
  const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
  const isImageFile = IMAGE_EXTENSIONS.includes(fileExtension);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const objectUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isImageFile || !file.projectName) return;
    const controller = new AbortController();

    const loadImage = async () => {
      try {
        const response = await backendFetch(
          `/api/projects/${file.projectName}/files/content?path=${encodeURIComponent(file.path)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Failed to load');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setImageUrl(url);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setImageError(true);
      }
    };
    loadImage();
    return () => {
      controller.abort();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [isImageFile, file.projectName, file.path]);

  useEditorKeyboardShortcuts({
    onSave: handleSave,
    onClose,
    dependency: content,
  });

  // Escape key handler + body scroll lock for non-sidebar image modal
  // (must be before any conditional returns to satisfy rules-of-hooks)
  useEffect(() => {
    if (isSidebar || !isImageFile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isSidebar, isImageFile, onClose]);

  if (loading) {
    return (
      <CodeEditorLoadingState
        isDarkMode={isDarkMode}
        isSidebar={isSidebar}
        loadingText={t('loading', { fileName: file.name })}
      />
    );
  }

  if (isImageFile) {
    const imageContent = (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
        {imageUrl ? (
          <img src={imageUrl} alt={file.name} className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-md" />
        ) : imageError ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Unable to load image</p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading image...</p>
        )}
      </div>
    );

    if (isSidebar) {
      return (
        <div className="flex h-full w-full flex-col bg-background">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
            <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">{file.name}</h3>
            <div className="flex items-center gap-1">
              {imageUrl && (
                <button type="button" onClick={() => window.open(imageUrl, '_blank')} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title="Open in new tab">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </button>
              )}
              <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title="Close">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          {imageContent}
          <div className="border-t bg-gray-50 px-3 py-2 dark:bg-gray-800">
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{file.path}</p>
          </div>
        </div>
      );
    }

    return createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 md:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Image preview: ${file.name}`}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onKeyDown={() => {}}
      >
        <div className="flex h-full w-full flex-col bg-background shadow-2xl md:max-h-[80vh] md:max-w-4xl md:rounded-lg">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
            <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">{file.name}</h3>
            <div className="flex items-center gap-1">
              {imageUrl && (
                <button type="button" onClick={() => window.open(imageUrl, '_blank')} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title="Open in new tab">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </button>
              )}
              <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title="Close" aria-label="Close image preview">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          {imageContent}
          <div className="border-t bg-gray-50 px-3 py-2 dark:bg-gray-800">
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{file.path}</p>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // Binary file display
  if (isBinary) {
    return (
      <CodeEditorBinaryFile
        file={file}
        isSidebar={isSidebar}
        isFullscreen={isFullscreen}
        onClose={onClose}
        onToggleFullscreen={() => setIsFullscreen((previous) => !previous)}
        title={t('binaryFile.title', 'Binary File')}
        message={t('binaryFile.message', 'The file "{{fileName}}" cannot be displayed in the text editor because it is a binary file.', { fileName: file.name })}
      />
    );
  }

  const outerContainerClassName = isSidebar
    ? 'w-full h-full flex flex-col'
    : `fixed inset-0 z-[9999] md:bg-black/50 md:flex md:items-center md:justify-center md:p-4 ${isFullscreen ? 'md:p-0' : ''}`;

  const innerContainerClassName = isSidebar
    ? 'bg-background flex flex-col w-full h-full'
    : `bg-background shadow-2xl flex flex-col w-full h-full md:rounded-lg md:shadow-2xl${
      isFullscreen ? ' md:w-full md:h-full md:rounded-none' : ' md:w-full md:max-w-6xl md:h-[80vh] md:max-h-[80vh]'
    }`;

  return (
    <>
      <style>{getEditorStyles(isDarkMode)}</style>
      <div className={outerContainerClassName}>
        <div className={innerContainerClassName}>
          <CodeEditorHeader
            file={file}
            isSidebar={isSidebar}
            isFullscreen={isFullscreen}
            isMarkdownFile={isMarkdownFile}
            markdownPreview={markdownPreview}
            saving={saving}
            saveSuccess={saveSuccess}
            onToggleMarkdownPreview={() => setMarkdownPreview((previous) => !previous)}
            onOpenSettings={() => window.openSettings?.('appearance')}
            onDownload={handleDownload}
            onSave={handleSave}
            onToggleFullscreen={() => setIsFullscreen((previous) => !previous)}
            onClose={onClose}
            labels={{
              showingChanges: t('header.showingChanges'),
              editMarkdown: t('actions.editMarkdown'),
              previewMarkdown: t('actions.previewMarkdown'),
              settings: t('toolbar.settings'),
              download: t('actions.download'),
              save: t('actions.save'),
              saving: t('actions.saving'),
              saved: t('actions.saved'),
              fullscreen: t('actions.fullscreen'),
              exitFullscreen: t('actions.exitFullscreen'),
              close: t('actions.close'),
            }}
          />

          {saveError && (
            <div className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {saveError}
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <CodeEditorSurface
              content={content}
              onChange={setContent}
              markdownPreview={markdownPreview}
              isMarkdownFile={isMarkdownFile}
              isDarkMode={isDarkMode}
              fontSize={fontSize}
              showLineNumbers={showLineNumbers}
              extensions={extensions}
            />
          </div>

          <CodeEditorFooter
            content={content}
            linesLabel={t('footer.lines')}
            charactersLabel={t('footer.characters')}
            shortcutsLabel={t('footer.shortcuts')}
          />
        </div>
      </div>
    </>
  );
}
