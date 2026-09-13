import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

/**
 * Phase 3.5: bundles Monaco (and its base web worker) locally via Vite's
 * native `?worker` import instead of @monaco-editor/react's default CDN
 * loader (jsdelivr) -- that CDN is blocked by this environment's egress
 * policy, and depending on an external CDN for a core editor dependency
 * would be fragile in any deployment regardless.
 *
 * The worker specifier is `monaco-editor/editor/editor.worker`, not the
 * older `monaco-editor/esm/vs/editor/editor.worker` convention -- current
 * monaco-editor versions ship a package.json `exports` map
 * (`"./*": "./esm/vs/*.js"`) that only resolves the shorter form; the
 * longer one 404s (verified empirically -- it's what an earlier attempt
 * using a third-party bundler plugin built around the older convention
 * hit). Only the base editor worker is needed here: this editor only uses
 * the "csharp" language, which is Monarch-only (syntax highlighting, no
 * semantic language service / no dedicated worker of its own), and all
 * real diagnostics come from our own Roslyn-backed API, not from Monaco's
 * language services.
 */
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

loader.config({ monaco });
