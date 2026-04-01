/**
 * ContentSecurityPolicy — configures strict CSP for the renderer window.
 *
 * Key policy: connect-src 'none' — the renderer cannot make HTTP calls to
 * backend services directly. All data flows through IPC → main process.
 *
 * unsafe-inline is required for Tailwind CSS style injections.
 * data: is required for Mermaid SVG output rendered as data URIs.
 */

import { session } from 'electron';

export function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
          ].join('; '),
        ],
      },
    });
  });
}
