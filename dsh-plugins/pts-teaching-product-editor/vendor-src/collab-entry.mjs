// Build entry for the vendored collaboration bundle (Phase 2B).
// esbuild bundles Yjs + the official y-quill binding into one classic-script
// global file so the Classic-Script client can use them without a CDN.
import * as Y from 'yjs';
import { QuillBinding } from 'y-quill';

globalThis.Y = Y;
globalThis.QuillBinding = QuillBinding;
